import { invoke } from "@tauri-apps/api/core";

const DEBUG_PREFIX = "[WatcherDebug]";
let terminalMirrorAvailable: boolean | null = null;

function buildPrefix(scope: string) {
  return `${DEBUG_PREFIX}[${new Date().toISOString()}][${scope}]`;
}

function canMirrorToTerminal() {
  if (typeof window === "undefined") {
    return false;
  }

  return "__TAURI_INTERNALS__" in window;
}

function serializeDetails(details: unknown) {
  if (typeof details === "undefined") {
    return null;
  }

  try {
    return JSON.stringify(details);
  } catch {
    return String(details);
  }
}

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack ?? null,
    };
  }

  if (typeof error === "object" && error !== null) {
    return error;
  }

  return String(error);
}

async function mirrorToTerminal(
  level: "INFO" | "WARN" | "ERROR",
  scope: string,
  message: string,
  details?: unknown,
) {
  if (terminalMirrorAvailable === false || !canMirrorToTerminal()) {
    terminalMirrorAvailable = false;
    return;
  }

  try {
    await invoke("debug_log", {
      level,
      scope,
      message,
      details: serializeDetails(details),
    });
    terminalMirrorAvailable = true;
  } catch {
    terminalMirrorAvailable = false;
  }
}

export function debugLog(scope: string, message: string, details?: unknown) {
  void mirrorToTerminal("INFO", scope, message, details);
  if (typeof details === "undefined") {
    console.log(`${buildPrefix(scope)} ${message}`);
    return;
  }

  console.log(`${buildPrefix(scope)} ${message}`, details);
}

export function debugWarn(scope: string, message: string, details?: unknown) {
  void mirrorToTerminal("WARN", scope, message, details);
  if (typeof details === "undefined") {
    console.warn(`${buildPrefix(scope)} ${message}`);
    return;
  }

  console.warn(`${buildPrefix(scope)} ${message}`, details);
}

export function debugError(scope: string, message: string, error: unknown, details?: unknown) {
  void mirrorToTerminal("ERROR", scope, message, {
    error: serializeError(error),
    details: typeof details === "undefined" ? null : details,
  });
  if (typeof details === "undefined") {
    console.error(`${buildPrefix(scope)} ${message}`, error);
    return;
  }

  console.error(`${buildPrefix(scope)} ${message}`, error, details);
}

export function startDebugTimer(
  scope: string,
  action: string,
  details?: unknown,
  warningAfterMs = 5000,
) {
  const startedAt = Date.now();
  let finished = false;

  debugLog(scope, `${action} started`, details);

  const timer = globalThis.setTimeout(() => {
    if (finished) {
      return;
    }

    debugWarn(scope, `${action} still pending after ${warningAfterMs}ms`, details);
  }, warningAfterMs);

  return {
    success(message = `${action} succeeded`, extraDetails?: unknown) {
      if (finished) {
        return;
      }

      finished = true;
      globalThis.clearTimeout(timer);
      debugLog(scope, `${message} in ${Date.now() - startedAt}ms`, extraDetails ?? details);
    },
    fail(error: unknown, message = `${action} failed`, extraDetails?: unknown) {
      if (finished) {
        return;
      }

      finished = true;
      globalThis.clearTimeout(timer);
      debugError(scope, `${message} after ${Date.now() - startedAt}ms`, error, extraDetails ?? details);
    },
  };
}
