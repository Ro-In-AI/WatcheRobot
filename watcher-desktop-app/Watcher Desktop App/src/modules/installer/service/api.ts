import { invoke } from "@tauri-apps/api/core";
import type { EnvironmentStatus, IntegrationPaths } from "@/shared/types/runtime";

export function checkEnvironment() {
  return invoke<EnvironmentStatus>("check_environment");
}

export function startInstallation() {
  return invoke("start_installation");
}

export function getIntegrationPaths() {
  return invoke<IntegrationPaths>("get_integration_paths");
}
