/**
 * trace 命令 - 录制用户操作
 * 
 * 用法：
 *   bb-browser trace start   开始录制
 *   bb-browser trace stop    停止录制，输出事件列表
 *   bb-browser trace status  查看录制状态
 */

import { generateId } from "@bb-browser/shared";
import { sendCommand } from "../client.js";

interface TraceOptions {
  json?: boolean;
  tabId?: number;
}

export async function traceCommand(
  subCommand: 'start' | 'stop' | 'status',
  options: TraceOptions = {}
): Promise<void> {
  const response = await sendCommand({
    id: generateId(),
    action: "trace",
    traceCommand: subCommand,
    tabId: options.tabId,
  });

  if (options.json) {
    console.log(JSON.stringify(response));
    return;
  }

  if (!response.success) {
    throw new Error(response.error || "Trace command failed");
  }

  const data = response.data;

  switch (subCommand) {
    case "start": {
      const status = data?.traceStatus;
      console.log("Started recording user actions");
      console.log(`Tab ID: ${status?.tabId || 'N/A'}`);
      console.log("\nPerform actions in the browser, then run 'bb-browser trace stop' to stop recording");
      break;
    }

    case "stop": {
      const events = data?.traceEvents || [];
      const status = data?.traceStatus;
      
      console.log(`Recording complete, total ${events.length} events\n`);
      
      if (events.length === 0) {
        console.log("No recorded actions");
        break;
      }
      
      // 输出事件列表
      for (let i = 0; i < events.length; i++) {
        const event = events[i];
        const refStr = event.ref !== undefined ? `@${event.ref}` : '';
        
        switch (event.type) {
          case 'navigation':
            console.log(`${i + 1}. Navigate to: ${event.url}`);
            break;
          case 'click':
            console.log(`${i + 1}. Click ${refStr} [${event.elementRole}] "${event.elementName || ''}"`);
            break;
          case 'fill':
            console.log(`${i + 1}. Fill ${refStr} [${event.elementRole}] "${event.elementName || ''}" <- "${event.value}"`);
            break;
          case 'select':
            console.log(`${i + 1}. Select ${refStr} [${event.elementRole}] "${event.elementName || ''}" <- "${event.value}"`);
            break;
          case 'check':
            console.log(`${i + 1}. ${event.checked ? 'Check' : 'Uncheck'} ${refStr} [${event.elementRole}] "${event.elementName || ''}"`);
            break;
          case 'press':
            console.log(`${i + 1}. Key ${event.key}`);
            break;
          case 'scroll':
            console.log(`${i + 1}. Scroll ${event.direction} ${event.pixels}px`);
            break;
          default:
            console.log(`${i + 1}. ${event.type}`);
        }
      }
      
      console.log(`\nStatus: ${status?.recording ? 'recording' : 'stopped'}`);
      break;
    }

    case "status": {
      const status = data?.traceStatus;
      if (status?.recording) {
        console.log(`Recording (tab ${status.tabId})`);
        console.log(`Recorded ${status.eventCount} events`);
      } else {
        console.log("Not recording");
      }
      break;
    }

    default:
      throw new Error(`Unknown trace subcommand: ${subCommand}`);
  }
}
