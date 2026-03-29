/**
 * bb-browser CLI 入口
 */

import { fileURLToPath } from "node:url";
import { openCommand } from "./commands/open.js";
import { snapshotCommand } from "./commands/snapshot.js";
import { clickCommand } from "./commands/click.js";
import { hoverCommand } from "./commands/hover.js";
import { fillCommand } from "./commands/fill.js";
import { typeCommand } from "./commands/type.js";
import { closeCommand } from "./commands/close.js";
import { getCommand, type GetAttribute } from "./commands/get.js";
import { screenshotCommand } from "./commands/screenshot.js";
import { waitCommand } from "./commands/wait.js";
import { pressCommand } from "./commands/press.js";
import { scrollCommand } from "./commands/scroll.js";
import { backCommand, forwardCommand, refreshCommand } from "./commands/nav.js";
import { checkCommand, uncheckCommand } from "./commands/check.js";
import { selectCommand } from "./commands/select.js";
import { evalCommand } from "./commands/eval.js";
import { tabCommand } from "./commands/tab.js";
import { frameCommand, frameMainCommand } from "./commands/frame.js";
import { dialogCommand } from "./commands/dialog.js";
import { networkCommand } from "./commands/network.js";
import { consoleCommand } from "./commands/console.js";
import { errorsCommand } from "./commands/errors.js";
import { traceCommand } from "./commands/trace.js";
import { fetchCommand } from "./commands/fetch.js";
import { siteCommand } from "./commands/site.js";
import { historyCommand } from "./commands/history.js";
import { statusCommand } from "./commands/daemon.js";
import { setJqExpression } from "./client.js";

declare const __BB_BROWSER_VERSION__: string;

const VERSION = __BB_BROWSER_VERSION__;

const HELP_TEXT = `
bb-browser - Browser automation for AI agents

Install:
  npm install -g bb-browser

Tip: For most data-fetch tasks, use site commands directly instead of manual browser actions:
  bb-browser site list                    List all available adapters
  bb-browser site twitter/search "AI"     Example: search tweets
  bb-browser site xueqiu/hot-stock 5      Example: get hot stocks

Usage:
  bb-browser <command> [options]

Getting started:
  site recommend               Recommend adapters based on browsing history
  site list                    List all adapters
  site info <name>             Show adapter usage (args, return fields, examples)
  site <name> [args]           Run adapter
  site update                  Update community adapter repository
  guide                        Learn how to turn any website into an adapter
  star                         ⭐ Star bb-browser on GitHub

Browser actions:
  open <url> [--tab]           Open URL
  snapshot [-i] [-c] [-d <n>]  Get page snapshot
  click <ref>                  Click element
  hover <ref>                  Hover element
  fill <ref> <text>            Fill input (clear then type)
  type <ref> <text>            Type character by character (without clearing)
  check/uncheck <ref>          Check/uncheck checkbox
  select <ref> <val>           Select dropdown option
  press <key>                  Send keyboard input
  scroll <dir> [px]            Scroll page

Page info:
  get text|url|title <ref>     Get page content
  screenshot [path]            Take screenshot
  eval "<js>"                  Execute JavaScript
  fetch <url>                  HTTP request with browser login state

Tabs:
  tab [list|new|close|<n>]     Manage tabs
  status                       Show managed browser status

Navigation:
  back / forward / refresh     Navigate back / forward / refresh

Debugging:
  network requests [filter]    Show network requests
  console [--clear]            Show/clear console messages
  errors [--clear]             Show/clear JS errors
  trace start|stop|status      Record user actions
  history search|domains       Show browsing history

Options:
  --json               Output as JSON
  --port <n>           Set Chrome CDP port
  --openclaw           Prefer reusing OpenClaw browser instance
  --jq <expr>          Apply jq filter on JSON output (directly on data, skips id/success envelope)
  -i, --interactive    Output interactive elements only (snapshot)
  -c, --compact        Remove empty structural nodes (snapshot)
  -d, --depth <n>      Limit tree depth (snapshot)
  -s, --selector <sel> Restrict CSS selector scope (snapshot)
  --tab <tabId>        Specify target tab ID
  --mcp                Start MCP server (for Claude Code / Cursor and other AI tools)
  --help, -h           Show help
  --version, -v        Show version
`.trim();

interface ParsedArgs {
  command: string | null;
  args: string[];
  flags: {
    json: boolean;
    help: boolean;
    version: boolean;
    interactive: boolean;
    compact: boolean;
    depth?: number;
    selector?: string;
    tab?: string;
    days?: number;
    jq?: string;
    openclaw?: boolean;
    port?: number;
  };
}

/**
 * 解析命令行参数
 */
function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2); // 跳过 node 和脚本路径

  const result: ParsedArgs = {
    command: null,
    args: [],
    flags: {
      json: false,
      help: false,
      version: false,
      interactive: false,
      compact: false,
    },
  };

  let skipNext = false;
  for (const arg of args) {
    if (skipNext) {
      skipNext = false;
      continue;
    }
    if (arg === "--json") {
      result.flags.json = true;
    } else if (arg === "--jq") {
      skipNext = true;
      const nextIdx = args.indexOf(arg) + 1;
      if (nextIdx < args.length) {
        result.flags.jq = args[nextIdx];
        result.flags.json = true;
      }
    } else if (arg === "--openclaw") {
      result.flags.openclaw = true;
    } else if (arg === "--port") {
      skipNext = true;
      const nextIdx = args.indexOf(arg) + 1;
      if (nextIdx < args.length) {
        result.flags.port = parseInt(args[nextIdx], 10);
      }
    } else if (arg === "--help" || arg === "-h") {
      result.flags.help = true;
    } else if (arg === "--version" || arg === "-v") {
      result.flags.version = true;
    } else if (arg === "--interactive" || arg === "-i") {
      result.flags.interactive = true;
    } else if (arg === "--compact" || arg === "-c") {
      result.flags.compact = true;
    } else if (arg === "--depth" || arg === "-d") {
      skipNext = true;
      const nextIdx = args.indexOf(arg) + 1;
      if (nextIdx < args.length) {
        result.flags.depth = parseInt(args[nextIdx], 10);
      }
    } else if (arg === "--selector" || arg === "-s") {
      skipNext = true;
      const nextIdx = args.indexOf(arg) + 1;
      if (nextIdx < args.length) {
        result.flags.selector = args[nextIdx];
      }
    } else if (arg === "--days") {
      skipNext = true;
      const nextIdx = args.indexOf(arg) + 1;
      if (nextIdx < args.length) {
        result.flags.days = parseInt(args[nextIdx], 10);
      }
    } else if (arg === "--id") {
      // --id 及其值由子命令通过 process.argv 自行解析，这里跳过
      skipNext = true;
    } else if (arg === "--tab") {
      // --tab 参数及其值，无论出现在命令前后都跳过
      skipNext = true;
    } else if (arg.startsWith("-")) {
      // 未知选项，忽略
    } else if (result.command === null) {
      result.command = arg;
    } else {
      result.args.push(arg);
    }
  }

  return result;
}

/**
 * 主函数
 */
async function main(): Promise<void> {
  const parsed = parseArgs(process.argv);
  setJqExpression(parsed.flags.jq);

  // 解析全局 --tab 参数
  const tabArgIdx = process.argv.indexOf('--tab');
  const globalTabId = tabArgIdx >= 0 && process.argv[tabArgIdx + 1]
    ? parseInt(process.argv[tabArgIdx + 1], 10)
    : undefined;

  // 处理全局选项
  if (parsed.flags.version) {
    console.log(VERSION);
    return;
  }

  if (process.argv.includes("--mcp")) {
    const mcpPath = fileURLToPath(new URL("./mcp.js", import.meta.url));
    const { spawn } = await import("node:child_process");
    const child = spawn(process.execPath, [mcpPath], { stdio: "inherit" });
    child.on("exit", (code) => process.exit(code ?? 0));
    return;
  }

  if (parsed.flags.help || !parsed.command) {
    console.log(HELP_TEXT);
    return;
  }

  // 路由到对应命令
  try {
    switch (parsed.command) {
      case "open": {
        const url = parsed.args[0];
        if (!url) {
          console.error("Error: missing URL argument");
          console.error("Usage: bb-browser open <url> [--tab current|<tabId>]");
          process.exit(1);
        }
        // 解析 --tab 参数
        const tabIndex = process.argv.findIndex(a => a === "--tab");
        const tab = tabIndex >= 0 ? process.argv[tabIndex + 1] : undefined;
        await openCommand(url, { json: parsed.flags.json, tab });
        break;
      }

      case "snapshot": {
        await snapshotCommand({
          json: parsed.flags.json,
          interactive: parsed.flags.interactive,
          compact: parsed.flags.compact,
          maxDepth: parsed.flags.depth,
          selector: parsed.flags.selector,
          tabId: globalTabId,
        });
        break;
      }

      case "click": {
        const ref = parsed.args[0];
        if (!ref) {
          console.error("Error: missing ref argument");
          console.error("Usage: bb-browser click <ref>");
          console.error("Example: bb-browser click @5");
          process.exit(1);
        }
        await clickCommand(ref, { json: parsed.flags.json, tabId: globalTabId });
        break;
      }

      case "hover": {
        const ref = parsed.args[0];
        if (!ref) {
          console.error("Error: missing ref argument");
          console.error("Usage: bb-browser hover <ref>");
          console.error("Example: bb-browser hover @5");
          process.exit(1);
        }
        await hoverCommand(ref, { json: parsed.flags.json, tabId: globalTabId });
        break;
      }

      case "check": {
        const ref = parsed.args[0];
        if (!ref) {
          console.error("Error: missing ref argument");
          console.error("Usage: bb-browser check <ref>");
          console.error("Example: bb-browser check @5");
          process.exit(1);
        }
        await checkCommand(ref, { json: parsed.flags.json, tabId: globalTabId });
        break;
      }

      case "uncheck": {
        const ref = parsed.args[0];
        if (!ref) {
          console.error("Error: missing ref argument");
          console.error("Usage: bb-browser uncheck <ref>");
          console.error("Example: bb-browser uncheck @5");
          process.exit(1);
        }
        await uncheckCommand(ref, { json: parsed.flags.json, tabId: globalTabId });
        break;
      }

      case "fill": {
        const ref = parsed.args[0];
        const text = parsed.args[1];
        if (!ref) {
          console.error("Error: missing ref argument");
          console.error("Usage: bb-browser fill <ref> <text>");
          console.error('Example: bb-browser fill @3 "hello world"');
          process.exit(1);
        }
        if (text === undefined) {
          console.error("Error: missing text argument");
          console.error("Usage: bb-browser fill <ref> <text>");
          console.error('Example: bb-browser fill @3 "hello world"');
          process.exit(1);
        }
        await fillCommand(ref, text, { json: parsed.flags.json, tabId: globalTabId });
        break;
      }

      case "type": {
        const ref = parsed.args[0];
        const text = parsed.args[1];
        if (!ref) {
          console.error("Error: missing ref argument");
          console.error("Usage: bb-browser type <ref> <text>");
          console.error('Example: bb-browser type @3 "append text"');
          process.exit(1);
        }
        if (text === undefined) {
          console.error("Error: missing text argument");
          console.error("Usage: bb-browser type <ref> <text>");
          console.error('Example: bb-browser type @3 "append text"');
          process.exit(1);
        }
        await typeCommand(ref, text, { json: parsed.flags.json, tabId: globalTabId });
        break;
      }

      case "select": {
        const ref = parsed.args[0];
        const value = parsed.args[1];
        if (!ref) {
          console.error("Error: missing ref argument");
          console.error("Usage: bb-browser select <ref> <value>");
          console.error('Example: bb-browser select @4 "option1"');
          process.exit(1);
        }
        if (value === undefined) {
          console.error("Error: missing value argument");
          console.error("Usage: bb-browser select <ref> <value>");
          console.error('Example: bb-browser select @4 "option1"');
          process.exit(1);
        }
        await selectCommand(ref, value, { json: parsed.flags.json, tabId: globalTabId });
        break;
      }

      case "eval": {
        const script = parsed.args[0];
        if (!script) {
          console.error("Error: missing script argument");
          console.error("Usage: bb-browser eval <script>");
          console.error('Example: bb-browser eval "document.title"');
          process.exit(1);
        }
        await evalCommand(script, { json: parsed.flags.json, tabId: globalTabId });
        break;
      }

      case "get": {
        const attribute = parsed.args[0] as GetAttribute | undefined;
        if (!attribute) {
          console.error("Error: missing attribute argument");
          console.error("Usage: bb-browser get <text|url|title> [ref]");
          console.error("Example: bb-browser get text @5");
          console.error("      bb-browser get url");
          process.exit(1);
        }
        if (!["text", "url", "title"].includes(attribute)) {
          console.error(`Error: unknown attribute "${attribute}"`);
          console.error("Supported attributes: text, url, title");
          process.exit(1);
        }
        const ref = parsed.args[1];
        await getCommand(attribute, ref, { json: parsed.flags.json, tabId: globalTabId });
        break;
      }

      case "daemon":

      case "close": {
        await closeCommand({ json: parsed.flags.json, tabId: globalTabId });
        break;
      }

      case "back": {
        await backCommand({ json: parsed.flags.json, tabId: globalTabId });
        break;
      }

      case "forward": {
        await forwardCommand({ json: parsed.flags.json, tabId: globalTabId });
        break;
      }

      case "refresh": {
        await refreshCommand({ json: parsed.flags.json, tabId: globalTabId });
        break;
      }

      case "screenshot": {
        const outputPath = parsed.args[0];
        await screenshotCommand(outputPath, { json: parsed.flags.json, tabId: globalTabId });
        break;
      }

      case "wait": {
        const target = parsed.args[0];
        if (!target) {
          console.error("Error: missing wait target argument");
          console.error("Usage: bb-browser wait <ms|@ref>");
          console.error("Example: bb-browser wait 2000");
          console.error("      bb-browser wait @5");
          process.exit(1);
        }
        await waitCommand(target, { json: parsed.flags.json, tabId: globalTabId });
        break;
      }

      case "press": {
        const key = parsed.args[0];
        if (!key) {
          console.error("Error: missing key argument");
          console.error("Usage: bb-browser press <key>");
          console.error("Example: bb-browser press Enter");
          console.error("      bb-browser press Control+a");
          process.exit(1);
        }
        await pressCommand(key, { json: parsed.flags.json, tabId: globalTabId });
        break;
      }

      case "scroll": {
        const direction = parsed.args[0];
        const pixels = parsed.args[1]; // 传 string，scrollCommand 内部解析
        if (!direction) {
          console.error("Error: missing direction argument");
          console.error("Usage: bb-browser scroll <up|down|left|right> [pixels]");
          console.error("Example: bb-browser scroll down");
          console.error("      bb-browser scroll up 500");
          process.exit(1);
        }
        await scrollCommand(direction, pixels, { json: parsed.flags.json, tabId: globalTabId });
        break;
      }

      case "tab": {
        await tabCommand(parsed.args, { json: parsed.flags.json });
        break;
      }

      case "status": {
        await statusCommand({ json: parsed.flags.json });
        break;
      }

      case "frame": {
        const selectorOrMain = parsed.args[0];
        if (!selectorOrMain) {
          console.error("Error: missing selector argument");
          console.error("Usage: bb-browser frame <selector>");
          console.error('Example: bb-browser frame "iframe#editor"');
          console.error("      bb-browser frame main");
          process.exit(1);
        }
        if (selectorOrMain === "main") {
          await frameMainCommand({ json: parsed.flags.json, tabId: globalTabId });
        } else {
          await frameCommand(selectorOrMain, { json: parsed.flags.json, tabId: globalTabId });
        }
        break;
      }

      case "dialog": {
        const subCommand = parsed.args[0];
        if (!subCommand) {
          console.error("Error: missing subcommand");
          console.error("Usage: bb-browser dialog <accept|dismiss> [text]");
          console.error("Example: bb-browser dialog accept");
          console.error('      bb-browser dialog accept "my input"');
          console.error("      bb-browser dialog dismiss");
          process.exit(1);
        }
        const promptText = parsed.args[1]; // accept 时optional的 prompt 文本
        await dialogCommand(subCommand, promptText, { json: parsed.flags.json, tabId: globalTabId });
        break;
      }

      case "network": {
        const subCommand = parsed.args[0] || "requests";
        const urlOrFilter = parsed.args[1];
        // 解析 network 特有的选项
        const abort = process.argv.includes("--abort");
        const withBody = process.argv.includes("--with-body");
        const bodyIndex = process.argv.findIndex(a => a === "--body");
        const body = bodyIndex >= 0 ? process.argv[bodyIndex + 1] : undefined;
        await networkCommand(subCommand, urlOrFilter, { json: parsed.flags.json, abort, body, withBody, tabId: globalTabId });
        break;
      }

      case "console": {
        const clear = process.argv.includes("--clear");
        await consoleCommand({ json: parsed.flags.json, clear, tabId: globalTabId });
        break;
      }

      case "errors": {
        const clear = process.argv.includes("--clear");
        await errorsCommand({ json: parsed.flags.json, clear, tabId: globalTabId });
        break;
      }

      case "trace": {
        const subCmd = parsed.args[0] as 'start' | 'stop' | 'status' | undefined;
        if (!subCmd || !['start', 'stop', 'status'].includes(subCmd)) {
          console.error("Error: missing or invalid subcommand");
          console.error("Usage: bb-browser trace <start|stop|status>");
          console.error("Example: bb-browser trace start");
          console.error("      bb-browser trace stop");
          console.error("      bb-browser trace status");
          process.exit(1);
        }
        await traceCommand(subCmd, { json: parsed.flags.json, tabId: globalTabId });
        break;
      }

      case "history": {
        const subCmd = parsed.args[0] as 'search' | 'domains' | undefined;
        if (!subCmd || !['search', 'domains'].includes(subCmd)) {
          console.error("Error: missing or invalid subcommand");
          console.error("Usage: bb-browser history <search|domains> [query] [--days <n>]");
          console.error("Example: bb-browser history search github");
          console.error("      bb-browser history domains --days 7");
          process.exit(1);
        }
        const query = parsed.args.slice(1).join(' ');
        await historyCommand(subCmd, {
          json: parsed.flags.json,
          days: parsed.flags.days || 30,
          query,
        });
        break;
      }

      case "fetch": {
        const fetchUrl = parsed.args[0];
        if (!fetchUrl) {
          console.error("[error] fetch: <url> is required.");
          console.error("  Usage: bb-browser fetch <url> [--json] [--method POST] [--body '{...}']");
          console.error("  Example: bb-browser fetch https://www.reddit.com/api/me.json --json");
          process.exit(1);
        }
        // 解析 fetch 特有选项
        const methodIdx = process.argv.findIndex(a => a === "--method");
        const fetchMethod = methodIdx >= 0 ? process.argv[methodIdx + 1] : undefined;
        const fetchBodyIdx = process.argv.findIndex(a => a === "--body");
        const fetchBody = fetchBodyIdx >= 0 ? process.argv[fetchBodyIdx + 1] : undefined;
        const headersIdx = process.argv.findIndex(a => a === "--headers");
        const fetchHeaders = headersIdx >= 0 ? process.argv[headersIdx + 1] : undefined;
        const outputIdx = process.argv.findIndex(a => a === "--output");
        const fetchOutput = outputIdx >= 0 ? process.argv[outputIdx + 1] : undefined;
        await fetchCommand(fetchUrl, {
          json: parsed.flags.json,
          method: fetchMethod,
          body: fetchBody,
          headers: fetchHeaders,
          output: fetchOutput,
          tabId: globalTabId,
        });
        break;
      }

      case "site": {
        await siteCommand(parsed.args, {
          json: parsed.flags.json,
          jq: parsed.flags.jq,
          days: parsed.flags.days,
          tabId: globalTabId,
          openclaw: parsed.flags.openclaw,
        });
        break;
      }

      case "star": {
        const { execSync } = await import("node:child_process");
        try {
          execSync("gh auth status", { stdio: "pipe" });
        } catch {
          console.error("Please install and sign in to GitHub CLI first: https://cli.github.com");
          console.error("  brew install gh && gh auth login");
          process.exit(1);
        }
        const repos = ["epiral/bb-browser", "epiral/bb-sites"];
        for (const repo of repos) {
          try {
            execSync(`gh api user/starred/${repo} -X PUT`, { stdio: "pipe" });
            console.log(`⭐ Starred ${repo}`);
          } catch {
            console.log(`Already starred or failed: ${repo}`);
          }
        }
        console.log("\nThanks for your support! 🙏");
        break;
      }

      case "guide": {
        console.log(`How to turn any website into a bb-browser site adapter
=======================================================

1. REVERSE ENGINEER the API
   bb-browser network clear --tab <tabId>
   bb-browser refresh --tab <tabId>
   bb-browser network requests --filter "api" --with-body --json --tab <tabId>

2. TEST if direct fetch works (Tier 1)
   bb-browser eval "fetch('/api/endpoint',{credentials:'include'}).then(r=>r.json())" --tab <tabId>

   If it works → Tier 1 (Cookie auth, like Reddit/GitHub/Zhihu/Bilibili)
   If needs extra headers → Tier 2 (like Twitter: Bearer + CSRF token)
   If needs request signing → Tier 3 (like Xiaohongshu: Pinia store actions)

3. WRITE the adapter (one JS file per operation)

   /* @meta
   {
     "name": "platform/command",
     "description": "What it does",
     "domain": "www.example.com",
     "args": { "query": {"required": true, "description": "Search query"} },
     "readOnly": true,
     "example": "bb-browser site platform/command value"
   }
   */
   async function(args) {
     if (!args.query) return {error: 'Missing argument: query'};
     const resp = await fetch('/api/search?q=' + encodeURIComponent(args.query), {credentials: 'include'});
     if (!resp.ok) return {error: 'HTTP ' + resp.status, hint: 'Not logged in?'};
     return await resp.json();
   }

4. TEST it
   Save to ~/.bb-browser/sites/platform/command.js (private, takes priority)
   bb-browser site platform/command "test query" --json

5. CONTRIBUTE
   Option A (with gh CLI):
     git clone https://github.com/epiral/bb-sites && cd bb-sites
     git checkout -b feat-platform
     # add adapter files
     git push -u origin feat-platform
     gh pr create --repo epiral/bb-sites

   Option B (without gh CLI, using bb-browser itself):
     bb-browser site github/fork epiral/bb-sites
     git clone https://github.com/YOUR_USER/bb-sites && cd bb-sites
     git checkout -b feat-platform
     # add adapter files
     git push -u origin feat-platform
     bb-browser site github/pr-create epiral/bb-sites --title "feat(platform): add adapters" --head "YOUR_USER:feat-platform"

Private adapters:  ~/.bb-browser/sites/<platform>/<command>.js
Community:         ~/.bb-browser/bb-sites/ (via bb-browser site update)
Full guide:        https://github.com/epiral/bb-sites/blob/main/SKILL.md`);
        break;
      }

      default: {
        console.error(`Error: unknown command "${parsed.command}"`);
        console.error("Run bb-browser --help to view available commands");
        process.exit(1);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (parsed.flags.json) {
      console.log(
        JSON.stringify({
          success: false,
          error: message,
        })
      );
    } else {
      console.error(`Error: ${message}`);
    }

    process.exit(1);
  }
}

main().then(() => process.exit(0));
