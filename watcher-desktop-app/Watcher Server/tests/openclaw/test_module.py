"""OpenClaw 模块测试"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from src.modules.openclaw import LocalOpenClawProvider, ChatMessage


async def main():
    print("="*50)
    print("OpenClaw 模块测试")
    print("="*50)

    # 定义状态回调
    def on_status_change(status, data):
        print(f"  [状态] {status}: {data.get('message', '')}")

    # 创建客户端
    client = LocalOpenClawProvider(on_status_change=on_status_change)

    # 初始化（会检查 OpenClaw 可用性）
    print("\n1. 初始化...")
    try:
        await client.initialize()
        print("   ✅ 初始化成功")
    except RuntimeError as e:
        print(f"   ❌ 初始化失败: {e}")
        return

    # 发送聊天
    print("\n2. 发送聊天...")
    messages = [ChatMessage(role="user", content="你好，请用一句话介绍自己")]

    try:
        response = await client.chat(messages)
        print(f"   回复: {response.content[:100]}...")
        print(f"   模型: {response.model}")
        print("   ✅ 聊天成功")
    except Exception as e:
        print(f"   ❌ 聊天失败: {e}")

    # 清理
    print("\n3. 清理...")
    await client.cleanup()
    print("   ✅ 清理完成")

    print("\n" + "="*50)
    print("测试完成")
    print("="*50)


if __name__ == "__main__":
    asyncio.run(main())
