import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export type ServerEventName = "server-log" | "server-exited" | "server-stopped";
export type ServerRuntimeMode = "unknown" | "binary" | "python";

export interface StartServerResult {
  mode: Exclude<ServerRuntimeMode, "unknown">;
  label: string;
  command: string;
}

export function startServer() {
  return invoke<StartServerResult>("start_server");
}

export function stopServer() {
  return invoke("stop_server");
}

export function getServerStatus() {
  return invoke<boolean>("is_server_running");
}

export function getServerRuntimeMode() {
  return invoke<ServerRuntimeMode>("get_server_runtime_mode");
}

export function onServerEvent(
  event: ServerEventName,
  handler: (payload: unknown) => void,
) {
  return listen(event, ({ payload }) => handler(payload));
}
