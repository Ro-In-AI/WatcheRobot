import asyncio
import websockets
import uuid
import json
import gzip
import copy
import os
from websockets.protocol import State

Access_Key=os.getenv("Access_Key")
App_Key=os.getenv("App_Key")
voice_type=os.getenv("voice_type")

class TTSClient:
    # 消息类型常量
    MESSAGE_TYPES = {
        0xb: "audio-only server response",
        0xc: "frontend server response",
        0xf: "error message from server"
    }
    
    MESSAGE_TYPE_SPECIFIC_FLAGS = {
        0: "no sequence number",
        1: "sequence number > 0",
        2: "last message from server (seq < 0)",
        3: "sequence number < 0"
    }
    
    MESSAGE_SERIALIZATION_METHODS = {
        0: "no serialization",
        1: "JSON",
        15: "custom type"
    }
    
    MESSAGE_COMPRESSIONS = {
        0: "no compression",
        1: "gzip",
        15: "custom compression method"
    }

    def __init__(self):
        # 是否中断
        self.TTSstop = False
        
        # 默认配置参数
        self.appid = App_Key
        self.token =  Access_Key
        self.cluster = "volcano_tts"
        self.voice_type = voice_type
        self.host = "openspeech.bytedance.com"
        self.api_url = f"wss://{self.host}/api/v1/tts/ws_binary"
        self.tts_ws=None
        # 默认消息头
        self.default_header = bytearray(b'\x11\x10\x11\x00')
        
        # 默认请求JSON模板
        self.request_json = {
            "app": {
                "appid": self.appid,
                "token": "access_token",
                "cluster": self.cluster
            },
            "user": {
                "uid": "388808087185088"
            },
            "audio": {
                "voice_type": "xxx",
                "encoding": "pcm",
                "speed_ratio": 1.0,
                "volume_ratio": 1.0,
                "pitch_ratio": 1.0,
            },
            "request": {
                "reqid": "xxx",
                "text": "字节跳动语音合成。",
                "text_type": "plain",
                "operation": "xxx"
            }
        }

    async def long_sentence(self, text, file, main_websocket):
        """
        分割长句子并逐段合成音频
        """
        # 如果需要分割长句子，可以取消注释以下代码
        # segments = [text[i:i+50] for i in range(0, len(text), 50)]  
        # for i, segment in enumerate(segments):
        self.request_json["request"]["text"] = text
        if self.tts_ws is  None or not self.tts_ws.protocol.state == State.OPEN:
            await self.create_tts_ws()
            # print("创建tts连接成功")
        await self.submit_request(self.request_json, file, self.tts_ws, main_websocket)

    async def create_tts_ws(self):
        """
        创建WebSocket连接
        """
        header = {"Authorization": f"Bearer; {self.token}"}
        ws = await websockets.connect(self.api_url, additional_headers=header, ping_interval=None)
        self.tts_ws=ws

    async def submit_request(self, request_json, file, ws, main_websocket):
        """
        异步函数，提交文本请求以进行语音合成
        """
        submit_request_json = copy.deepcopy(request_json)
        submit_request_json["audio"]["voice_type"] = self.voice_type
        submit_request_json["request"]["reqid"] = str(uuid.uuid4())
        submit_request_json["request"]["operation"] = "submit"
        payload_bytes = json.dumps(submit_request_json).encode('utf-8')
        payload_bytes = gzip.compress(payload_bytes)  # 如果不需要压缩，注释此行c
        full_client_request = bytearray(self.default_header)
        full_client_request.extend(len(payload_bytes).to_bytes(4, 'big'))  # payload size(4 bytes)
        full_client_request.extend(payload_bytes)  # payload

        await ws.send(full_client_request)
        while True:
            if(self.TTSstop):
                if self.tts_ws is not None:
                    await self.tts_ws.close()
                    self.tts_ws=None
                return
            res = await ws.recv()
            done = await self.parse_response(res, file, main_websocket)
            if done:
                break

    async def parse_response(self, res, file, main_websocket):
        """
        解析服务器返回的响应消息
        """
        # 解析响应头部的各个字段
        protocol_version = res[0] >> 4
        header_size = res[0] & 0x0f
        message_type = res[1] >> 4
        message_type_specific_flags = res[1] & 0x0f
        serialization_method = res[2] >> 4
        message_compression = res[2] & 0x0f
        reserved = res[3]
        header_extensions = res[4:header_size*4]
        payload = res[header_size*4:]

        # 根据消息类型对响应进行处理
        if message_type == 0xb:  # 处理音频服务器响应
            if message_type_specific_flags == 0:  # 无序列号作为ACK
                return False
            else:
                sequence_number = int.from_bytes(payload[:4], "big", signed=True)
                payload_size = int.from_bytes(payload[4:8], "big", signed=False)
                audio_payload = payload[8:]
            if(self.TTSstop):
                if self.tts_ws is not None:
                    await self.tts_ws.close()
                    self.tts_ws=None
                return
            

            #  # 计算最大 chunk 大小
            # max_seconds = 50
            # bytes_per_sec = 16000 * 2 * 1  # 采样率 * 位深度（byte）* 通道数
            # chunk_size = max_seconds * bytes_per_sec

            # # 分段发送 audio_payload
            # for i in range(0, len(audio_payload), chunk_size):
            #     chunk = audio_payload[i:i+chunk_size]
            #     await main_websocket.send(chunk)
            # audio_size = len(audio_payload)
            await main_websocket.send(audio_payload)
            # print("发送音频数据")
            # 保存音频数据到文件（文件名按时间戳或序号生成）
            # filename = f"audio_segment.pcm"
            # with open(filename, "ab") as f:
            #     f.write(audio_payload)

            if sequence_number < 0:  # 如果序列号为负，表示结束
                return True
            else:
                return False

        elif message_type == 0xf:  # 处理错误消息
            code = int.from_bytes(payload[:4], "big", signed=False)
            msg_size = int.from_bytes(payload[4:8], "big", signed=False)
            error_msg = payload[8:]
            if message_compression == 1:
                error_msg = gzip.decompress(error_msg)
            error_msg = error_msg.decode("utf-8")
            print(f"错误消息代码: {code}")
            print(f"错误消息大小: {msg_size} 字节")
            print(f"错误消息内容: {error_msg}")
            return True

        elif message_type == 0xc:  # 处理前端消息
            msg_size = int.from_bytes(payload[:4], "big", signed=False)
            frontend_msg = payload[4:]
            if message_compression == 1:
                frontend_msg = gzip.decompress(frontend_msg)
            print(f"前端消息: {frontend_msg.decode('utf-8')}")
            return False

        else:
            print("未定义的消息类型！")
            return True

    async def run_tts(self, text, file, main_websocket):
        """
        启动TTS流程
        """
        ws = await self.create_tts_ws()
        try:
            await self.long_sentence(text, file, ws, main_websocket)
        finally:
            await ws.close()

# 使用示例
# 你无需传递任何参数，直接创建TTSClient实例即可
async def main():
    tts_client = TTSClient()
    
    text = "字节跳动语音合成。"  # 需要合成的文本
    file = None  # 如果需要保存音频，可以传入文件对象
    main_websocket = None  # 根据你的实际情况传入主WebSocket连接
    
    await tts_client.run_tts(text, file, main_websocket)

# 如果你在脚本中运行，可以取消注释以下代码
# if __name__ == "__main__":
#     asyncio.run(main())
