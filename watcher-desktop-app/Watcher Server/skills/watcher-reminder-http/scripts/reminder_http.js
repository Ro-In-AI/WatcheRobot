#!/usr/bin/env node

const DEFAULT_BASE_URL = "http://127.0.0.1:8766";

function printUsage() {
  console.error(`Usage:
  node scripts/reminder_http.js health [--base-url URL]
  node scripts/reminder_http.js get [--base-url URL]
  node scripts/reminder_http.js set --trigger-at "2026-03-28T09:00" --text "提醒内容" [--base-url URL]
  node scripts/reminder_http.js trigger [--text "测试提醒"] [--wait-timeout-seconds 30] [--base-url URL]

Notes:
  - HTTP management default base URL: http://127.0.0.1:8766
  - Port 8765 is the watcher WebSocket service. Do not use it for HTTP requests.`);
}

function parseArgs(argv) {
  if (argv.length === 0) {
    throw new Error("missing command");
  }

  const [command, ...rest] = argv;
  const options = {};

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith("--")) {
      throw new Error(`unexpected argument: ${token}`);
    }

    const key = token.slice(2);
    const value = rest[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`missing value for --${key}`);
    }

    options[key] = value;
    index += 1;
  }

  return { command, options };
}

function normalizeBaseUrl(rawValue) {
  const normalized = (rawValue || DEFAULT_BASE_URL).trim().replace(/\/+$/, "");
  let parsed;

  try {
    parsed = new URL(normalized);
  } catch (error) {
    throw new Error(`invalid --base-url: ${normalized}`);
  }

  if (parsed.protocol === "ws:" || parsed.protocol === "wss:") {
    throw new Error("base URL must be HTTP, not WebSocket. Use http://127.0.0.1:8766");
  }

  if (parsed.port === "8765") {
    throw new Error("port 8765 is the watcher WebSocket service. Use HTTP management port 8766 instead.");
  }

  return normalized;
}

async function request(method, url, payload) {
  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
    },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text}`);
  }
  return data;
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  const baseUrl = normalizeBaseUrl(options["base-url"]);
  let result;

  if (command === "health") {
    result = await request("GET", `${baseUrl}/api/admin/health`);
  } else if (command === "get") {
    result = await request("GET", `${baseUrl}/api/admin/scheduled-tts`);
  } else if (command === "set") {
    if (!options["trigger-at"]) {
      throw new Error("set requires --trigger-at");
    }
    if (!options.text) {
      throw new Error("set requires --text");
    }
    result = await request("PUT", `${baseUrl}/api/admin/scheduled-tts`, {
      trigger_at: options["trigger-at"],
      text: options.text,
    });
  } else if (command === "trigger") {
    const payload = {};
    if (options.text) {
      payload.text = options.text;
    }
    if (options["wait-timeout-seconds"] !== undefined) {
      const parsed = Number(options["wait-timeout-seconds"]);
      if (Number.isNaN(parsed)) {
        throw new Error("--wait-timeout-seconds must be a number");
      }
      payload.wait_timeout_seconds = parsed;
    }
    result = await request("POST", `${baseUrl}/api/admin/scheduled-tts/trigger`, payload);
  } else {
    throw new Error(`unsupported command: ${command}`);
  }

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error.message || String(error));
  printUsage();
  process.exit(1);
});
