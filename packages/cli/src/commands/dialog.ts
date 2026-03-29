/**
 * dialog 命令 - 处理浏览器dialog (alert/confirm/prompt）
 * 用法：
 *   bb-browser dialog accept [text]  接受对话框，可传入 prompt 文本
 *   bb-browser dialog dismiss        拒绝/关闭对话框
 */

import { generateId, type Request, type Response } from "@bb-browser/shared";
import { sendCommand } from "../client.js";
import { ensureDaemonRunning } from "../daemon-manager.js";

export interface DialogOptions {
  json?: boolean;
  tabId?: number;
}

export async function dialogCommand(
  subCommand: string,
  promptText?: string,
  options: DialogOptions = {}
): Promise<void> {
  // 验证子命令
  if (!subCommand || !["accept", "dismiss"].includes(subCommand)) {
    throw new Error("Use 'dialog accept [text]' or 'dialog dismiss'");
  }

  // 确保 Daemon 运行
  await ensureDaemonRunning();

  // 构造请求
  const request: Request = {
    id: generateId(),
    action: "dialog",
    dialogResponse: subCommand as "accept" | "dismiss",
    promptText: subCommand === "accept" ? promptText : undefined,
    tabId: options.tabId,
  };

  // 发送请求
  const response: Response = await sendCommand(request);

  // 输出结果
  if (options.json) {
    console.log(JSON.stringify(response, null, 2));
  } else {
    if (response.success) {
      const dialogInfo = response.data?.dialogInfo;
      if (dialogInfo) {
        const action = subCommand === "accept" ? "Accepted " : "Dismissed ";
        console.log(`${action}dialog (${dialogInfo.type} ): "${dialogInfo.message}"`);
      } else {
        console.log("Dialog handled");
      }
    } else {
      console.error(`Error: ${response.error}`);
      process.exit(1);
    }
  }
}
