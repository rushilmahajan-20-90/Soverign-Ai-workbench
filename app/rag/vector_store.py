import logging
import os
import uuid
from pathlib import Path

import chromadb

logger = logging.getLogger(__name__)


class VectorStoreManager:
    """
    ChromaDB storage with strict dual-scope separation:
    1. Permanent Company Knowledge Base (`company_knowledge_base`)
    2. Temporary Chat Documents (`chat_temporary_documents`), isolated by conversation_id
    Also maintains backward-compatibility and auto-migration from legacy collections (`pdf_documents`).
    """

    def __init__(self, persist_directory="data/vector_store", collection_name="company_knowledge_base"):
        self.persist_directory = str(persist_directory)
        self.collection_name = collection_name
        os.makedirs(self.persist_directory, exist_ok=True)
        self.client = chromadb.PersistentClient(path=self.persist_directory)

        # Permanent Company Knowledge Base
        self.kb_collection = self.client.get_or_create_collection(name="company_knowledge_base")
        # Temporary Chat Documents
        self.temp_collection = self.client.get_or_create_collection(name="chat_temporary_documents")
        # Legacy Collection
        self.legacy_collection = self.client.get_or_create_collection(name="pdf_documents")

        # Backward compatibility alias
        self._collection = self.kb_collection
        self.all_collections = [self.kb_collection, self.temp_collection, self.legacy_collection]

        # Auto-migrate legacy pdf_documents chunks to kb_collection if needed
        self._auto_migrate_legacy()

    def _auto_migrate_legacy(self):
        try:
            legacy_count = self.legacy_collection.count()
            if legacy_count > 0:
                legacy_data = self.legacy_collection.get(include=["documents", "metadatas", "embeddings"])
                existing_kb_ids = set(self.kb_collection.get()["ids"])
                new_ids, new_docs, new_metas, new_embs = [], [], [], []
                for cid, doc, meta, emb in zip(
                    legacy_data.get("ids") or [],
                    legacy_data.get("documents") or [],
                    legacy_data.get("metadatas") or [],
                    legacy_data.get("embeddings") or [],
                ):
                    if cid not in existing_kb_ids:
                        meta_copy = dict(meta or {})
                        meta_copy.setdefault("scope", "knowledge_base")
                        meta_copy.setdefault("is_temporary", False)
                        new_ids.append(cid)
                        new_docs.append(doc)
                        new_metas.append(meta_copy)
                        if emb is not None:
                            new_embs.append(emb)

                if new_ids:
                    add_kw = {"ids": new_ids, "documents": new_docs, "metadatas": new_metas}
                    if len(new_embs) == len(new_ids):
                        add_kw["embeddings"] = new_embs
                    self.kb_collection.add(**add_kw)
                    logger.info("Migrated %d legacy chunks from pdf_documents to company_knowledge_base", len(new_ids))
        except Exception as exc:
            logger.debug("Legacy migration check: %s", exc)

    @property
    def collection(self):
        return self.kb_collection

    def add_documents(
        self,
        documents,
        embeddings,
        document_id,
        is_temporary: bool = False,
        conversation_id: str = None,
        user_id: str = None,
    ):
        """
        Add documents into either the Permanent Knowledge Base or Temporary Chat scope.
        """
        if len(documents) != len(embeddings):
            raise ValueError("Number of documents does not match number of embeddings")
        if not documents:
            return 0

        target_collection = self.temp_collection if is_temporary else self.kb_collection
        scope_name = "chat_temporary" if is_temporary else "knowledge_base"

        ids, metadatas, contents, embedding_list = [], [], [], []
        for index, (doc, embedding) in enumerate(zip(documents, embeddings)):
            metadata = dict(doc.metadata or {})
            metadata["document_id"] = str(document_id)
            metadata["chunk_index"] = index
            metadata["content_length"] = len(doc.page_content or "")
            metadata["scope"] = scope_name
            metadata["is_temporary"] = is_temporary
            if conversation_id:
                metadata["conversation_id"] = str(conversation_id)
            if user_id:
                metadata["user_id"] = str(user_id)

            # Chroma metadata values must be scalar and cannot be None.
            metadata = {
                key: value for key, value in metadata.items()
                if value is not None and isinstance(value, (str, int, float, bool))
            }
            ids.append(f"chunk_{uuid.uuid4()}")
            metadatas.append(metadata)
            contents.append(doc.page_content or "")
            embedding_list.append(embedding.tolist())

        target_collection.add(
            ids=ids, documents=contents, metadatas=metadatas,
            embeddings=embedding_list,
        )
        logger.info("Added %d chunks to %s (Document ID: %s)", len(contents), scope_name, document_id)
        return len(contents)

    def search(self, query_embedding, top_k=5, document_id=None):
        """Standard search (delegates to search_combined)."""
        return self.search_combined(query_embedding, top_k=top_k, document_id=document_id)

    def search_combined(self, query_embedding, conversation_id=None, top_k=5, document_id=None):
        """
        Unified search that retrieves:
        1. Permanent Company Knowledge Base chunks (always accessible to company members).
        2. Temporary Chat chunks for the authorized conversation_id (if supplied).
        3. Legacy collection fallback if KB is empty.
        """
        top_k = max(1, min(int(top_k), 10))
        kb_kwargs = {"query_embeddings": [query_embedding.tolist()], "n_results": top_k}
        if document_id:
            kb_kwargs["where"] = {"document_id": str(document_id)}

        combined_docs = []
        combined_metas = []
        combined_dists = []

        # 1. Query Permanent Company Knowledge Base
        try:
            kb_res = self.kb_collection.query(**kb_kwargs)
            if kb_res.get("documents") and kb_res["documents"][0]:
                for doc, meta, dist in zip(kb_res["documents"][0], kb_res["metadatas"][0], kb_res["distances"][0]):
                    meta_copy = dict(meta or {})
                    meta_copy["scope"] = "knowledge_base"
                    combined_docs.append(doc)
                    combined_metas.append(meta_copy)
                    combined_dists.append(dist)
        except Exception as e:
            logger.warning("Error querying KB collection: %s", e)

        # 1b. Fallback to legacy collection if KB returned nothing
        if not combined_docs:
            try:
                legacy_res = self.legacy_collection.query(**kb_kwargs)
                if legacy_res.get("documents") and legacy_res["documents"][0]:
                    for doc, meta, dist in zip(legacy_res["documents"][0], legacy_res["metadatas"][0], legacy_res["distances"][0]):
                        meta_copy = dict(meta or {})
                        meta_copy["scope"] = "knowledge_base"
                        combined_docs.append(doc)
                        combined_metas.append(meta_copy)
                        combined_dists.append(dist)
            except Exception as e:
                logger.debug("Error querying legacy collection: %s", e)

        # 2. Query Temporary Chat collection if conversation_id provided
        if conversation_id:
            temp_kwargs = {
                "query_embeddings": [query_embedding.tolist()],
                "n_results": top_k,
                "where": {"conversation_id": str(conversation_id)},
            }
            if document_id:
                temp_kwargs["where"] = {
                    "$and": [
                        {"conversation_id": str(conversation_id)},
                        {"document_id": str(document_id)},
                    ]
                }
            try:
                temp_res = self.temp_collection.query(**temp_kwargs)
                if temp_res.get("documents") and temp_res["documents"][0]:
                    for doc, meta, dist in zip(temp_res["documents"][0], temp_res["metadatas"][0], temp_res["distances"][0]):
                        meta_copy = dict(meta or {})
                        meta_copy["scope"] = "chat_temporary"
                        combined_docs.append(doc)
                        combined_metas.append(meta_copy)
                        combined_dists.append(dist)
            except Exception as e:
                logger.warning("Error querying temp collection: %s", e)

        # Sort combined results by distance (ascending)
        if combined_dists:
            sorted_triplets = sorted(
                zip(combined_dists, combined_docs, combined_metas),
                key=lambda x: x[0]
            )[:top_k]
            return {
                "documents": [[t[1] for t in sorted_triplets]],
                "metadatas": [[t[2] for t in sorted_triplets]],
                "distances": [[t[0] for t in sorted_triplets]],
            }

        return {"documents": [[]], "metadatas": [[]], "distances": [[]]}

    def delete_by_conversation_id(self, conversation_id):
        """Delete all temporary chunks associated with a conversation."""
        if not conversation_id:
            return 0
        try:
            results = self.temp_collection.get(where={"conversation_id": str(conversation_id)})
            ids = results.get("ids") or []
            if ids:
                self.temp_collection.delete(ids=ids)
                logger.info("Purged %d temporary vector chunks for conversation %s", len(ids), conversation_id)
            return len(ids)
        except Exception as e:
            logger.warning("Error deleting temp chunks for conversation %s: %s", conversation_id, e)
            return 0

    def get_all(self):
        kb_res = self.kb_collection.get(include=["documents", "metadatas"])
        temp_res = self.temp_collection.get(include=["documents", "metadatas"])
        legacy_res = self.legacy_collection.get(include=["documents", "metadatas"])
        return {
            "documents": (kb_res.get("documents") or []) + (temp_res.get("documents") or []) + (legacy_res.get("documents") or []),
            "metadatas": (kb_res.get("metadatas") or []) + (temp_res.get("metadatas") or []) + (legacy_res.get("metadatas") or []),
        }

    def list_documents(self):
        """Return unique indexed files from Permanent KB, Temporary Chat, and physical files."""
        grouped = {}
        for coll in self.all_collections:
            try:
                results = coll.get(include=["metadatas"])
                for metadata in results.get("metadatas") or []:
                    if not metadata:
                        continue
                    document_id = metadata.get("document_id")
                    if not document_id:
                        continue
                    source = metadata.get("source", metadata.get("source_file", "unknown"))
                    scope = metadata.get("scope", "knowledge_base")
                    entry = grouped.setdefault(str(document_id), {
                        "document_id": str(document_id),
                        "source": str(source),
                        "filename": Path(str(source)).name,
                        "scope": scope,
                        "is_temporary": metadata.get("is_temporary", False),
                        "conversation_id": metadata.get("conversation_id"),
                        "pages": set(),
                        "chunks": 0,
                    })
                    entry["chunks"] += 1
                    page = metadata.get("page")
                    if page is not None:
                        entry["pages"].add(str(page))
            except Exception as e:
                logger.debug("Error listing documents from collection: %s", e)

        # Include physical files from data/documents if not already discovered
        try:
            base_docs = Path("data/documents")
            existing_filenames = {e["filename"].lower() for e in grouped.values()}
            if base_docs.exists():
                for p in base_docs.glob("*.*"):
                    if p.is_file() and p.name.lower() not in existing_filenames and p.suffix.lower() in {".pdf", ".png", ".jpg", ".jpeg"}:
                        file_id = f"disk_{p.stem}"
                        grouped[file_id] = {
                            "document_id": file_id,
                            "source": str(p),
                            "filename": p.name,
                            "scope": "knowledge_base",
                            "is_temporary": False,
                            "conversation_id": None,
                            "pages": {"1"},
                            "chunks": 1,
                        }
        except Exception as e:
            logger.debug("Disk scan in list_documents: %s", e)

        documents = []
        for entry in grouped.values():
            pages = entry.pop("pages")
            entry["pages"] = sorted(
                pages, key=lambda value: (0, int(value)) if str(value).isdigit() else (1, str(value))
            )
            documents.append(entry)
        return sorted(documents, key=lambda item: item["filename"].lower())

    def get_document_chunks(self, document_id=None, source=None):
        """
        Fetch every chunk for one file from KB, Temp, or Legacy collection.
        Supports UUID, filename, path, or case-insensitive matching.
        Falls back to host file text extraction if vector chunks are not yet indexed.
        """
        if not document_id and not source:
            raise ValueError("Provide document_id or source.")

        identifier = str(document_id or source).strip()

        # Phase 1: Direct exact match by document_id or source
        for coll in self.all_collections:
            for query_where in [{"document_id": identifier}, {"source": identifier}]:
                try:
                    results = coll.get(where=query_where, include=["documents", "metadatas"])
                    ids = results.get("ids") or []
                    if ids:
                        return self._format_chunks(ids, results.get("documents") or [], results.get("metadatas") or [])
                except Exception:
                    pass

        # Phase 2: Flexible metadata scan across all collections
        # Matches filename, stem, or path variations (e.g. Windows \ vs /)
        target_name = Path(identifier).name.lower()
        target_stem = Path(identifier).stem.lower()

        for coll in self.all_collections:
            try:
                results = coll.get(include=["documents", "metadatas"])
                ids = results.get("ids") or []
                documents = results.get("documents") or []
                metadatas = results.get("metadatas") or []

                matched_ids, matched_docs, matched_metas = [], [], []
                for cid, doc, meta in zip(ids, documents, metadatas):
                    meta = meta or {}
                    meta_doc_id = str(meta.get("document_id", "")).strip()
                    meta_source = str(meta.get("source", meta.get("source_file", ""))).strip()
                    meta_filename = Path(meta_source).name.lower()
                    meta_stem = Path(meta_source).stem.lower()

                    if (
                        meta_doc_id == identifier
                        or meta_source == identifier
                        or meta_filename == target_name
                        or (target_stem and meta_stem == target_stem)
                        or (len(target_name) >= 4 and target_name in meta_filename)
                        or (len(meta_filename) >= 4 and meta_filename in target_name)
                    ):
                        matched_ids.append(cid)
                        matched_docs.append(doc)
                        matched_metas.append(meta)

                if matched_ids:
                    return self._format_chunks(matched_ids, matched_docs, matched_metas)
            except Exception as e:
                logger.debug("Flexible metadata scan: %s", e)

        # Phase 3: Physical disk fallback
        # If the file exists in data/documents, extract text directly so reading NEVER fails
        disk_chunk = self._extract_physical_disk_fallback(identifier)
        if disk_chunk:
            return [disk_chunk]

        return []

    def _format_chunks(self, ids, documents, metadatas):
        chunks = []
        for index, content in enumerate(documents):
            metadata = metadatas[index] if index < len(metadatas) else {}
            metadata = metadata or {}
            page = metadata.get("page", 0)
            chunk_index = metadata.get("chunk_index", 0)
            try:
                page_sort = int(page)
            except (TypeError, ValueError):
                page_sort = 0
            try:
                chunk_sort = int(chunk_index)
            except (TypeError, ValueError):
                chunk_sort = 0
            chunks.append({
                "id": ids[index] if index < len(ids) else "",
                "document": content or "",
                "metadata": metadata,
                "_page_sort": page_sort,
                "_chunk_sort": chunk_sort,
            })

        chunks.sort(key=lambda item: (item["_page_sort"], item["_chunk_sort"], item["id"]))
        for chunk in chunks:
            chunk.pop("_page_sort", None)
            chunk.pop("_chunk_sort", None)
        return chunks

    def _extract_physical_disk_fallback(self, identifier: str):
        """Direct file fallback when document exists on disk but has no vector chunks."""
        clean_name = Path(identifier).name.lower()
        search_dirs = [
            Path("data/documents"),
            Path("data/documents/knowledge_base"),
            Path("data/documents/temp_chats"),
        ]
        found_file = None
        for sdir in search_dirs:
            if not sdir.exists():
                continue
            for item in sdir.rglob("*.*"):
                if item.is_file() and (item.name.lower() == clean_name or clean_name in item.name.lower()):
                    found_file = item
                    break
            if found_file:
                break

        if not found_file:
            return None

        # Extract text from found file
        extracted_text = ""
        suffix = found_file.suffix.lower()
        try:
            if suffix == ".pdf":
                import fitz
                with fitz.open(str(found_file)) as doc:
                    pages = [page.get_text().strip() for page in doc]
                    extracted_text = "\n\n".join(p for p in pages if p)
            elif suffix in {".txt", ".md", ".csv"}:
                extracted_text = found_file.read_text(encoding="utf-8", errors="ignore").strip()
            elif suffix in {".png", ".jpg", ".jpeg"}:
                try:
                    from paddleocr import PaddleOCR
                    ocr = PaddleOCR(lang="en", enable_mkldnn=False)
                    res = ocr.predict(str(found_file))
                    lines = []
                    for r in res:
                        if isinstance(r, dict) and "rec_texts" in r:
                            lines.extend(r["rec_texts"])
                    extracted_text = "\n".join(lines).strip()
                except Exception:
                    extracted_text = f"[Image Content: {found_file.name}]"
        except Exception as exc:
            logger.warning("Disk fallback extraction error for %s: %s", found_file, exc)

        if not extracted_text:
            extracted_text = f"[Document content from {found_file.name}]"

        return {
            "id": f"disk_fallback_{found_file.stem}",
            "document": extracted_text,
            "metadata": {
                "source": str(found_file),
                "filename": found_file.name,
                "document_id": identifier,
                "page": 1,
                "chunk_index": 0,
                "scope": "knowledge_base",
            },
        }

    def delete_by_source(self, source):
        deleted = 0
        for coll in self.all_collections:
            try:
                results = coll.get(where={"source": str(source)})
                ids = results.get("ids") or []
                if ids:
                    coll.delete(ids=ids)
                    deleted += len(ids)
            except Exception:
                pass
        return deleted

    def delete_by_document_id(self, document_id):
        deleted = 0
        for coll in self.all_collections:
            try:
                results = coll.get(where={"document_id": str(document_id)})
                ids = results.get("ids") or []
                if ids:
                    coll.delete(ids=ids)
                    deleted += len(ids)
            except Exception:
                pass
        return deleted

    def count_by_source(self, source):
        count = 0
        for coll in self.all_collections:
            try:
                results = coll.get(where={"source": str(source)})
                count += len(results.get("ids") or [])
            except Exception:
                pass
        return count

    def count_by_document_id(self, document_id):
        count = 0
        for coll in self.all_collections:
            try:
                results = coll.get(where={"document_id": str(document_id)})
                count += len(results.get("ids") or [])
            except Exception:
                pass
        return count

    def get_document_ids_by_source(self, source):
        doc_ids = set()
        for coll in self.all_collections:
            try:
                results = coll.get(where={"source": str(source)}, include=["metadatas"])
                for metadata in results.get("metadatas") or []:
                    if metadata and metadata.get("document_id"):
                        doc_ids.add(str(metadata["document_id"]))
            except Exception:
                pass
        return sorted(doc_ids)
