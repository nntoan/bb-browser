/**
 * check/uncheck 命令 - 勾选/取消勾选复选框
 * 用法：
 *   bb-browser check <ref>   勾选复选框
 *   bb-browser uncheck <ref> 取消勾选复选框
 * 
 * ref 支持格式：
 *   - "@5" 或 "5"：使用 snapshot 返回的 ref ID
 */

import { generateId, type Request, type Response } from "@bb-browser/shared";
import { sendCommand } from "../client.js";
import { ensureDaemonRunning } from "../daemon-manager.js";

export interface CheckOptions {
  json?: boolean;
  tabId?: number;
}

/**
 * 解析 ref 参数，支持 "@5" 或 "5" 格式
 */
function parseRef(ref: string): string {
  return ref.startsWith("@") ? ref.slice(1) : ref;
}

/**
 * 勾选复选框
 */
export async function checkCommand(
  ref: string,
  options: CheckOptions = {}
): Promise<void> {
  if (!ref) {
    throw new Error("Missing ref argument");
  }

  await ensureDaemonRunning();

  const parsedRef = parseRef(ref);

  const request: Request = {
    id: generateId(),
    action: "check",
    ref: parsedRef,
    tabId: options.tabId,
  };

  const response: Response = await sendCommand(request);

  if (options.json) {
    console.log(JSON.stringify(response, null, 2));
  } else {
    if (response.success) {
      const role = response.data?.role ?? "checkbox";
      const name = response.data?.name;
      const wasAlreadyChecked = response.data?.wasAlreadyChecked;
      
      if (wasAlreadyChecked) {
        if (name) {
          console.log(`Checked (already checked): ${role} "${name}"`);
        } else {
          console.log(`Checked (already checked): ${role}`);
        }
      } else {
        if (name) {
          console.log(`Checked: ${role} "${name}"`);
        } else {
          console.log(`Checked: ${role}`);
        }
      }
    } else {
      console.error(`Error: ${response.error}`);
      process.exit(1);
    }
  }
}

/**
 * 取消勾选复选框
 */
export async function uncheckCommand(
  ref: string,
  options: CheckOptions = {}
): Promise<void> {
  if (!ref) {
    throw new Error("Missing ref argument");
  }

  await ensureDaemonRunning();

  const parsedRef = parseRef(ref);

  const request: Request = {
    id: generateId(),
    action: "uncheck",
    ref: parsedRef,
    tabId: options.tabId,
  };

  const response: Response = await sendCommand(request);

  if (options.json) {
    console.log(JSON.stringify(response, null, 2));
  } else {
    if (response.success) {
      const role = response.data?.role ?? "checkbox";
      const name = response.data?.name;
      const wasAlreadyUnchecked = response.data?.wasAlreadyUnchecked;
      
      if (wasAlreadyUnchecked) {
        if (name) {
          console.log(`Unchecked (already unchecked): ${role} "${name}"`);
        } else {
          console.log(`Unchecked (already unchecked): ${role}`);
        }
      } else {
        if (name) {
          console.log(`Unchecked: ${role} "${name}"`);
        } else {
          console.log(`Unchecked: ${role}`);
        }
      }
    } else {
      console.error(`Error: ${response.error}`);
      process.exit(1);
    }
  }
}
