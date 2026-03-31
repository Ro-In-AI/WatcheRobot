use std::io::{BufRead, BufReader, Read};
use tauri::{AppHandle, Emitter};

pub(super) fn spawn_log_forwarder<R>(app: AppHandle, reader: R, stream_name: &'static str)
where
    R: Read + Send + 'static,
{
    std::thread::spawn(move || {
        let mut reader = BufReader::new(reader);
        let mut buffer = Vec::new();

        loop {
            buffer.clear();

            match reader.read_until(b'\n', &mut buffer) {
                Ok(0) => break,
                Ok(_) => {
                    let line = String::from_utf8_lossy(&buffer);
                    let clean_line =
                        clean_ansi(line.trim_end_matches(|ch| ch == '\r' || ch == '\n'));

                    if !clean_line.trim().is_empty() {
                        let terminal_line =
                            format!("[watcher-server:{}] {}", stream_name, clean_line.trim());
                        if stream_name == "stderr" {
                            eprintln!("{}", terminal_line);
                        } else {
                            println!("{}", terminal_line);
                        }
                        let _ = app.emit(
                            "server-log",
                            format!("[{}] {}", stream_name, clean_line.trim()),
                        );
                    }
                }
                Err(error) => {
                    eprintln!("[watcher-server:{}] read failed: {}", stream_name, error);
                    let _ = app.emit(
                        "server-log",
                        format!("[错误] 读取 {} 输出失败: {}", stream_name, error),
                    );
                    break;
                }
            }
        }
    });
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
