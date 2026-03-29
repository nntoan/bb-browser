/**
 * 导航命令 - back/forward/refresh
 * 用法：
 *   bb-browser back      后退
 *   bb-browser forward   前进
 *   bb-browser refresh   刷新页面
 */

import { generateId, type Request, type Response } from "@bb-browser/shared";
import { sendCommand } from "../client.js";
import { ensureDaemonRunning } from "../daemon-manager.js";

export interface NavOptions {
  json?: boolean;
  tabId?: number;
}

/**
 * back 命令 - 后退
 */
export async function backCommand(options: NavOptions = {}): Promise<void> {
  await ensureDaemonRunning();

  const request: Request = {
    id: generateId(),
    action: "back",
    tabId: options.tabId,
  };

  const response: Response = await sendCommand(request);

  if (options.json) {
    console.log(JSON.stringify(response, null, 2));
  } else {
    if (response.success) {
      const url = response.data?.url ?? "";
      if (url) {
        console.log(`Navigated back to: ${url}`);
      } else {
        console.log("Navigated back");
      }
    } else {
      console.error(`Error: ${response.error}`);
      process.exit(1);
    }
  }
}

/**
 * forward 命令 - 前进
 */
export async function forwardCommand(options: NavOptions = {}): Promise<void> {
  await ensureDaemonRunning();

  const request: Request = {
    id: generateId(),
    action: "forward",
    tabId: options.tabId,
  };

  const response: Response = await sendCommand(request);

  if (options.json) {
    console.log(JSON.stringify(response, null, 2));
  } else {
    if (response.success) {
      const url = response.data?.url ?? "";
      if (url) {
        console.log(`Navigated forward to: ${url}`);
      } else {
        console.log("Navigated forward");
      }
    } else {
      console.error(`Error: ${response.error}`);
      process.exit(1);
    }
  }
}

/**
 * refresh 命令 - 刷新页面
 */
export async function refreshCommand(options: NavOptions = {}): Promise<void> {
  await ensureDaemonRunning();

  const request: Request = {
    id: generateId(),
    action: "refresh",
    tabId: options.tabId,
  };

  const response: Response = await sendCommand(request);

  if (options.json) {
    console.log(JSON.stringify(response, null, 2));
  } else {
    if (response.success) {
      const title = response.data?.title ?? "";
      if (title) {
        console.log(`Refreshed: "${title}"`);
      } else {
        console.log("Refreshed page");
      }
    } else {
      console.error(`Error: ${response.error}`);
      process.exit(1);
    }
  }
}
