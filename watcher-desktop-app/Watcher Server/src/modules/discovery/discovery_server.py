"""UDP 服务发现服务器

功能：
1. 监听 ESP32 的发现请求
2. 响应服务器 IP 和 WebSocket 端口
3. 记录已发现的设备
"""
import asyncio
import json
import socket
from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, Optional

from src.config import settings
from src.utils.logger import get_logger

logger = get_logger(__name__)


@dataclass
class DiscoveredDevice:
    """已发现的设备信息"""
    device_id: str
    mac: str
    last_seen: datetime
    ip: str = ""


class DiscoveryServer:
    """UDP 服务发现服务器

    监听局域网内的设备发现请求，并响应服务器信息
    """

    def __init__(self, port: int = None, ws_port: int = None):
        """初始化发现服务器

        Args:
            port: UDP 监听端口，默认从配置读取
            ws_port: WebSocket 服务端口，默认从配置读取
        """
        self.port = port or getattr(settings, 'discovery_port', 37020)
        self.ws_port = ws_port or settings.ws_port

        # UDP 传输层
        self.transport: Optional[asyncio.DatagramTransport] = None

        # 本机 IP
        self._local_ip: str = "127.0.0.1"

        # 已发现的设备记录
        self._discovered_devices: Dict[str, DiscoveredDevice] = {}

        logger.info(f"发现服务器初始化: udp_port={self.port}, ws_port={self.ws_port}")

    @property
    def is_running(self) -> bool:
        """当前 UDP 发现服务是否正在监听。"""
        return self.transport is not None

    async def get_local_ip(self) -> str:
        """获取本机局域网 IP 地址

        优先选择 192.168.x.x 或 10.x.x.x 等局域网地址，
        排除 127.x.x.x（回环）和 198.18/19.x.x（VPN/虚拟机）

        Returns:
            str: 本机 IP 地址
        """
        import subprocess
        import platform

        # 网卡排除列表（VPN、虚拟机等）
        EXCLUDE_PREFIXES = ('127.', '198.18.', '198.19.', '169.254.')

        def is_valid_ip(ip: str) -> bool:
            """检查是否为有效的局域网 IP"""
            return not ip.startswith(EXCLUDE_PREFIXES)

        try:
            # 方法 1：通过外部连接获取（原有方式）
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.settimeout(0)
            try:
                s.connect(("8.8.8.8", 80))
                ip = s.getsockname()[0]
                s.close()
                if is_valid_ip(ip):
                    logger.debug(f"获取本机 IP: {ip}")
                    return ip
            except:
                s.close()

            # 方法 2：根据系统使用不同命令获取局域网 IP
            system = platform.system()
            try:
                # Linux 使用 hostname -I
                if system == 'Linux':
                    result = subprocess.run(
                        ['hostname', '-I'],
                        capture_output=True,
                        text=True,
                        timeout=2
                    )
                    if result.returncode == 0:
                        ips = result.stdout.strip().split()
                        for ip in ips:
                            if is_valid_ip(ip):
                                logger.debug(f"获取本机 IP（hostname -I）: {ip}")
                                return ip

                # macOS 使用 ipconfig（尝试多个接口：en0 通常是 WiFi，en1 可能是以太网）
                elif system == 'Darwin':
                    for iface in ['en0', 'en1', 'en2']:
                        result = subprocess.run(
                            ['ipconfig', 'getifaddr', iface],
                            capture_output=True,
                            text=True,
                            timeout=2
                        )
                        if result.returncode == 0 and result.stdout.strip():
                            ip = result.stdout.strip()
                            if is_valid_ip(ip):
                                logger.debug(f"获取本机 IP（ipconfig {iface}）: {ip}")
                                return ip

                # Windows 使用 ipconfig
                elif system == 'Windows':
                    result = subprocess.run(
                        ['ipconfig'],
                        capture_output=True,
                        text=True,
                        timeout=5
                    )
                    if result.returncode == 0:
                        # 解析 ipconfig 输出，查找 IPv4 地址
                        import re
                        # 匹配 "IPv4 地址 . . . . . . . . . . . : 192.168.x.x" 或类似格式
                        ipv4_pattern = r'IPv4.*?:\s*(\d+\.\d+\.\d+\.\d+)'
                        matches = re.findall(ipv4_pattern, result.stdout)
                        for ip in matches:
                            if is_valid_ip(ip):
                                logger.debug(f"获取本机 IP（ipconfig）: {ip}")
                                return ip
            except Exception as e:
                logger.debug(f"获取本机 IP 失败: {e}")

            # 方法 3：使用 UDP socket 尝试获取
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.settimeout(0)
            try:
                # 尝试连接到局域网IP段
                for prefix in ('192.168.', '10.'):
                    for i in range(1, 255):
                        try:
                            test_ip = f"{prefix}{i}"
                            s.connect((test_ip, 1))
                            ip = s.getsockname()[0]
                            if is_valid_ip(ip):
                                s.close()
                                logger.debug(f"获取本机 IP（UDP探测）: {ip}")
                                return ip
                        except:
                            continue
            except:
                s.close()

            logger.warning("未能获取有效的局域网 IP，使用 127.0.0.1")
            return "127.0.0.1"

        except Exception as e:
            logger.warning(f"获取本机 IP 失败，使用默认值: {e}")
            return "127.0.0.1"

    async def start(self):
        """启动发现服务器"""
        if self.is_running:
            return

        self._local_ip = await self.get_local_ip()

        loop = asyncio.get_event_loop()

        # 创建 UDP endpoint（macOS/Linux 不支持 reuse_address）
        self.transport, _ = await loop.create_datagram_endpoint(
            lambda: DiscoveryProtocol(self),
            local_addr=('0.0.0.0', self.port),
        )

        logger.info(f"✓ 服务发现服务器已启动")
        logger.info(f"  监听地址: 0.0.0.0:{self.port}")
        logger.info(f"  本机 IP: {self._local_ip}")
        logger.info(f"  WebSocket 端口: {self.ws_port}")

    async def stop(self):
        """停止发现服务器"""
        if not self.transport:
            return

        self.transport.close()
        self.transport = None
        logger.info("服务发现服务器已停止")

    def create_response(self) -> bytes:
        """创建服务响应消息

        Returns:
            bytes: JSON 格式的响应消息
        """
        response = {
            "cmd": "ANNOUNCE",
            "ip": self._local_ip,
            "port": self.ws_port,
            "version": settings.service_version,
            "protocol_version": settings.protocol_version,
            "server": settings.service_name,
        }
        return json.dumps(response, ensure_ascii=False).encode('utf-8')

    def register_device(self, device_id: str, mac: str, ip: str):
        """注册发现的设备

        Args:
            device_id: 设备 ID
            mac: MAC 地址
            ip: 设备 IP
        """
        self._discovered_devices[device_id] = DiscoveredDevice(
            device_id=device_id,
            mac=mac,
            last_seen=datetime.now(),
            ip=ip
        )
        logger.info(f"注册设备: {device_id} ({ip})")

    def get_discovered_devices(self) -> list:
        """获取已发现的设备列表

        Returns:
            list: 设备信息列表
        """
        return [
            {
                "device_id": dev.device_id,
                "mac": dev.mac,
                "ip": dev.ip,
                "last_seen": dev.last_seen.isoformat()
            }
            for dev in self._discovered_devices.values()
        ]


class DiscoveryProtocol(asyncio.DatagramProtocol):
    """UDP 协议处理器

    处理接收到的 UDP 数据包
    """

    def __init__(self, server: DiscoveryServer):
        """初始化协议处理器

        Args:
            server: 发现服务器实例
        """
        self.server = server

    def connection_made(self, transport):
        """连接建立时的回调"""
        self.transport = transport

    def datagram_received(self, data: bytes, addr: tuple):
        """接收到 UDP 数据包

        Args:
            data: 接收到的数据
            addr: 发送方地址 (ip, port)
        """
        try:
            # 解析 JSON 消息
            message = json.loads(data.decode('utf-8'))

            # 检查是否为发现请求
            if message.get('cmd') == 'DISCOVER':
                self._handle_discovery(message, addr)
            else:
                logger.debug(f"未知命令: {message.get('cmd')}")

        except json.JSONDecodeError:
            logger.warning(f"无效的 JSON 数据: {data[:100]}...")
        except Exception as e:
            logger.error(f"处理数据包失败: {e}", exc_info=True)

    def _handle_discovery(self, message: dict, addr: tuple):
        """处理发现请求

        Args:
            message: 解析后的消息
            addr: 发送方地址 (ip, port)
        """
        device_id = message.get('device_id', 'unknown')
        mac = message.get('mac', '')

        logger.info(f"📡 收到发现请求: device_id={device_id}, mac={mac}, from={addr[0]}")

        # 注册设备
        self.server.register_device(device_id, mac, addr[0])

        # 发送响应（单播到设备 IP，避免广播风暴）
        try:
            response = self.server.create_response()
            self.transport.sendto(response, addr)
            logger.info(f"📤 发送服务响应到 {addr[0]}:{addr[1]}: {response.decode()}")
        except Exception as e:
            logger.error(f"发送响应失败: {e}")

    def error_received(self, exc):
        """接收错误时的回调"""
        logger.error(f"UDP 错误: {exc}")
