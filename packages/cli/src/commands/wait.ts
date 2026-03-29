/**
 * wait 命令 - 等待指定时间或元素出现
 * 用法：
 *   bb-browser wait <ms>   等待指定毫秒数
 *   bb-browser wait @<ref> 等待元素出现（最多 10 秒）
 */

import { generateId, type Request, type Response } from "@bb-browser/shared";
import { sendCommand } from "../client.js";
import { ensureDaemonRunning } from "../daemon-manager.js";

export interface WaitOptions {
  json?: boolean;
  tabId?: number;
}

/**
 * 判断yesnoyes等待时间（纯数字）
 */
function isTimeWait(target: string): boolean {
  return /^\d+$/.test(target);
}

/**
 * 解析 ref 参数，支持 "@5" 或 "5" 格式
 */
function parseRef(ref: string): string {
  return ref.startsWith("@") ? ref.slice(1) : ref;
}

export async function waitCommand(
  target: string,
  options: WaitOptions = {}
): Promise<void> {
  if (!target) {
    throw new Error("Missing wait target argument");
  }

  // 确保 Daemon 运行
  await ensureDaemonRunning();

  let request: Request;

  if (isTimeWait(target)) {
    // 等待时间模式
    const ms = parseInt(target, 10);
    request = {
      id: generateId(),
      action: "wait",
      waitType: "time",
      ms,
      tabId: options.tabId,
    };
  } else {
    // 等待元素模式
    const ref = parseRef(target);
    request = {
      id: generateId(),
      action: "wait",
      waitType: "element",
      ref,
      tabId: options.tabId,
    };
  }

  // 发送请求
  const response: Response = await sendCommand(request);

  // 输出结果
  if (options.json) {
    console.log(JSON.stringify(response, null, 2));
  } else {
    if (response.success) {
      if (isTimeWait(target)) {
        console.log(`Waited ${target}ms`);
      } else {
        console.log(`Element @${parseRef(target)} is now visible`);
      }
    } else {
      console.error(`Error: ${response.error}`);
      process.exit(1);
    }
  }
}
