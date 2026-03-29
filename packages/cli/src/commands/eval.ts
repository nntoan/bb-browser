/**
 * eval 命令 - 在当前页面执行 JavaScript
 * 用法：bb-browser eval "<js>"
 */

import { generateId, type Request, type Response } from "@bb-browser/shared";
import { sendCommand } from "../client.js";
import { ensureDaemonRunning } from "../daemon-manager.js";

export interface EvalOptions {
  json?: boolean;
  tabId?: number;
}

export async function evalCommand(
  script: string,
  options: EvalOptions = {}
): Promise<void> {
  // 验证 script
  if (!script) {
    throw new Error("Missing script argument");
  }

  // 确保 Daemon 运行
  await ensureDaemonRunning();

  // 构造请求
  const request: Request = {
    id: generateId(),
    action: "eval",
    script,
    tabId: options.tabId,
  };

  // 发送请求
  const response: Response = await sendCommand(request);

  // 输出结果
  if (options.json) {
    console.log(JSON.stringify(response, null, 2));
  } else {
    if (response.success) {
      const result = response.data?.result;
      if (result !== undefined) {
        // Format object results for readability
        if (typeof result === "object" && result !== null) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(result);
        }
      } else {
        console.log("undefined");
      }
    } else {
      console.error(`Error: ${response.error}`);
      process.exit(1);
    }
  }
}
