"""工具模块。"""

__all__ = ["MessageHandler"]


def __getattr__(name: str):
    if name == "MessageHandler":
        from src.utils.message_handler import MessageHandler

        return MessageHandler
    raise AttributeError(name)
