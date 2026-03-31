"""OpenClaw 本地服务测试"""
import asyncio
import json
import os
import sys
import time

# 添加项目根目录到路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from src.config import settings
from src.utils.logger import get_logger

logger = get_logger(__name__)


class OpenClawClient:
    """OpenClaw 本地 CLI 客户端"""

    # 默认配置
    DEFAULT_AGENT = "main"
    DEFAULT_URL = "ws://127.0.0.1:18789"
    DEFAULT_TOKEN = "c8a603498d06f46f871e6971f184f296e5046c8568bed5ab"

    def __init__(self, agent: str = None, token: str = None):
        """初始化客户端

        Args:
            agent: Agent ID，默认 main
            token: Gateway token
        """
        self.agent = agent or self.DEFAULT_AGENT
        self.token = token or self.DEFAULT_TOKEN
        self.last_session_id = None
        self.last_updated_at = None
        logger.info(f"OpenClaw 客户端初始化: agent={self.agent}")

    async def get_status(self) -> dict:
        """获取 Gateway 状态

        Returns:
            dict: 状态信息
        """
        proc = await asyncio.create_subprocess_exec(
            "openclaw", "gateway", "call", "status",
            "--json",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        stdout, stderr = await proc.communicate()

        if proc.returncode != 0:
            error_msg = stderr.decode() if stderr else "Unknown error"
            raise RuntimeError(f"获取状态失败: {error_msg}")

        result = json.loads(stdout)
        return result

    async def get_session_status(self, session_key: str = None) -> dict:
        """获取 Session 状态

        Args:
            session_key: 会话 key，默认获取最新的

        Returns:
            dict: Session 状态信息
        """
        status = await self.get_status()

        # 获取最近的 session
        sessions = status.get("sessions", {}).get("recent", [])
        if not sessions:
            return {}

        # 如果没有指定 session_key，返回最新的
        if session_key is None:
            return sessions[0] if sessions else {}

        # 查找指定的 session
        for session in sessions:
            if session.get("key") == session_key:
                return session

        return {}

    async def chat(self, message: str) -> dict:
        """发送聊天请求

        Args:
            message: 用户消息

        Returns:
            dict: 完整响应结果
        """
        # 记录发送前的时间
        self.last_updated_at = int(time.time() * 1000)

        proc = await asyncio.create_subprocess_exec(
            "openclaw", "agent",
            "--agent", self.agent,
            "--message", message,
            "--json",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        stdout, stderr = await proc.communicate()

        if proc.returncode != 0:
            error_msg = stderr.decode() if stderr else "Unknown error"
            raise RuntimeError(f"OpenClaw 调用失败: {error_msg}")

        result = json.loads(stdout)

        # 保存 session ID
        meta = result.get("result", {}).get("meta", {})
        self.last_session_id = meta.get("sessionId")

        return result

    async def chat_once(self, message: str) -> str:
        """单次对话

        Args:
            message: 用户消息

        Returns:
            str: AI 回复文本
        """
        result = await self.chat(message)

        # 提取回复内容
        payloads = result.get("result", {}).get("payloads", [])
        if payloads and "text" in payloads[0]:
            return payloads[0]["text"]

        return ""

    async def get_usage(self, message: str) -> dict:
        """获取对话使用量统计

        Args:
            message: 用户消息

        Returns:
            dict: 使用量信息
        """
        result = await self.chat(message)
        meta = result.get("result", {}).get("meta", {})
        return meta.get("agentMeta", {}).get("usage", {})

    async def chat_with_status_tracking(
        self,
        message: str,
        on_thinking: callable = None,
        on_processing: callable = None,
        poll_interval: float = 0.5,
        timeout: float = 60.0
    ) -> dict:
        """带状态跟踪的聊天（轮询方案）

        Args:
            message: 用户消息
            on_thinking: 收到思考中状态时的回调
            on_processing: 收到处理中状态时的回调
            poll_interval: 轮询间隔（秒）
            timeout: 超时时间（秒）

        Returns:
            dict: 完整响应结果
        """
        start_time = time.time()
        last_updated = self.last_updated_at

        # 启动聊天任务
        chat_task = asyncio.create_task(self.chat(message))

        # 轮询状态直到聊天完成
        while not chat_task.done():
            # 检查超时
            if time.time() - start_time > timeout:
                chat_task.cancel()
                raise TimeoutError(f"聊天超时（{timeout}秒）")

            # 查询状态
            try:
                status = await self.get_status()
                sessions = status.get("sessions", {}).get("recent", [])

                if sessions:
                    session = sessions[0]
                    updated_at = session.get("updatedAt", 0)
                    age = session.get("age", 0)

                    # 检查是否有新的活动
                    if updated_at > (last_updated or 0):
                        # 计算处理时间
                        elapsed = (int(time.time() * 1000) - updated_at) / 1000

                        # 根据 age 判断状态
                        # age < 5000ms 可能还在处理中
                        if age < 5000:
                            status_text = "思考中..."
                            if on_thinking:
                                on_thinking(elapsed, age)
                        else:
                            status_text = "处理中..."
                            if on_processing:
                                on_processing(elapsed, age)

                        print(f"  [状态] {status_text} (耗时: {elapsed:.1f}s)")

                        last_updated = updated_at

            except Exception as e:
                logger.warning(f"轮询状态失败: {e}")

            # 等待间隔
            await asyncio.sleep(poll_interval)

        # 返回结果
        return await chat_task


async def test_basic_chat():
    """测试基本聊天功能"""
    print("\n" + "="*50)
    print("测试 1: 基本聊天")
    print("="*50)

    try:
        client = OpenClawClient()

        # 简单对话
        message = "你好，请用一句话介绍你自己"
        print(f"\n用户: {message}")

        reply = await client.chat_once(message)
        print(f"助手: {reply}")

        print("\n✅ 测试通过")
        return True

    except Exception as e:
        print(f"\n❌ 测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False


async def test_with_usage():
    """测试并获取使用量"""
    print("\n" + "="*50)
    print("测试 2: 获取使用量统计")
    print("="*50)

    try:
        client = OpenClawClient()

        message = "什么是 Python？"
        print(f"\n用户: {message}")

        reply = await client.chat_once(message)
        print(f"助手: {reply[:100]}...")

        usage = await client.get_usage(message)
        print(f"\n使用量统计:")
        print(f"  输入 tokens: {usage.get('input', 0)}")
        print(f"  输出 tokens: {usage.get('output', 0)}")
        print(f"  总计: {usage.get('total', 0)}")

        print("\n✅ 测试通过")
        return True

    except Exception as e:
        print(f"\n❌ 测试失败: {e}")
        return False


async def test_multi_turn():
    """测试多轮对话"""
    print("\n" + "="*50)
    print("测试 3: 多轮对话")
    print("="*50)

    try:
        client = OpenClawClient()

        # 第一轮
        message1 = "我想学习编程"
        print(f"\n用户: {message1}")
        reply1 = await client.chat_once(message1)
        print(f"助手: {reply1[:100]}...")

        # 第二轮（使用同一 client 会自动保持会话上下文）
        message2 = "从哪里开始？"
        print(f"\n用户: {message2}")
        reply2 = await client.chat_once(message2)
        print(f"助手: {reply2[:100]}...")

        print("\n✅ 测试通过")
        return True

    except Exception as e:
        print(f"\n❌ 测试失败: {e}")
        return False


async def test_status_polling():
    """测试状态轮询"""
    print("\n" + "="*50)
    print("测试 4: 状态轮询（实时状态跟踪）")
    print("="*50)

    try:
        client = OpenClawClient()

        # 定义状态回调
        def on_thinking(elapsed, age):
            print(f"  [思考中] elapsed={elapsed:.1f}s, age={age}ms")

        def on_processing(elapsed, age):
            print(f"  [处理中] elapsed={elapsed:.1f}s, age={age}ms")

        message = "用Python写一个简单的Hello World程序"
        print(f"\n用户: {message}")
        print("\n开始轮询状态...")

        result = await client.chat_with_status_tracking(
            message,
            on_thinking=on_thinking,
            on_processing=on_processing,
            poll_interval=0.3,
            timeout=30.0
        )

        # 提取回复
        payloads = result.get("result", {}).get("payloads", [])
        if payloads:
            reply = payloads[0].get("text", "")
            print(f"\n助手: {reply[:200]}...")

        # 获取最终状态
        final_status = await client.get_session_status()
        print(f"\n最终状态:")
        print(f"  Session: {final_status.get('key')}")
        print(f"  Model: {final_status.get('model')}")
        print(f"  Total Tokens: {final_status.get('totalTokens', 0)}")
        print(f"  Context使用率: {final_status.get('percentUsed', 0)}%")

        print("\n✅ 测试通过")
        return True

    except Exception as e:
        print(f"\n❌ 测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False


async def test_status_query():
    """测试状态查询"""
    print("\n" + "="*50)
    print("测试 5: 状态查询")
    print("="*50)

    try:
        client = OpenClawClient()

        # 获取 Gateway 状态
        status = await client.get_status()
        print("\nGateway 状态:")
        print(f"  活跃 Session 数: {status.get('sessions', {}).get('count', 0)}")

        # 获取 Session 状态
        session_status = await client.get_session_status()
        if session_status:
            print(f"\n当前 Session:")
            print(f"  Key: {session_status.get('key')}")
            print(f"  Model: {session_status.get('model')}")
            print(f"  Provider: {session_status.get('modelProvider')}")
            print(f"  Input Tokens: {session_status.get('inputTokens', 0)}")
            print(f"  Output Tokens: {session_status.get('outputTokens', 0)}")
            print(f"  Total Tokens: {session_status.get('totalTokens', 0)}")
            print(f"  Context使用率: {session_status.get('percentUsed', 0)}%")

        print("\n✅ 测试通过")
        return True

    except Exception as e:
        print(f"\n❌ 测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False


async def main():
    """主函数"""
    print("="*50)
    print("OpenClaw 本地服务测试")
    print("="*50)

    # 检查 OpenClaw 是否可用
    try:
        proc = await asyncio.create_subprocess_exec(
            "openclaw", "--version",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        await proc.communicate()
        if proc.returncode != 0:
            raise Exception("OpenClaw CLI 不可用")
    except FileNotFoundError:
        print("\n❌ 未找到 OpenClaw，请先安装")
        return
    except Exception as e:
        print(f"\n❌ OpenClaw 不可用: {e}")
        return

    print("\nOpenClaw CLI 可用")

    # 检查网关状态
    print("\n检查网关状态...")
    proc = await asyncio.create_subprocess_exec(
        "openclaw", "gateway", "status",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, _ = await proc.communicate()
    status_output = stdout.decode()
    print(status_output)

    if "running" not in status_output.lower():
        print("\n⚠️  网关未运行，请运行: openclaw gateway start")
        return

    # 运行测试
    await test_basic_chat()
    await test_status_query()
    await test_status_polling()

    print("\n" + "="*50)
    print("所有测试完成")
    print("="*50)


if __name__ == "__main__":
    asyncio.run(main())
