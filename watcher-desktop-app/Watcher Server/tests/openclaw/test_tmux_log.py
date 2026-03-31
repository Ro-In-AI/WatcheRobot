"""OpenClaw 实时日志测试 - 使用 tmux 捕获实时日志"""
import asyncio
import subprocess
import sys
import time


SESSION_NAME = "openclaw_test"


def ensure_session():
    """确保 tmux session 存在"""
    result = subprocess.run(
        ["tmux", "has-session", "-t", SESSION_NAME],
        capture_output=True
    )

    if result.returncode != 0:
        subprocess.run(
            ["tmux", "new-session", "-d", "-s", SESSION_NAME],
            check=True
        )
        print(f"✅ 创建 tmux session: {SESSION_NAME}")


def send_command(message: str):
    """发送命令到 tmux"""
    # 先清空可能存在的命令
    subprocess.run(
        ["tmux", "send-keys", "-t", SESSION_NAME, "C-c"],
        capture_output=True
    )
    time.sleep(0.3)

    # 发送新命令
    cmd = f'openclaw agent --agent main --message "{message}"'
    subprocess.run(
        ["tmux", "send-keys", "-t", SESSION_NAME, cmd, "Enter"],
        check=True
    )


def capture_log():
    """捕获 tmux pane 内容"""
    result = subprocess.run(
        ["tmux", "capture-pane", "-t", SESSION_NAME, "-p", "-S", "-100"],
        capture_output=True,
        text=True
    )
    return result.stdout


def run_and_capture(message: str):
    """运行并捕获实时日志"""
    ensure_session()
    send_command(message)

    print(f"📤 已发送消息: {message}")
    print("=" * 60)
    print("📻 实时日志输出 (每2秒刷新):")
    print("=" * 60 + "\n")

    last_content = ""
    max_time = 300  # 5分钟超时
    start_time = time.time()

    while True:
        if time.time() - start_time > max_time:
            print("\n⏰ 超时，停止捕获")
            break

        try:
            content = capture_log()

            # 只打印新增的部分（对比之前的最后几行）
            if content != last_content:
                # 找出新增的行
                old_lines = last_content.split('\n') if last_content else []
                new_lines = content.split('\n')

                # 找到第一行不同的位置
                start_idx = 0
                for i, line in enumerate(new_lines):
                    if i >= len(old_lines) or line != old_lines[i]:
                        start_idx = i
                        break

                # 打印新增的行
                for line in new_lines[start_idx:]:
                    if line.strip():
                        print(line)
                sys.stdout.flush()

                last_content = content

            # 检测是否完成（出现 shell prompt）
            stripped = content.strip()
            if stripped.endswith("$") or stripped.endswith(">") or stripped.endswith("%"):
                # 等2秒确保真的完成
                time.sleep(2)
                content = capture_log()
                if content != last_content:
                    print(content[len(last_content):], end="")
                break

        except Exception as e:
            print(f"⚠️ 错误: {e}")
            break

        time.sleep(2)  # 每2秒刷新一次

    print("\n" + "=" * 60)
    print("✅ 执行完成")


def main():
    message = "你还记得你有什么长期的记忆吗"

    print(f"🚀 开始测试 OpenClaw 实时日志 (tmux 方式)")
    print(f"📝 提问: {message}\n")

    try:
        run_and_capture(message)
    except KeyboardInterrupt:
        print("\n⚠️ 被中断")
    finally:
        # 清理
        subprocess.run(
            ["tmux", "send-keys", "-t", SESSION_NAME, "C-c"],
            capture_output=True
        )


if __name__ == "__main__":
    main()
