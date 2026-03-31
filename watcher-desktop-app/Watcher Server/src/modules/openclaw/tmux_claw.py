"""OpenClaw Session 日志实现 - 通过读取 session 文件获取实时思考过程和工具调用"""
import asyncio
import inspect
import json
import os
import shutil
import subprocess
from typing import Callable, List, Optional, Set

from src.modules.openclaw.local_claw import LocalOpenClawProvider
from src.modules.openclaw.registry import register_provider
from src.utils.logger import get_logger

logger = get_logger(__name__)


@register_provider("tmux", {
    "agent": str,
    "poll_interval": int,
    "log_poll_interval": int,
    "api_url": str,
    "api_key": str,
    "model": str,
})
class TmuxOpenClawProvider(LocalOpenClawProvider):
    """使用 Session 日志的 OpenClaw 提供商

    相比 CLI 方式，额外提供：
    - 实时思考过程（thinking）
    - 工具调用（toolCall）
    - 工具执行结果（toolResult）

    通过轮询 session .jsonl 文件获取这些信息
    """

    def __init__(
        self,
        agent: str = "main",
        poll_interval: int = 3,
        log_poll_interval: int = 1,
        api_url: Optional[str] = None,
        api_key: str = "",
        model: Optional[str] = None,
        on_status_change: Callable[[str, dict], None] = None,
        on_log: Callable[[str, str], None] = None,
    ):
        """初始化

        Args:
            agent: Agent ID
            poll_interval: 状态轮询间隔（秒）
            log_poll_interval: 日志轮询间隔（秒）
            on_status_change: 状态变化回调
            on_log: 日志回调，参数: (log_content, log_type)
                     log_type: thinking, tool_call, tool_result, text
        """
        super().__init__(
            agent=agent,
            poll_interval=poll_interval,
            api_url=api_url,
            api_key=api_key,
            model=model,
            on_status_change=on_status_change,
        )
        self.log_poll_interval = log_poll_interval
        self.on_log = on_log

        # Session 文件相关
        self._session_dir = os.path.expanduser(f"~/.openclaw/agents/{agent}/sessions")
        self._current_session_file = None
        self._last_line_count = 0
        self._last_sent_events: Set[str] = set()  # 避免重复发送

    @staticmethod
    def is_tmux_available() -> bool:
        """检测系统是否支持 tmux（保留兼容性）"""
        return shutil.which("tmux") is not None

    async def initialize(self):
        """初始化

        检查:
        - openclaw CLI 可用性
        - Gateway 运行状态
        """
        logger.info("初始化 OpenClaw Session 日志客户端...")

        # 检查 CLI 可用性
        try:
            proc = await asyncio.create_subprocess_exec(
                "openclaw", "--version",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            await proc.communicate()

            if proc.returncode != 0:
                raise RuntimeError("OpenClaw CLI 不可用")

        except FileNotFoundError:
            raise RuntimeError("未找到 openclaw 命令，请确保已安装 OpenClaw")

        # 检查 Gateway 状态
        try:
            proc = await asyncio.create_subprocess_exec(
                "openclaw", "gateway", "status",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, _ = await proc.communicate()
            output = stdout.decode()

            if "running" not in output.lower():
                raise RuntimeError("OpenClaw Gateway 未运行，请运行: openclaw gateway start")

        except Exception as e:
            raise RuntimeError(f"OpenClaw Gateway 检查失败: {e}")

        # 确保 session 目录存在
        if not os.path.exists(self._session_dir):
            os.makedirs(self._session_dir)

        self._refresh_agent_capabilities()
        self._is_initialized = True
        logger.info(
            "OpenClaw Session 日志客户端初始化完成: agent={}, model={}, inputs={}",
            self.agent,
            self._agent_model_id or "(unknown)",
            sorted(self._agent_model_inputs) if self._agent_model_inputs else ["unknown"],
        )

    def _get_latest_session_file(self) -> Optional[str]:
        """获取最新的 session 文件"""
        try:
            files = [f for f in os.listdir(self._session_dir) if f.endswith('.jsonl')]
            if not files:
                return None

            # 按修改时间排序
            files.sort(
                key=lambda f: os.path.getmtime(os.path.join(self._session_dir, f)),
                reverse=True
            )
            return os.path.join(self._session_dir, files[0])
        except Exception as e:
            logger.warning(f"获取 session 文件失败: {e}")
            return None

    def _parse_session_events(self, file_path: str) -> List[dict]:
        """解析 session 文件中的事件

        Returns:
            List[dict]: 事件列表，每个事件包含 type, role, content 等
        """
        events = []
        try:
            with open(file_path, 'r') as f:
                lines = f.readlines()

            # 只读取新行
            if len(lines) <= self._last_line_count:
                return []

            new_lines = lines[self._last_line_count:]
            self._last_line_count = len(lines)

            for line in new_lines:
                try:
                    event = json.loads(line)
                    events.append(event)
                except json.JSONDecodeError:
                    continue

        except Exception as e:
            logger.warning(f"解析 session 文件失败: {e}")

        return events

    def _extract_log_info(self, event: dict) -> Optional[tuple]:
        """从事件中提取日志信息

        Returns:
            tuple: (log_type, log_content) 或 None
                   log_type: thinking, tool_call, tool_result, text
        """
        event_type = event.get('type')
        if event_type != 'message':
            return None

        message = event.get('message', {})
        role = message.get('role')
        content = message.get('content', [])

        if not isinstance(content, list):
            return None

        for item in content:
            if not isinstance(item, dict):
                continue

            item_type = item.get('type')

            # Thinking
            if item_type == 'thinking':
                thinking = item.get('thinking', '')
                if thinking:
                    # 生成唯一 ID 避免重复
                    event_id = f"thinking:{event.get('id', '')}"
                    if event_id not in self._last_sent_events:
                        self._last_sent_events.add(event_id)
                        # 限制长度
                        return ('thinking', thinking[:500])

            # Tool Call
            if item_type == 'toolCall':
                tool_name = item.get('name', 'unknown')
                args = item.get('arguments', {})
                event_id = f"tool_call:{event.get('id', '')}"

                if event_id not in self._last_sent_events:
                    self._last_sent_events.add(event_id)

                    # 格式化工具调用信息
                    args_str = json.dumps(args, ensure_ascii=False)
                    if len(args_str) > 200:
                        args_str = args_str[:200] + "..."

                    return ('tool_call', f"🔧 {tool_name}: {args_str}")

            # Tool Result
            if role == 'toolResult':
                tool_result = item.get('content', [])
                event_id = f"tool_result:{event.get('id', '')}"

                if event_id not in self._last_sent_events:
                    self._last_sent_events.add(event_id)

                    # 提取结果文本
                    result_text = ""
                    for result in tool_result:
                        if isinstance(result, dict):
                            text = result.get('text', '')
                            if text:
                                result_text = text[:300]  # 限制长度
                                break

                    if result_text:
                        return ('tool_result', f"📤 {result_text}")

            # Text (最终回复)
            if item_type == 'text':
                text = item.get('text', '')
                if text and role == 'assistant':
                    event_id = f"text:{event.get('id', '')}"
                    if event_id not in self._last_sent_events:
                        self._last_sent_events.add(event_id)
                        return ('text', text[:200])

        return None

    async def _call_log_callback(self, log_type: str, content: str):
        """调用日志回调

        Args:
            log_type: 日志类型 (thinking, tool_call, tool_result, text)
            content: 日志内容
        """
        if not self.on_log or not content:
            return

        try:
            if inspect.iscoroutinefunction(self.on_log):
                await self.on_log(content, log_type)
            else:
                self.on_log(content, log_type)
        except Exception as e:
            logger.warning(f"日志回调调用失败: {e}")

    async def cleanup(self):
        """清理资源"""
        self._is_initialized = False
        self._last_sent_events.clear()
        logger.info("OpenClaw Session 日志客户端已清理")

    async def _chat_with_status(self, message: str) -> dict:
        """带状态和日志跟踪的聊天

        Args:
            message: 用户消息

        Returns:
            dict: 响应结果
        """
        self._last_line_count = 0
        self._last_sent_events.clear()
        self._current_session_file = None

        # 获取当前最新的 session 文件
        self._current_session_file = self._get_latest_session_file()
        if self._current_session_file:
            # 设置已读取的行数
            with open(self._current_session_file, 'r') as f:
                self._last_line_count = len(f.readlines())
            logger.info(f"监听 session 文件: {self._current_session_file}")

        # 启动 CLI 进程获取结果
        cli_process = await asyncio.create_subprocess_exec(
            "openclaw", "agent",
            "--agent", self.agent,
            "--message", message,
            "--json",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        cli_task = asyncio.create_task(cli_process.communicate())

        # 标记为思考中
        await self._call_status_callback(self.Status.THINKING, {"message": "Thinking..."})

        # 轮询状态和日志
        last_status = None
        cli_result = None
        cli_done = False

        while True:
            # 检查 CLI 进程是否完成
            if not cli_done and cli_task.done():
                cli_done = True
                stdout, stderr = await cli_task
                logger.info(f"CLI 进程完成，返回码: {cli_process.returncode}")

                if cli_process.returncode == 0:
                    try:
                        # 解码并清理 ANSI 转义序列
                        stdout_str = stdout.decode('utf-8') if stdout else ''
                        # 移除 ANSI 转义序列（如 \x1b[35m）
                        import re
                        stdout_str = re.sub(r'\x1b\[[0-9;]*m', '', stdout_str)
                        # 找到 JSON 开始位置（第一个 '{'）
                        json_start = stdout_str.find('{')
                        if json_start >= 0:
                            stdout_str = stdout_str[json_start:]
                        cli_result = json.loads(stdout_str)
                        logger.info(f"CLI JSON 解析成功")
                    except json.JSONDecodeError as e:
                        logger.warning(f"CLI JSON 解析失败: {e}")
                        logger.warning(f"CLI stdout 内容: {stdout[:500] if stdout else '(empty)'}")
                        logger.warning(f"CLI stderr 内容: {stderr[:500] if stderr else '(empty)'}")
                        cli_result = None

                break

            # 查询状态
            try:
                status = await self._get_session_status()
                if status:
                    age = status.get("age", 0)

                    if age < 5000:
                        current_status = self.Status.THINKING
                    else:
                        current_status = self.Status.PROCESSING

                    # 状态变化时发送回调
                    if current_status != last_status:
                        last_status = current_status
                        await self._call_status_callback(
                            current_status,
                            {"message": "Processing...", "age": age}
                        )

            except Exception as e:
                logger.warning(f"轮询状态失败: {e}")

            # 读取 session 文件获取实时日志
            if self._current_session_file:
                try:
                    events = self._parse_session_events(self._current_session_file)

                    for event in events:
                        log_info = self._extract_log_info(event)
                        if log_info:
                            log_type, log_content = log_info
                            await self._call_log_callback(log_type, log_content)

                except Exception as e:
                    logger.warning(f"读取 session 日志失败: {e}")

            await asyncio.sleep(self.log_poll_interval)

        # 返回 CLI 结果
        if cli_result:
            return cli_result

        # 如果 CLI 失败，返回空结果
        return {
            "status": "ok",
            "result": {
                "payloads": [
                    {"text": ""}
                ]
            }
        }
