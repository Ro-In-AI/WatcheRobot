use std::process::Command;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

fn pids_listening_on_port(port: u16) -> Result<Vec<u32>, String> {
    if cfg!(target_os = "windows") {
        let output = Command::new("netstat")
            .args(["-ano", "-p", "tcp"])
            .output()
            .map_err(|error| format!("执行 netstat 失败: {}", error))?;

        if !output.status.success() {
            return Err(format!(
                "netstat 执行失败: {}",
                String::from_utf8_lossy(&output.stderr).trim()
            ));
        }

        let mut pids = Vec::new();
        let needle = format!(":{}", port);
        for line in String::from_utf8_lossy(&output.stdout).lines() {
            if !line.contains("LISTENING") || !line.contains(&needle) {
                continue;
            }

            if let Some(pid) = line.split_whitespace().last() {
                if let Ok(pid) = pid.parse::<u32>() {
                    if !pids.contains(&pid) {
                        pids.push(pid);
                    }
                }
            }
        }

        return Ok(pids);
    }

    let output = Command::new("lsof")
        .args(["-ti", &format!("tcp:{}", port)])
        .output()
        .map_err(|error| format!("执行 lsof 失败: {}", error))?;

    if !output.status.success() && !output.stdout.is_empty() {
        return Err(format!(
            "lsof 执行失败: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }

    let mut pids = Vec::new();
    for line in String::from_utf8_lossy(&output.stdout).lines() {
        if let Ok(pid) = line.trim().parse::<u32>() {
            if !pids.contains(&pid) {
                pids.push(pid);
            }
        }
    }

    Ok(pids)
}

fn terminate_pid(pid: u32) -> Result<(), String> {
    let status = if cfg!(target_os = "windows") {
        Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/F"])
            .status()
            .map_err(|error| format!("结束进程 {} 失败: {}", pid, error))?
    } else {
        Command::new("kill")
            .args(["-TERM", &pid.to_string()])
            .status()
            .map_err(|error| format!("结束进程 {} 失败: {}", pid, error))?
    };

    if status.success() {
        Ok(())
    } else {
        Err(format!(
            "结束进程 {} 失败，退出码: {:?}",
            pid,
            status.code()
        ))
    }
}

fn port_is_in_use(port: u16) -> Result<bool, String> {
    Ok(!pids_listening_on_port(port)?.is_empty())
}

fn wait_for_port_to_clear(port: u16, timeout: Duration) -> Result<bool, String> {
    let started_at = std::time::Instant::now();

    loop {
        if !port_is_in_use(port)? {
            return Ok(true);
        }

        if started_at.elapsed() >= timeout {
            return Ok(false);
        }

        std::thread::sleep(Duration::from_millis(200));
    }
}

pub(super) fn clear_port_conflicts(app: &AppHandle, port: u16) -> Result<(), String> {
    let current_pid = std::process::id();
    let pids = pids_listening_on_port(port)?;

    for pid in &pids {
        if *pid == current_pid {
            continue;
        }

        let _ = app.emit(
            "server-log",
            format!(
                "[系统] 检测到端口 {} 被进程 {} 占用，正在结束该进程",
                port, pid
            ),
        );
        println!(
            "[WatcherServerLauncher] 检测到端口 {} 被进程 {} 占用，正在结束该进程",
            port, pid
        );
        terminate_pid(*pid)?;
    }

    if !pids.is_empty() {
        match wait_for_port_to_clear(port, Duration::from_secs(5))? {
            true => {
                let _ = app.emit(
                    "server-log",
                    format!("[系统] 端口 {} 已释放，准备启动新服务", port),
                );
                println!(
                    "[WatcherServerLauncher] 端口 {} 已释放，准备启动新服务",
                    port
                );
            }
            false => {
                eprintln!(
                    "[WatcherServerLauncher] 端口 {} 在结束旧进程后仍未释放",
                    port
                );
                return Err(format!("端口 {} 在结束旧进程后仍未释放", port));
            }
        }
    }

    Ok(())
}
