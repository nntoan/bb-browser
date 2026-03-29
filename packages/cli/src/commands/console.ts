/**
 * console 命令 - 查看控制台消息
 */

import { generateId } from "@bb-browser/shared";
import { sendCommand } from "../client.js";

interface ConsoleOptions {
  json?: boolean;
  clear?: boolean;
  tabId?: number;
}

export async function consoleCommand(options: ConsoleOptions = {}): Promise<void> {
  const response = await sendCommand({
    id: generateId(),
    action: "console",
    consoleCommand: options.clear ? "clear" : "get",
    tabId: options.tabId,
  });

  if (options.json) {
    console.log(JSON.stringify(response));
    return;
  }

  if (!response.success) {
    throw new Error(response.error || "Console command failed");
  }

  if (options.clear) {
    console.log("Cleared console messages");
    return;
  }

  const messages = response.data?.consoleMessages || [];
  
  if (messages.length === 0) {
    console.log("No console messages");
    console.log("Tip: console command starts monitoring automatically");
    return;
  }

  console.log(`Console messages (${messages.length} items):\n`);

  const typeColors: Record<string, string> = {
    log: "",
    info: "[INFO]",
    warn: "[WARN]",
    error: "[ERROR]",
    debug: "[DEBUG]",
  };

  for (const msg of messages) {
    const prefix = typeColors[msg.type] || `[${msg.type.toUpperCase()}]`;
    const location = msg.url ? ` (${msg.url}${msg.lineNumber ? `:${msg.lineNumber}` : ""})` : "";
    
    if (prefix) {
      console.log(`${prefix} ${msg.text}${location}`);
    } else {
      console.log(`${msg.text}${location}`);
    }
  }
}
