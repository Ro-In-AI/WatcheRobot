use std::process::Command;

pub(super) fn command_exists(command: &str) -> bool {
    check_command_exists_candidates(&[command])
}

pub(super) fn openclaw_command_candidates() -> Vec<&'static str> {
    let mut candidates = vec!["openclaw"];

    if cfg!(target_os = "windows") {
        candidates.extend(["openclaw.cmd", "openclaw.exe", "openclaw.bat"]);
    } else {
        candidates.extend(["/opt/homebrew/bin/openclaw", "/usr/local/bin/openclaw"]);
    }

    candidates
}

pub(super) fn check_command_exists_candidates(candidates: &[&str]) -> bool {
    candidates.iter().any(|candidate| {
        Command::new(candidate)
            .arg("--help")
            .output()
            .map(|output| output.status.success())
            .unwrap_or(false)
    }) || resolve_command_candidate(candidates).is_some()
}

pub(super) fn check_command_version(candidates: &[&str], arg: &str) -> Option<String> {
    let resolved = resolve_command_candidate(candidates);

    resolved
        .iter()
        .map(String::as_str)
        .chain(candidates.iter().copied())
        .find_map(|candidate| {
            Command::new(candidate)
                .arg(arg)
                .output()
                .ok()
                .filter(|output| output.status.success())
                .map(|output| {
                    if output.stdout.is_empty() {
                        String::from_utf8_lossy(&output.stderr).to_string()
                    } else {
                        String::from_utf8_lossy(&output.stdout).to_string()
                    }
                })
        })
}

pub(super) fn check_ca_certificates() -> bool {
    if cfg!(target_os = "windows") {
        return true;
    }

    let paths = [
        "/etc/ssl/certs/ca-certificates.crt",
        "/etc/ssl/certs/ca-bundle.crt",
        "/usr/share/ca-certificates",
    ];

    paths.iter().any(|path| std::path::Path::new(path).exists())
}

pub(super) fn resolve_command_candidate(candidates: &[&str]) -> Option<String> {
    for candidate in candidates {
        if let Some(path) = locate_single_command(candidate) {
            return Some(path);
        }
    }

    None
}

fn locate_single_command(candidate: &str) -> Option<String> {
    let locator = if cfg!(target_os = "windows") {
        "where"
    } else {
        "which"
    };

    let output = Command::new(locator).arg(candidate).output().ok()?;
    if !output.status.success() {
        return None;
    }

    String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(|line| line.to_string())
}

pub(super) fn clean_ansi(input: &str) -> String {
    let mut result = String::new();
    let mut chars = input.chars().peekable();

    while let Some(ch) = chars.next() {
        if ch == '\x1b' {
            if let Some(&'[') = chars.peek() {
                chars.next();
                while let Some(next) = chars.peek() {
                    if next.is_ascii_alphabetic() {
                        chars.next();
                        break;
                    }
                    if next.is_ascii_digit() || *next == ';' || *next == '?' || *next == ' ' {
                        chars.next();
                        continue;
                    }
                    break;
                }
                continue;
            }
        }

        if ch.is_control() && ch != '\n' && ch != '\r' && ch != '\t' {
            continue;
        }

        result.push(ch);
    }

    result.trim_end().to_string()
}
