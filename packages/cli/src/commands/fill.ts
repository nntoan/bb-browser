/**
 * fill 命令 - 填充输入框
 * 用法：bb-browser fill <ref> <text>
 * 
 * ref 支持格式：
 *   - "@5" 或 "5"：使用 snapshot 返回的 ref ID
 */

import { generateId, type Request, type Response } from "@bb-browser/shared";
import { sendCommand } from "../client.js";
import { ensureDaemonRunning } from "../daemon-manager.js";

export interface FillOptions {
  json?: boolean;
  tabId?: number;
}

/**
 * 解析 ref 参数，支持 "@5" 或 "5" 格式
 */
function parseRef(ref: string): string {
  // 移除 @ 前缀（如果有）
  return ref.startsWith("@") ? ref.slice(1) : ref;
}

export async function fillCommand(
  ref: string,
  text: string,
  options: FillOptions = {}
): Promise<void> {
  // 验证参数
  if (!ref) {
    throw new Error("Missing ref argument");
  }

  if (text === undefined || text === null) {
    throw new Error("Missing text argument");
  }

  // 确保 Daemon 运行
  await ensureDaemonRunning();

  // 解析 ref
  const parsedRef = parseRef(ref);

  // 构造请求
  const request: Request = {
    id: generateId(),
    action: "fill",
    ref: parsedRef,
    text: text,
    tabId: options.tabId,
  };

  // 发送请求
  const response: Response = await sendCommand(request);

  // 输出结果
  if (options.json) {
    console.log(JSON.stringify(response, null, 2));
  } else {
    if (response.success) {
      const role = response.data?.role ?? "element";
      const name = response.data?.name;
      if (name) {
        console.log(`Filled: ${role} "${name}"`);
      } else {
        console.log(`Filled: ${role}`);
      }
      console.log(`Content: "${text}"`);
    } else {
      console.error(`Error: ${response.error}`);
      process.exit(1);
    }
  }
}
