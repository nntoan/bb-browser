import { isDaemonRunning } from "../daemon-manager.js";

export interface DaemonOptions {
  json?: boolean;
  host?: string;
}

export async function statusCommand(
  options: DaemonOptions = {}
): Promise<void> {
  const running = await isDaemonRunning();

  if (options.json) {
    console.log(JSON.stringify({ running }));
  } else {
    console.log(running ? "Browser is running" : "Browser is not running");
  }
}
