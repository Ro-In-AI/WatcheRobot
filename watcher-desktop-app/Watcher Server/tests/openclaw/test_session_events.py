"""测试获取 OpenClaw 实时思考过程和工具调用"""
import asyncio
import json
import time
import os


async def get_session_events():
    """获取 session 文件中的最新事件"""
    session_dir = os.path.expanduser("~/.openclaw/agents/main/sessions")

    # 找到最新的 session 文件
    files = [f for f in os.listdir(session_dir) if f.endswith('.jsonl')]
    if not files:
        print("No session files found")
        return

    # 按修改时间排序
    files.sort(key=lambda f: os.path.getmtime(os.path.join(session_dir, f)), reverse=True)
    latest_file = os.path.join(session_dir, files[0])

    print(f"Reading: {latest_file}")

    # 读取最后几行
    with open(latest_file, 'r') as f:
        lines = f.readlines()
        # 只取最后 20 行
        recent_lines = lines[-20:] if len(lines) > 20 else lines

    for line in recent_lines:
        try:
            event = json.loads(line)
            event_type = event.get('type')
            message = event.get('message', {})

            if event_type == 'message':
                role = message.get('role')
                content = message.get('content', [])

                # 解析内容
                for item in content:
                    if isinstance(item, dict):
                        # thinking
                        if item.get('type') == 'thinking':
                            thinking = item.get('thinking', '')[:100]
                            print(f"🤔 Thinking: {thinking}...")

                        # tool call
                        if item.get('type') == 'toolCall':
                            tool_name = item.get('name')
                            args = item.get('arguments', '')
                            print(f"🔧 Tool Call: {tool_name}")
                            if args:
                                # 截断过长的参数
                                args_str = str(args)[:80]
                                print(f"   Args: {args_str}...")

                        # text
                        if item.get('type') == 'text':
                            text = item.get('text', '')[:100]
                            if text:
                                print(f"💬 {role}: {text}...")

                        # tool result
                        if item.get('type') == 'toolResult':
                            tool_result = item.get('content', [])
                            for result in tool_result:
                                if isinstance(result, dict):
                                    result_text = result.get('text', '')[:100]
                                    print(f"   Result: {result_text}...")

        except json.JSONDecodeError:
            continue


async def main():
    print("=" * 60)
    print("OpenClaw 实时事件测试")
    print("=" * 60)
    print("\n每 3 秒轮询一次 session 文件，按 Ctrl+C 退出\n")

    try:
        while True:
            await get_session_events()
            print("-" * 40)
            await asyncio.sleep(3)
    except KeyboardInterrupt:
        print("\n退出")


if __name__ == "__main__":
    asyncio.run(main())
