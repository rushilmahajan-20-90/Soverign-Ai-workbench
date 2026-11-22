import asyncio
from app.mcp.mcp_client import mcp_client

async def main():
    try:
        tools = await mcp_client.list_tools()
        for tool in tools:
            print("\nTool:", tool)
            print("Type:", type(tool).__name__)
            print("Attributes:", [a for a in dir(tool) if not a.startswith("_")])
    finally:
        await mcp_client.close()

asyncio.run(main())
