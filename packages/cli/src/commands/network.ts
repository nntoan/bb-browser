/**
 * network 命令 - 网络监控和拦截
 */

import { generateId } from "@bb-browser/shared";
import { sendCommand } from "../client.js";

interface NetworkOptions {
  json?: boolean;
  abort?: boolean;
  body?: string;
  withBody?: boolean;
  tabId?: number;
}

export async function networkCommand(
  subCommand: string,
  urlOrFilter?: string,
  options: NetworkOptions = {}
): Promise<void> {
  const response = await sendCommand({
    id: generateId(),
    action: "network",
    networkCommand: subCommand as "requests" | "route" | "unroute" | "clear",
    url: subCommand === "route" || subCommand === "unroute" ? urlOrFilter : undefined,
    filter: subCommand === "requests" ? urlOrFilter : undefined,
    routeOptions: subCommand === "route" ? {
      abort: options.abort,
      body: options.body,
    } : undefined,
    withBody: subCommand === "requests" ? options.withBody : undefined,
    tabId: options.tabId,
  });

  if (options.json) {
    console.log(JSON.stringify(response));
    return;
  }

  if (!response.success) {
    throw new Error(response.error || "Network command failed");
  }

  const data = response.data;

  switch (subCommand) {
    case "requests": {
      const requests = data?.networkRequests || [];
      if (requests.length === 0) {
        console.log("No network requests recorded");
        console.log("Tip: running network requests starts monitoring automatically");
      } else {
        console.log(`Network requests (${requests.length} items):\n`);
        for (const req of requests) {
          const status = req.failed 
            ? `FAILED (${req.failureReason})` 
            : (req.status ? `${req.status} ${req.statusText || ''}` : 'pending');
          console.log(`${req.method} ${req.url}`);
          console.log(`  Type: ${req.type}, Status: ${status}`);
          if (options.withBody) {
            const requestHeaderCount = req.requestHeaders ? Object.keys(req.requestHeaders).length : 0;
            const responseHeaderCount = req.responseHeaders ? Object.keys(req.responseHeaders).length : 0;
            console.log(`  Request headers: ${requestHeaderCount}, Response headers: ${responseHeaderCount}`);
            if (req.requestBody !== undefined) {
              const preview = req.requestBody.length > 200 ? `${req.requestBody.slice(0, 200)}...` : req.requestBody;
              console.log(`  Request body: ${preview}`);
            }
            if (req.responseBody !== undefined) {
              const preview = req.responseBody.length > 200 ? `${req.responseBody.slice(0, 200)}...` : req.responseBody;
              console.log(`  Response body: ${preview}`);
            }
            if (req.bodyError) {
              console.log(`  BodyError: ${req.bodyError}`);
            }
          }
          console.log("");
        }
      }
      break;
    }

    case "route": {
      console.log(`Added route rule: ${urlOrFilter}`);
      if (options.abort) {
        console.log("  Action: abort request");
      } else if (options.body) {
        console.log("  Action: return mock body");
      } else {
        console.log("  Action: continue request");
      }
      console.log(`Current rule count: ${data?.routeCount || 0}`);
      break;
    }

    case "unroute": {
      if (urlOrFilter) {
        console.log(`Removed route rule: ${urlOrFilter}`);
      } else {
        console.log("Removed all route rules");
      }
      console.log(`Remaining rule count: ${data?.routeCount || 0}`);
      break;
    }

    case "clear": {
      console.log("Cleared network request records");
      break;
    }

    default:
      throw new Error(`Unknown network subcommand: ${subCommand}`);
  }
}
