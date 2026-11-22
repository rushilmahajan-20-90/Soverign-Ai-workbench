from pathlib import Path


class RAGRetriever:

    def __init__(
        self,
        embedding_manager,
        vector_store
    ):
        self.embedding_manager = embedding_manager
        self.vector_store = vector_store

    def retrieve(
        self,
        query,
        top_k=5,
        conversation_id=None
    ):
        query_embedding = (
            self.embedding_manager
            .generate_query_embedding(query)
        )

        results = self.vector_store.search_combined(
            query_embedding,
            conversation_id=conversation_id,
            top_k=top_k
        )

        retrieved_documents = []

        if (
            results.get("documents")
            and results["documents"][0]
        ):
            documents = results["documents"][0]
            metadatas = results["metadatas"][0]
            distances = results["distances"][0]

            for rank, (
                document,
                metadata,
                distance
            ) in enumerate(
                zip(
                    documents,
                    metadatas,
                    distances
                ),
                start=1
            ):
                retrieved_documents.append({
                    "document": document,
                    "metadata": metadata,
                    "distance": distance,
                    "rank": rank
                })

        return retrieved_documents

    def build_context(
        self,
        query,
        top_k=5,
        conversation_id=None
    ):
        documents = self.retrieve(
            query,
            top_k=top_k,
            conversation_id=conversation_id
        )

        if not documents:
            return (
                "No relevant information "
                "was found in the documents."
            )

        context = []

        for item in documents:
            metadata = item["metadata"]
            source = metadata.get(
                "source",
                metadata.get(
                    "source_file",
                    "unknown"
                )
            )
            page = metadata.get(
                "page",
                "unknown"
            )
            scope = metadata.get("scope", "knowledge_base")
            scope_badge = "Attached Chat Document (Temporary)" if scope == "chat_temporary" else "Company Knowledge Base (Permanent)"
            filename = Path(str(source)).name

            context.append(
                f"[{scope_badge}: {filename}, Page: {page}]\n"
                f"{item['document']}"
            )

        return "\n\n".join(context)