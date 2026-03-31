"""硬件设备在线状态注册表。"""
from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass, field
from typing import Any


@dataclass
class HardwareDeviceState:
    """单个硬件连接的状态快照。"""

    client_id: int
    online: bool = True
    fw_version: str = ""
    hw_version: str = ""
    board_model: str = ""
    mac: str = ""
    capabilities: Any = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        payload = {
            "client_id": self.client_id,
            "online": self.online,
            "fw_version": self.fw_version,
        }
        if self.hw_version:
            payload["hw_version"] = self.hw_version
        if self.board_model:
            payload["board_model"] = self.board_model
        if self.mac:
            payload["mac"] = self.mac
        if self.capabilities not in (None, "", [], {}):
            payload["capabilities"] = deepcopy(self.capabilities)
        return payload


class DeviceRegistry:
    """维护当前在线硬件设备的最小状态。"""

    def __init__(self):
        self._hardware_states: dict[object, HardwareDeviceState] = {}

    def update_hardware_hello(
        self,
        websocket: object,
        *,
        client_id: int,
        fw_version: str,
    ) -> HardwareDeviceState:
        state = self._hardware_states.get(websocket)
        if state is None:
            state = HardwareDeviceState(client_id=client_id)
            self._hardware_states[websocket] = state

        state.online = True
        state.fw_version = fw_version
        return state

    def update_hardware_firmware(
        self,
        websocket: object,
        payload: dict[str, Any],
        *,
        client_id: int,
    ) -> HardwareDeviceState:
        state = self._hardware_states.get(websocket)
        if state is None:
            state = HardwareDeviceState(client_id=client_id)
            self._hardware_states[websocket] = state

        state.online = True
        if isinstance(payload.get("fw_version"), str) and payload["fw_version"].strip():
            state.fw_version = payload["fw_version"].strip()
        if isinstance(payload.get("hw_version"), str) and payload["hw_version"].strip():
            state.hw_version = payload["hw_version"].strip()
        if isinstance(payload.get("board_model"), str) and payload["board_model"].strip():
            state.board_model = payload["board_model"].strip()
        if isinstance(payload.get("mac"), str) and payload["mac"].strip():
            state.mac = payload["mac"].strip()
        if "capabilities" in payload:
            state.capabilities = deepcopy(payload["capabilities"])
        return state

    def remove_hardware(self, websocket: object) -> bool:
        return self._hardware_states.pop(websocket, None) is not None

    def snapshot(self) -> list[dict[str, Any]]:
        return [
            state.to_dict()
            for _, state in sorted(
                self._hardware_states.items(),
                key=lambda item: item[1].client_id,
            )
        ]

