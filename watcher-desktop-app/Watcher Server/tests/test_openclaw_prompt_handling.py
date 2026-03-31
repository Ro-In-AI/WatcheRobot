from src.modules.openclaw.base import ChatMessage
from src.modules.openclaw.local_claw import LocalOpenClawProvider


def test_build_cli_message_includes_system_prompt():
    messages = [
        ChatMessage(
            role="system",
            content="Please reply with plain text only. Do not use emojis.",
        ),
        ChatMessage(role="user", content="你好，请介绍一下你自己"),
    ]

    message = LocalOpenClawProvider._build_cli_message(
        messages,
        "你好，请介绍一下你自己",
    )

    assert "Please reply with plain text only. Do not use emojis." in message
    assert "用户消息如下：" in message
    assert "你好，请介绍一下你自己" in message


def test_parse_cli_response_strips_emoji():
    provider = LocalOpenClawProvider()
    response = provider._parse_cli_response(
        {
            "result": {
                "payloads": [
                    {
                        "text": "听得懂！我可以用中文交流。👋\n\n两种都可以~",
                    }
                ],
                "meta": {
                    "agentMeta": {
                        "model": "demo-model",
                        "usage": {"input": 1, "output": 1},
                    }
                },
            }
        }
    )

    assert "👋" not in response.content
    assert response.content == "听得懂！我可以用中文交流。\n\n两种都可以~"
