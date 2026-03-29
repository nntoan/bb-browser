/**
 * errors 命令 - 查看 JS 错误
 */

import { generateId } from "@bb-browser/shared";
import { sendCommand } from "../client.js";

interface ErrorsOptions {
  json?: boolean;
  clear?: boolean;
  tabId?: number;
}

export async function errorsCommand(options: ErrorsOptions = {}): Promise<void> {
  const response = await sendCommand({
    id: generateId(),
    action: "errors",
    errorsCommand: options.clear ? "clear" : "get",
    tabId: options.tabId,
  });

  if (options.json) {
    console.log(JSON.stringify(response));
    return;
  }

  if (!response.success) {
    throw new Error(response.error || "Errors command failed");
  }

  if (options.clear) {
    console.log("Cleared JS error records");
    return;
  }

  const errors = response.data?.jsErrors || [];
  
  if (errors.length === 0) {
    console.log("No JS errors");
    console.log("Tip: errors command starts monitoring automatically");
    return;
  }

  console.log(`JS errors (${errors.length} items):\n`);

  for (const err of errors) {
    console.log(`[ERROR] ${err.message}`);
    if (err.url) {
      console.log(`  Location: ${err.url}:${err.lineNumber || 0}:${err.columnNumber || 0}`);
    }
    if (err.stackTrace) {
      console.log(`  Stack trace:`);
      console.log(err.stackTrace.split('\n').map(line => `    ${line}`).join('\n'));
    }
    console.log("");
  }
}
