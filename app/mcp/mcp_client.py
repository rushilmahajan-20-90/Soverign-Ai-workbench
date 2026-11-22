import logging
from types import SimpleNamespace

logger = logging.getLogger(__name__)


class WorkbenchMCPClient:
    """
    Direct in-process MCP Client for Sovereign AI Workbench.
    Provides complete MCP-compliant tool dispatch (list_tools, call_tool) with
    zero subprocess overhead, zero IPC pipe failures, and zero SQLite lock contention.
    """

    def __init__(self):
        self.session = self

    async def connect(self):
        pass

    async def close(self):
        pass

    async def list_tools(self):
        """Return all tools registered in the MCP server."""
        return self._list_tools_in_process()

    def _list_tools_in_process(self):
        descriptions = {
            "list_documents": "List PDFs and images currently indexed by the local OCR pipeline.",
            "read_document": "Return all OCR-extracted chunks for one indexed PDF or image in page order.",
            "search_documents": "Search indexed PDFs and images for relevant OCR-extracted text.",
            "create_word_document": "Create a formatted Word document from a title and sections.",
            "create_pdf_document": "Create a formatted PDF from a title and sections.",
        }
        schemas = {
            "list_documents": {"type": "object", "properties": {}},
            "read_document": {
                "type": "object",
                "properties": {"document_id": {"type": "string"}},
                "required": ["document_id"],
            },
            "search_documents": {
                "type": "object",
                "properties": {"query": {"type": "string"}, "top_k": {"type": "integer"}},
                "required": ["query"],
            },
            "create_word_document": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "sections": {"type": "array"},
                    "filename": {"type": "string"},
                },
                "required": ["title", "sections"],
            },
            "create_pdf_document": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "sections": {"type": "array"},
                    "filename": {"type": "string"},
                },
                "required": ["title", "sections"],
            },
        }
        tools = []
        for name, desc in descriptions.items():
            tools.append(SimpleNamespace(name=name, description=desc, inputSchema=schemas.get(name, {})))
        return tools

    async def call_tool(self, name: str, arguments: dict):
        """Execute an MCP tool directly in-process and return standard MCP response object."""
        return self._call_tool_in_process(name, arguments)

    def _call_tool_in_process(self, name: str, arguments: dict):
        from app.mcp import mcp_server

        tool_fn = getattr(mcp_server, name, None)
        if tool_fn is None:
            raise ValueError(f"Unknown MCP tool: {name}")

        try:
            result = tool_fn(**arguments)
            return SimpleNamespace(content=[SimpleNamespace(text=str(result))], isError=False)
        except Exception as exc:
            logger.exception("Error executing MCP tool '%s' in-process: %s", name, exc)
            return SimpleNamespace(
                content=[SimpleNamespace(text=f"Error executing tool {name}: {str(exc)}")],
                isError=True,
            )


mcp_client = WorkbenchMCPClient()
