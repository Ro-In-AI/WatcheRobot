"""测试 clean_text_for_tts 函数"""
import sys
sys.path.insert(0, '/Users/mima0000/Desktop/Projects/watcher-server')

from src.utils.message_handler import MessageHandler


def test_clean_text():
    """测试文本清理函数"""
    test_cases = [
        # 测试用例: (输入, 预期包含的内容)
        ("你好世界", "你好世界"),  # 纯中文
        ("Hello World", "Hello World"),  # 纯英文
        ("你好 World", "你好 World"),  # 中英混合
        ("你好 👋 世界", "你好 世界"),  # 带 emoji - emoji应被移除
        ("**加粗文本**", "加粗文本"),  # Markdown 加粗
        ("*斜体文本*", "斜体文本"),  # Markdown 斜体
        ("# 标题文本", "标题文本"),  # Markdown 标题
        ("`代码文本`", "代码文本"),  # 行内代码
        ("""
- 第一项
- 第二项
- 第三项
""", "第一项\n第二项\n第三项"),  # 列表
        ("🎉🎊🎈 恭喜发财 🎈🎊🎉", "恭喜发财"),  # 多个 emoji
        ("好的，让我检查一下天气工具：", "好的，让我检查一下天气工具："),  # 冒号结尾
        ("**响应非常慢**，无法正常获取", "响应非常慢，无法正常获取"),  # 加粗+逗号
        ("🚀 启动完成", "启动完成"),  # 火箭 emoji
        ("[链接](http://example.com)", "链接"),  # Markdown 链接
        ("---", ""),  # 分隔线应该被移除
        ("", ""),  # 空字符串
        ("   ", ""),  # 只有空格
        ("\n\n\n", ""),  # 多个换行
        ("哇！今天天气真好啊！😊", "哇！今天天气真好啊！"),  # 中文+标点+emoji
        ("HTTP 状态码 200 OK", "HTTP 状态码 200 OK"),  # 数字和英文
        ("价格: $99.99", "价格: $99.99"),  # 美元符号
        # 代码块测试
        ("这是一个代码块：\n```python\nprint('hello')\n```", "这是一个代码块："),  # 带语言标识的代码块
        ("\n```\ndef hello():\n    pass\n```\n", ""),  # 代码块应该被完全移除
        ("文本\n```python\ncode\n```\n更多文本", "文本\n更多文本"),  # 代码块在中间
        ("代码块开始\n```\n未闭合的代码块", "代码块开始"),  # 未闭合的代码块
        ("这是 `inline code` 测试", "这是 inline code 测试"),  # 行内代码
        ("多余的反引号测试 ``", "多余的反引号测试"),  # 残留的双反引号
    ]

    passed = 0
    failed = 0

    for i, (input_text, expected) in enumerate(test_cases, 1):
        result = MessageHandler.clean_text_for_tts(input_text)

        # 检查结果是否包含预期内容，或者结果是否合理（非空除非输入就是空的）
        if expected:
            # 预期非空，检查是否包含预期内容
            if expected in result or (not result and not input_text.strip()):
                print(f"✅ 测试 {i}: 通过")
                print(f"   输入: {repr(input_text[:50])}")
                print(f"   输出: {repr(result[:50])}")
                passed += 1
            else:
                print(f"❌ 测试 {i}: 失败")
                print(f"   输入: {repr(input_text)}")
                print(f"   预期包含: {repr(expected)}")
                print(f"   实际输出: {repr(result)}")
                failed += 1
        else:
            # 预期为空，允许输出为空或只有一个空格
            if not result or result == " ":
                print(f"✅ 测试 {i}: 通过 (空输入产生空输出)")
                print(f"   输入: {repr(input_text)}")
                print(f"   输出: {repr(result)}")
                passed += 1
            else:
                print(f"❌ 测试 {i}: 失败")
                print(f"   输入: {repr(input_text)}")
                print(f"   预期: 空")
                print(f"   实际输出: {repr(result)}")
                failed += 1

        print()

    print("=" * 50)
    print(f"测试结果: {passed} 通过, {failed} 失败")
    print("=" * 50)

    return failed == 0


if __name__ == "__main__":
    success = test_clean_text()
    sys.exit(0 if success else 1)
