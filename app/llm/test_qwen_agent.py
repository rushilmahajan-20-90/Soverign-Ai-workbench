
import asyncio

from app.llm.qwen import ask_qwen_with_tools


async def main():
    print("Testing Qwen agent with MCP tools...\n")

    try:
        answer = await ask_qwen_with_tools(
            "Search my indexed documents and tell me what information is available."
        )
        print("\n--- Final Answer ---")
        print(answer)

    except Exception as exc:
        print(f"\nTest failed: {type(exc).__name__}: {exc}")


if __name__ == "__main__":
    asyncio.run(main())
