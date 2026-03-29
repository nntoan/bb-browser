/**
 * site 命令 - 管理和运行社区/私有网站适配器
 *
 * 用法：
 *   bb-browser site list                      列出所有可用 site adapter
 *   bb-browser site search <query>            搜索
 *   bb-browser site <name> [args...]          运行（简写）
 *   bb-browser site run <name> [args...]      运行
 *   bb-browser site update                    更新Community adapters 库
 *
 * 目录：
 *   ~/.bb-browser/sites/       Private adapters (preferred)
 *   ~/.bb-browser/bb-sites/    Community adapters（bb-browser site update 拉取）
 */

import { generateId, type Request, type Response, type TabInfo } from "@bb-browser/shared";
import { handleJqResponse, sendCommand } from "../client.js";
import { getHistoryDomains } from "../history-sqlite.js";
import { ensureDaemonRunning } from "../daemon-manager.js";
import { readFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { join, relative } from "node:path";
import { homedir } from "node:os";
import { execSync } from "node:child_process";

const BB_DIR = join(homedir(), ".bb-browser");
const LOCAL_SITES_DIR = join(BB_DIR, "sites");
const COMMUNITY_SITES_DIR = join(BB_DIR, "bb-sites");
const COMMUNITY_REPO = "https://github.com/epiral/bb-sites.git";

function checkCliUpdate(): void {
  try {
    const current = execSync("bb-browser --version", { timeout: 3000, stdio: ["pipe", "pipe", "pipe"] }).toString().trim();
    const latest = execSync("npm view bb-browser version", { timeout: 5000, stdio: ["pipe", "pipe", "pipe"] }).toString().trim();
    if (latest && current && latest !== current && latest.localeCompare(current, undefined, { numeric: true }) > 0) {
      console.log(`\n📦 bb-browser ${latest} available (current: ${current}). Run: npm install -g bb-browser`);
    }
  } catch {}
}

export interface SiteOptions {
  json?: boolean;
  tabId?: number;
  days?: number;
  jq?: string;
  openclaw?: boolean;
}

/** Adapter 参数定义 */
interface ArgDef {
  required?: boolean;
  description?: string;
}

/** Adapter 元数据 */
interface SiteMeta {
  name: string;
  description: string;
  domain: string;
  args: Record<string, ArgDef>;
  capabilities?: string[];
  readOnly?: boolean;
  example?: string;
  filePath: string;
  source: "local" | "community";
}

interface HistoryDomain {
  domain: string;
  visits: number;
}

interface SiteRecommendation {
  domain: string;
  visits: number;
  adapterCount: number;
  adapters: Array<{
    name: string;
    description: string;
    example: string;
  }>;
}

function exitJsonError(error: string, extra: Record<string, unknown> = {}): never {
  console.log(JSON.stringify({ success: false, error, ...extra }, null, 2));
  process.exit(1);
}

/**
 * 从 JS 文件的 /* @meta JSON * / 块解析元数据
 */
function parseSiteMeta(filePath: string, source: "local" | "community"): SiteMeta | null {
  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }

  // 从文件路径推断默认 name
  const sitesDir = source === "local" ? LOCAL_SITES_DIR : COMMUNITY_SITES_DIR;
  const relPath = relative(sitesDir, filePath);
  const defaultName = relPath.replace(/\.js$/, "").replace(/\\/g, "/");

  // 解析 /* @meta { ... } */ 块
  const metaMatch = content.match(/\/\*\s*@meta\s*\n([\s\S]*?)\*\//);
  if (metaMatch) {
    try {
      const metaJson = JSON.parse(metaMatch[1]);
      return {
        name: metaJson.name || defaultName,
        description: metaJson.description || "",
        domain: metaJson.domain || "",
        args: metaJson.args || {},
        capabilities: metaJson.capabilities,
        readOnly: metaJson.readOnly,
        example: metaJson.example,
        filePath,
        source,
      };
    } catch {
      // JSON 解析失败，回退到 @tag 模式
    }
  }

  // 回退：解析 // @tag 格式（兼容旧格式）
  const meta: SiteMeta = {
    name: defaultName,
    description: "",
    domain: "",
    args: {},
    filePath,
    source,
  };

  const tagPattern = /\/\/\s*@(\w+)[ \t]+(.*)/g;
  let match;
  while ((match = tagPattern.exec(content)) !== null) {
    const [, key, value] = match;
    switch (key) {
      case "name": meta.name = value.trim(); break;
      case "description": meta.description = value.trim(); break;
      case "domain": meta.domain = value.trim(); break;
      case "args":
        for (const arg of value.trim().split(/[,\s]+/).filter(Boolean)) {
          meta.args[arg] = { required: true };
        }
        break;
      case "example": meta.example = value.trim(); break;
    }
  }

  return meta;
}

/**
 * 扫描目录下所有 .js 文件
 */
function scanSites(dir: string, source: "local" | "community"): SiteMeta[] {
  if (!existsSync(dir)) return [];
  const sites: SiteMeta[] = [];

  function walk(currentDir: string): void {
    let entries;
    try { entries = readdirSync(currentDir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith(".")) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".js")) {
        const meta = parseSiteMeta(fullPath, source);
        if (meta) sites.push(meta);
      }
    }
  }

  walk(dir);
  return sites;
}

/**
 * 根据 URL 检查yesno有对应的 site adapter，返回提示文本
 */
export function getSiteHintForDomain(url: string): string | null {
  try {
    const hostname = new URL(url).hostname;
    const sites = getAllSites();
    const matched = sites.filter(s => s.domain && (hostname === s.domain || hostname.endsWith("." + s.domain)));
    if (matched.length === 0) return null;
    const names = matched.map(s => s.name);
    const example = matched[0].example || `bb-browser site ${names[0]}`;
    return `This website has ${names.length} site adapters for direct data access. Try: ${example}`;
  } catch {
    return null;
  }
}

/**
 * 获取所有 adapter（私有优先）
 */
function getAllSites(): SiteMeta[] {
  const community = scanSites(COMMUNITY_SITES_DIR, "community");
  const local = scanSites(LOCAL_SITES_DIR, "local");

  const byName = new Map<string, SiteMeta>();
  for (const s of community) byName.set(s.name, s);
  for (const s of local) byName.set(s.name, s);

  return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * 精确匹配 tab 的 origin
 */
function matchTabOrigin(tabUrl: string, domain: string): boolean {
  try {
    const tabOrigin = new URL(tabUrl).hostname;
    return tabOrigin === domain || tabOrigin.endsWith("." + domain);
  } catch {
    return false;
  }
}

// ── 子命令 ──────────────────────────────────────────────────────

function siteList(options: SiteOptions): void {
  const sites = getAllSites();

  if (sites.length === 0) {
    if (options.json) {
      console.log("[]");
      return;
    }
    console.log("No site adapters found.");
    console.log("  Install community adapters: bb-browser site update");
    console.log(`  Private adapter directory: ${LOCAL_SITES_DIR}`);
    return;
  }

  if (options.json) {
    console.log(JSON.stringify(sites.map(s => ({
      name: s.name, description: s.description, domain: s.domain,
      args: s.args, source: s.source,
    })), null, 2));
    return;
  }

  const groups = new Map<string, SiteMeta[]>();
  for (const s of sites) {
    const platform = s.name.split("/")[0];
    if (!groups.has(platform)) groups.set(platform, []);
    groups.get(platform)!.push(s);
  }

  for (const [platform, items] of groups) {
    console.log(`\n${platform}/`);
    for (const s of items) {
      const cmd = s.name.split("/").slice(1).join("/");
      const src = s.source === "local" ? " (local)" : "";
      const desc = s.description ? ` - ${s.description}` : "";
      console.log(`  ${cmd.padEnd(20)}${desc}${src}`);
    }
  }
  console.log();
}

function siteSearch(query: string, options: SiteOptions): void {
  const sites = getAllSites();
  const q = query.toLowerCase();
  const matches = sites.filter(s =>
    s.name.toLowerCase().includes(q) ||
    s.description.toLowerCase().includes(q) ||
    s.domain.toLowerCase().includes(q)
  );

  if (matches.length === 0) {
    if (options.json) {
      console.log("[]");
      return;
    }
    console.log(`No adapters matching "${query}" were found.`);
    console.log("  View all: bb-browser site list");
    return;
  }

  if (options.json) {
    console.log(JSON.stringify(matches.map(s => ({
      name: s.name, description: s.description, domain: s.domain, source: s.source,
    })), null, 2));
    return;
  }

  for (const s of matches) {
    const src = s.source === "local" ? " (local)" : "";
    console.log(`${s.name.padEnd(24)} ${s.description}${src}`);
  }
}

function siteUpdate(options: SiteOptions = {}): void {
  mkdirSync(BB_DIR, { recursive: true });
  const updateMode = existsSync(join(COMMUNITY_SITES_DIR, ".git")) ? "pull" : "clone";

  if (updateMode === "pull") {
    if (!options.json) {
      console.log("Updating community site adapter repository...");
    }
    try {
      execSync("git pull --ff-only", { cwd: COMMUNITY_SITES_DIR, stdio: "pipe" });
      if (!options.json) {
        console.log("Update complete.");
        console.log("");
        console.log("💡 Run bb-browser site recommend to discover adapters matching your browsing habits");
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const manualAction = "cd ~/.bb-browser/bb-sites && git pull";
      if (options.json) {
        exitJsonError(`Update failed: ${message}`, { action: manualAction, updateMode });
      }
      console.error(`Update failed: ${e instanceof Error ? e.message : e}`);
      console.error("  Manual fix: cd ~/.bb-browser/bb-sites && git pull");
      process.exit(1);
    }
  } else {
    if (!options.json) {
      console.log(`Cloning community adapter repository: ${COMMUNITY_REPO}`);
    }
    try {
      execSync(`git clone ${COMMUNITY_REPO} ${COMMUNITY_SITES_DIR}`, { stdio: "pipe" });
      if (!options.json) {
        console.log("Clone complete.");
        console.log("");
        console.log("💡 Run bb-browser site recommend to discover adapters matching your browsing habits");
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const manualAction = `git clone ${COMMUNITY_REPO} ~/.bb-browser/bb-sites`;
      if (options.json) {
        exitJsonError(`Clone failed: ${message}`, { action: manualAction, updateMode });
      }
      console.error(`Clone failed: ${e instanceof Error ? e.message : e}`);
      console.error(`  Manual fix: git clone ${COMMUNITY_REPO} ~/.bb-browser/bb-sites`);
      process.exit(1);
    }
  }

  const sites = scanSites(COMMUNITY_SITES_DIR, "community");
  if (options.json) {
    console.log(JSON.stringify({
      success: true,
      updateMode,
      communityRepo: COMMUNITY_REPO,
      communityDir: COMMUNITY_SITES_DIR,
      siteCount: sites.length,
    }, null, 2));
    return;
  }

  console.log(`Installed ${sites.length} community adapters.`);
  console.log(`⭐ Like bb-browser? → bb-browser star`);

  // Check for CLI updates
  checkCliUpdate();
}

function findSiteByName(name: string): SiteMeta | undefined {
  return getAllSites().find((site) => site.name === name);
}

function siteInfo(name: string, options: SiteOptions): void {
  const site = findSiteByName(name);

  if (!site) {
    if (options.json) {
      exitJsonError(`adapter "${name}" not found`, { action: "bb-browser site list" });
    }
    console.error(`[error] site info: adapter "${name}" not found.`);
    console.error("  Try: bb-browser site list");
    process.exit(1);
  }

  const meta = {
    name: site.name,
    description: site.description,
    domain: site.domain,
    args: site.args,
    example: site.example,
    readOnly: site.readOnly,
  };

  if (options.json) {
    console.log(JSON.stringify(meta, null, 2));
    return;
  }

  console.log(`${site.name} — ${site.description}`);
  console.log();
  console.log("Arguments:");

  const argEntries = Object.entries(site.args);
  if (argEntries.length === 0) {
    console.log("  (none)");
  } else {
    for (const [argName, argDef] of argEntries) {
      const requiredText = argDef.required ? "required" : "optional";
      const description = argDef.description || "";
      console.log(`  ${argName} (${requiredText})    ${description}`.trimEnd());
    }
  }

  console.log();
  console.log("Example:");
  console.log(`  ${site.example || `bb-browser site ${site.name}`}`);
  console.log();
  console.log(`Domain: ${site.domain || "(not declared)"}`);
  console.log(`Read-only: ${site.readOnly ? "yes" : "no"}`);
}

async function siteRecommend(options: SiteOptions): Promise<void> {
  const days = options.days ?? 30;
  const historyDomains: HistoryDomain[] = getHistoryDomains(days);
  const sites = getAllSites();
  const sitesByDomain = new Map<string, SiteMeta[]>();

  for (const site of sites) {
    if (!site.domain) continue;
    const domain = site.domain.toLowerCase();
    const existing = sitesByDomain.get(domain) || [];
    existing.push(site);
    sitesByDomain.set(domain, existing);
  }

  const available: SiteRecommendation[] = [];
  const notAvailable: HistoryDomain[] = [];

  for (const item of historyDomains) {
    const adapters = sitesByDomain.get(item.domain.toLowerCase());
    if (adapters && adapters.length > 0) {
      const sortedAdapters = [...adapters].sort((a, b) => a.name.localeCompare(b.name));
      available.push({
        domain: item.domain,
        visits: item.visits,
        adapterCount: sortedAdapters.length,
        adapters: sortedAdapters.map((site) => ({
          name: site.name,
          description: site.description,
          example: site.example || `bb-browser site ${site.name}`,
        })),
      });
    } else if (item.visits >= 5 && item.domain && !item.domain.includes('localhost') && item.domain.includes('.')) {
      notAvailable.push(item);
    }
  }

  const jsonData = {
    days,
    available,
    not_available: notAvailable,
  };

  if (options.jq) {
    handleJqResponse({ id: generateId(), success: true, data: jsonData as any });
  }

  if (options.json) {
    console.log(JSON.stringify(jsonData, null, 2));
    return;
  }

  console.log(`Based on your recent ${days} days of browsing history:`);
  console.log();

  console.log("🎯 Frequently used sites with available adapters:");
  console.log();
  if (available.length === 0) {
    console.log("  (no matching adapters yet)");
  } else {
    for (const item of available) {
      console.log(`  ${item.domain.padEnd(20)} ${item.visits} visits    ${item.adapterCount} commands`);
      console.log(`    Try: ${item.adapters[0]?.example || `bb-browser site ${item.adapters[0]?.name || ""}`}`);
      console.log();
    }
  }

  console.log("📋 Frequently used sites without adapters:");
  console.log();
  if (notAvailable.length === 0) {
    console.log("  (none)");
  } else {
    for (const item of notAvailable) {
      console.log(`  ${item.domain.padEnd(20)} ${item.visits} visits`);
    }
  }

  console.log();
  console.log('💡 Tell your AI agent "turn notion.so into a CLI", and it can automate it.');
  console.log();
  console.log(`All analysis is done locally. Use --days 7 to view only the last week.`);
}

async function siteRun(
  name: string,
  args: string[],
  options: SiteOptions
): Promise<void> {
  const sites = getAllSites();
  const site = sites.find(s => s.name === name);

  if (!site) {
    const fuzzy = sites.filter(s => s.name.includes(name));
    if (options.json) {
      exitJsonError(`site "${name}" not found`, {
        suggestions: fuzzy.slice(0, 5).map(s => s.name),
        action: fuzzy.length > 0 ? undefined : "bb-browser site update",
      });
    }
    console.error(`[error] site: "${name}" not found.`);
    if (fuzzy.length > 0) {
      console.error("  Did you mean:");
      for (const s of fuzzy.slice(0, 5)) {
        console.error(`    bb-browser site ${s.name}`);
      }
    } else {
      console.error("  Try: bb-browser site list");
      console.error("  Or:  bb-browser site update");
    }
    process.exit(1);
  }

  // 解析参数
  const argNames = Object.keys(site.args);
  const argMap: Record<string, string> = {};

  // 过滤掉 --flag value 对，收集位置参数
  const positionalArgs: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const flagName = args[i].slice(2);
      if (flagName in site.args && args[i + 1]) {
        argMap[flagName] = args[i + 1];
        i++; // 跳过值
      }
    } else {
      positionalArgs.push(args[i]);
    }
  }

  // 位置参数按 argNames 顺序填入（跳过已通过 --flag 提供的）
  let posIdx = 0;
  for (const argName of argNames) {
    if (!argMap[argName] && posIdx < positionalArgs.length) {
      argMap[argName] = positionalArgs[posIdx++];
    }
  }

  // 只检查 required 参数
  for (const [argName, argDef] of Object.entries(site.args)) {
    if (argDef.required && !argMap[argName]) {
      const usage = argNames.map(a => {
        const def = site.args[a];
        return def.required ? `<${a}>` : `[${a}]`;
      }).join(" ");
      if (options.json) {
        exitJsonError(`missing required argument "${argName}"`, {
          usage: `bb-browser site ${name} ${usage}`,
          example: site.example,
        });
      }
      console.error(`[error] site ${name}: missing required argument "${argName}".`);
      console.error(`  Usage: bb-browser site ${name} ${usage}`);
      if (site.example) console.error(`  Example: ${site.example}`);
      process.exit(1);
    }
  }

  // 读取并解析 JS
  const jsContent = readFileSync(site.filePath, "utf-8");

  // 移除 /* @meta ... */ 块，保留函数体
  const jsBody = jsContent.replace(/\/\*\s*@meta[\s\S]*?\*\//, "").trim();

  // 构造执行脚本
  const argsJson = JSON.stringify(argMap);
  const script = `(${jsBody})(${argsJson})`;

  if (options.openclaw) {
    const { ocGetTabs, ocFindTabByDomain, ocOpenTab, ocEvaluate } = await import("../openclaw-bridge.js");

    let targetId: string;

    if (site.domain) {
      const tabs = ocGetTabs();
      const existing = ocFindTabByDomain(tabs, site.domain);
      if (existing) {
        targetId = existing.targetId;
      } else {
        targetId = ocOpenTab(`https://${site.domain}`);
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    } else {
      const tabs = ocGetTabs();
      if (tabs.length === 0) {
        throw new Error("No tabs open in OpenClaw browser");
      }
      targetId = tabs[0].targetId;
    }

    const wrappedFn = `async () => { const __fn = ${jsBody}; return await __fn(${argsJson}); }`;
    const parsed = ocEvaluate(targetId, wrappedFn);

    if (typeof parsed === "object" && parsed !== null && "error" in parsed) {
      const errObj = parsed as { error: string; hint?: string };
      const checkText = `${errObj.error} ${errObj.hint || ""}`;
      const isAuthError = /401|403|unauthorized|forbidden|not.?logged|login.?required|sign.?in|auth/i.test(checkText);
      const loginHint = isAuthError && site.domain
        ? `Please log in to https://${site.domain} in your OpenClaw browser first, then retry.`
        : undefined;
      const hint = loginHint || errObj.hint;
      const reportHint = `If this is an adapter bug, report via: gh issue create --repo epiral/bb-sites --title "[${name}] <description>" OR: bb-browser site github/issue-create epiral/bb-sites --title "[${name}] <description>"`;

      if (options.json) {
        console.log(JSON.stringify({ id: "openclaw", success: false, error: errObj.error, hint, reportHint }));
      } else {
        console.error(`[error] site ${name}: ${errObj.error}`);
        if (hint) console.error(`  Hint: ${hint}`);
        console.error(`  Report: gh issue create --repo epiral/bb-sites --title "[${name}] ..."`);
        console.error(`     or: bb-browser site github/issue-create epiral/bb-sites --title "[${name}] ..."`);
      }
      process.exit(1);
    }

    if (options.jq) {
      const { applyJq } = await import("../jq.js");
      const expr = options.jq.replace(/^\.data\./, '.');
      const results = applyJq(parsed, expr);
      for (const r of results) {
        console.log(typeof r === "string" ? r : JSON.stringify(r));
      }
    } else if (options.json) {
      console.log(JSON.stringify({ id: "openclaw", success: true, data: parsed }));
    } else {
      console.log(JSON.stringify(parsed, null, 2));
    }
    return;
  }

  await ensureDaemonRunning();

  // 确定目标 tab
  let targetTabId: number | undefined = options.tabId;

  // 如果用户没指定 --tab，自动查找匹配域名的 tab
  if (!targetTabId && site.domain) {
    const listReq: Request = { id: generateId(), action: "tab_list" };
    const listResp: Response = await sendCommand(listReq);

    if (listResp.success && listResp.data?.tabs) {
      const matchingTab = listResp.data.tabs.find((tab: TabInfo) =>
        matchTabOrigin(tab.url, site.domain)
      );
      if (matchingTab) {
        targetTabId = matchingTab.tabId;
      }
    }

    if (!targetTabId) {
      const newResp = await sendCommand({
        id: generateId(),
        action: "tab_new",
        url: `https://${site.domain}`,
      });
      targetTabId = newResp.data?.tabId;
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }

  // 执行
  const evalReq: Request = { id: generateId(), action: "eval", script, tabId: targetTabId };
  const evalResp: Response = await sendCommand(evalReq);

  if (!evalResp.success) {
    const hint = site.domain
      ? `Open https://${site.domain} in your browser, make sure you are logged in, then retry.`
      : undefined;
    if (options.json) {
      console.log(JSON.stringify({ id: evalReq.id, success: false, error: evalResp.error || "eval failed", hint }));
    } else {
      console.error(`[error] site ${name}: ${evalResp.error || "eval failed"}`);
      if (hint) console.error(`  Hint: ${hint}`);
    }
    process.exit(1);
  }

  const result = evalResp.data?.result;
  if (result === undefined || result === null) {
    if (options.json) {
      console.log(JSON.stringify({ id: evalReq.id, success: true, data: null }));
    } else {
      console.log("(no output)");
    }
    return;
  }

  // 解析输出
  let parsed: unknown;
  try {
    parsed = typeof result === "string" ? JSON.parse(result) : result;
  } catch {
    parsed = result;
  }

  // 检查 adapter 返回的 error
  if (typeof parsed === "object" && parsed !== null && "error" in parsed) {
    const errObj = parsed as { error: string; hint?: string };

    // 检测yesno为登录问题（检查 error 和 hint 文本）
    const checkText = `${errObj.error} ${errObj.hint || ""}`;
    const isAuthError = /401|403|unauthorized|forbidden|not.?logged|login.?required|sign.?in|auth/i.test(checkText);
    const loginHint = isAuthError && site.domain
      ? `Please log in to https://${site.domain} in your browser first, then retry.`
      : undefined;
    const hint = loginHint || errObj.hint;
    const reportHint = `If this is an adapter bug, report via: gh issue create --repo epiral/bb-sites --title "[${name}] <description>" OR: bb-browser site github/issue-create epiral/bb-sites --title "[${name}] <description>"`;

    if (options.json) {
      console.log(JSON.stringify({ id: evalReq.id, success: false, error: errObj.error, hint, reportHint }));
    } else {
      console.error(`[error] site ${name}: ${errObj.error}`);
      if (hint) console.error(`  Hint: ${hint}`);
      console.error(`  Report: gh issue create --repo epiral/bb-sites --title "[${name}] ..."`);
      console.error(`     or: bb-browser site github/issue-create epiral/bb-sites --title "[${name}] ..."`);
    }
    process.exit(1);
  }

  if (options.jq) {
    const { applyJq } = await import("../jq.js");
    // Tolerate ".data." prefix — Agent may copy from --json envelope structure
    const expr = options.jq.replace(/^\.data\./, '.');
    const results = applyJq(parsed, expr);
    for (const r of results) {
      console.log(typeof r === "string" ? r : JSON.stringify(r));
    }
  } else if (options.json) {
    console.log(JSON.stringify({ id: evalReq.id, success: true, data: parsed }));
  } else {
    console.log(JSON.stringify(parsed, null, 2));
  }
}

// ── 入口 ────────────────────────────────────────────────────────

export async function siteCommand(
  args: string[],
  options: SiteOptions = {}
): Promise<void> {
  const subCommand = args[0];

  if (!subCommand || subCommand === "--help" || subCommand === "-h") {
    console.log(`bb-browser site - Website CLI adapter manager and runner

用法:
  bb-browser site list                      List all available adapters
  bb-browser site info <name>               View adapter metadata
  bb-browser site recommend                 Recommend adapters based on history
  bb-browser site search <query>            Search adapters
  bb-browser site <name> [args...]          Run adapter (shorthand)
  bb-browser site run <name> [args...]      Run adapter
  bb-browser site update                    Update community adapter repository (git clone/pull)

Directories:
  ${LOCAL_SITES_DIR}      Private adapters (preferred)
  ${COMMUNITY_SITES_DIR}   Community adapters

Examples:
  bb-browser site update
  bb-browser site list
  bb-browser site reddit/thread https://www.reddit.com/r/LocalLLaMA/comments/...
  bb-browser site twitter/user yan5xu
  bb-browser site search reddit

Create a new adapter: bb-browser guide
Report issues: gh issue create --repo epiral/bb-sites --title "[adapter-name] description"
Contribute to community: https://github.com/epiral/bb-sites`);
    return;
  }

  switch (subCommand) {
    case "list":   siteList(options); break;
    case "search":
      if (!args[1]) {
        console.error("[error] site search: <query> is required.");
        console.error("  Usage: bb-browser site search <query>");
        process.exit(1);
      }
      siteSearch(args[1], options);
      break;
    case "info":
      if (!args[1]) {
        console.error("[error] site info: <name> is required.");
        console.error("  Usage: bb-browser site info <name>");
        process.exit(1);
      }
      siteInfo(args[1], options);
      break;
    case "recommend":
      await siteRecommend(options);
      break;
    case "update":  siteUpdate(options); break;
    case "run":
      if (!args[1]) {
        console.error("[error] site run: <name> is required.");
        console.error("  Usage: bb-browser site run <name> [args...]");
        console.error("  Try: bb-browser site list");
        process.exit(1);
      }
      await siteRun(args[1], args.slice(2), options);
      break;
    default:
      if (subCommand.includes("/")) {
        await siteRun(subCommand, args.slice(1), options);
      } else {
        console.error(`[error] site: unknown subcommand "${subCommand}".`);
        console.error("  Available: list, info, recommend, search, run, update");
        console.error("  Try: bb-browser site --help");
        process.exit(1);
      }
      break;
  }

  // 静默后台更新Community adapters
  silentUpdate();
}

function silentUpdate(): void {
  const gitDir = join(COMMUNITY_SITES_DIR, ".git");
  if (!existsSync(gitDir)) return;
  import("node:child_process").then(({ spawn }) => {
    const child = spawn("git", ["pull", "--ff-only"], {
      cwd: COMMUNITY_SITES_DIR,
      stdio: "ignore",
      detached: true,
    });
    child.unref();
  }).catch(() => {});
}
