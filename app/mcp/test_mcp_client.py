import asyncio

from app.mcp.mcp_client import WorkbenchMCPClient


async def main():
    client = WorkbenchMCPClient()

    try:
        tools = await client.list_tools()

        print("\nAvailable tools:")
        for tool in tools:
            print(f"- {tool.name}: {tool.description}")

        result = await client.call_tool(
            "search_documents",
            {
                "query": "What is the main topic of the uploaded documents?",
                "top_k": 3,
            },
        )

        print("\nSearch result:")
        for item in result.content:
            if hasattr(item, "text"):
                print(item.text)

    finally:
        await client.close()


if __name__ == "__main__":
    asyncio.run(main())