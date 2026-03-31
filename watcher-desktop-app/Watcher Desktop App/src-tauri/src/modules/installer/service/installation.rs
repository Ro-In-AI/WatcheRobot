use crate::modules::openclaw::runtime_settings;
use tauri::{AppHandle, Emitter, Manager};

use super::shell::{clean_ansi, openclaw_command_candidates, resolve_command_candidate};

pub async fn start_installation(app: AppHandle) -> Result<(), String> {
    use tokio::io::AsyncBufReadExt;

    let window_label = app
        .get_webview_window("main")
        .map(|window| window.label().to_string());

    let app_handle = app.clone();

    tokio::spawn(async move {
        let result = tokio::process::Command::new("bash")
            .arg("-c")
            .arg("yes '' | curl -fsSL https://openclaw.ai/install.sh | bash")
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn();

        match result {
            Ok(mut child) => {
                let mut install_successful = false;
                let mut saw_onboarding = false;
                let mut empty_line_count = 0;
                let mut should_terminate = false;

                let emit_event = |name: &str, payload: String| {
                    if let Some(ref label) = window_label {
                        let _ = app_handle.emit_to(label, name, payload);
                    } else {
                        let _ = app_handle.emit(name, payload);
                    }
                };

                let emit_complete = || {
                    if let Some(ref label) = window_label {
                        let _ = app_handle.emit_to(label, "installation-complete", ());
                    } else {
                        let _ = app_handle.emit("installation-complete", ());
                    }
                };

                if let Some(stdout) = child.stdout.take() {
                    let mut reader = tokio::io::BufReader::new(stdout).lines();

                    while let Ok(Some(line)) = reader.next_line().await {
                        if should_terminate {
                            break;
                        }

                        let clean_line = clean_ansi(&line);

                        if clean_line.trim().is_empty() {
                            empty_line_count += 1;
                            if empty_line_count > 10 {
                                continue;
                            }
                        } else {
                            empty_line_count = 0;
                        }

                        if clean_line.contains("[1/4]")
                            || clean_line.contains("[2/4]")
                            || clean_line.contains("[3/4]")
                            || clean_line.contains("[4/4]")
                        {
                            saw_onboarding = true;
                        }

                        let lower = clean_line.to_lowercase();
                        if lower.contains("installed successfully") {
                            install_successful = true;
                            should_terminate = true;
                        }

                        if clean_line.contains("Continue?")
                            || clean_line.contains("I understand")
                            || lower.contains("starting setup")
                            || lower.contains("cracks claws")
                        {
                            saw_onboarding = true;
                            should_terminate = true;
                        }

                        emit_event("installation-log", clean_line);
                    }
                }

                if should_terminate {
                    let _ = child.kill().await;
                }

                if let Some(stderr) = child.stderr.take() {
                    let mut reader = tokio::io::BufReader::new(stderr).lines();
                    while let Ok(Some(line)) = reader.next_line().await {
                        let clean_line = clean_ansi(&line);
                        if !clean_line.trim().is_empty() {
                            emit_event("installation-log", clean_line);
                        }
                    }
                }

                let status =
                    tokio::time::timeout(std::time::Duration::from_secs(300), child.wait()).await;

                if install_successful || saw_onboarding {
                    tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
                    emit_event(
                        "installation-log",
                        "[4/4] Initializing configuration".to_string(),
                    );

                    let onboard_result =
                        match resolve_command_candidate(&openclaw_command_candidates()) {
                            Some(command) => {
                                let mut onboard = tokio::process::Command::new(command);
                                onboard
                                    .arg("onboard")
                                    .arg("--non-interactive")
                                    .arg("--mode")
                                    .arg("local")
                                    .arg("--gateway-bind")
                                    .arg("loopback")
                                    .arg("--auth-choice")
                                    .arg("skip")
                                    .arg("--install-daemon")
                                    .arg("--accept-risk")
                                    .stdout(std::process::Stdio::piped())
                                    .stderr(std::process::Stdio::piped());
                                onboard.output().await
                            }
                            None => Err(std::io::Error::new(
                                std::io::ErrorKind::NotFound,
                                "openclaw executable not found",
                            )),
                        };

                    match onboard_result {
                        Ok(output) => {
                            if !output.stdout.is_empty() {
                                let stdout_text = String::from_utf8_lossy(&output.stdout);
                                for line in stdout_text.lines() {
                                    let clean_line = clean_ansi(line);
                                    if !clean_line.trim().is_empty() {
                                        emit_event("installation-log", clean_line);
                                    }
                                }
                            }

                            if !output.stderr.is_empty() {
                                let stderr_text = String::from_utf8_lossy(&output.stderr);
                                for line in stderr_text.lines() {
                                    let clean_line = clean_ansi(line);
                                    if !clean_line.trim().is_empty() {
                                        emit_event("installation-log", clean_line);
                                    }
                                }
                            }

                            if output.status.success() {
                                if let Err(error) = runtime_settings::ensure_runtime_defaults() {
                                    emit_event(
                                        "installation-log",
                                        format!(
                                            "[warning] OpenClaw defaults sync failed: {}",
                                            error
                                        ),
                                    );
                                }
                                emit_complete();
                            } else {
                                emit_event(
                                    "installation-error",
                                    format!("初始化失败，退出码: {:?}", output.status.code()),
                                );
                            }
                        }
                        Err(error) => {
                            emit_event(
                                "installation-error",
                                format!("无法执行初始化命令: {}", error),
                            );
                        }
                    }
                } else {
                    let message = match status {
                        Ok(Ok(exit_status)) => {
                            format!("安装流程未完成，退出码: {:?}", exit_status.code())
                        }
                        Ok(Err(error)) => format!("等待安装进程失败: {}", error),
                        Err(_) => "安装超时，请检查网络或安装脚本输出".to_string(),
                    };
                    emit_event("installation-error", message);
                }
            }
            Err(error) => {
                if let Some(ref label) = window_label {
                    let _ = app_handle.emit_to(
                        label,
                        "installation-error",
                        format!("无法启动安装进程: {}", error),
                    );
                } else {
                    let _ = app_handle
                        .emit("installation-error", format!("无法启动安装进程: {}", error));
                }
            }
        }
    });

    Ok(())
}
