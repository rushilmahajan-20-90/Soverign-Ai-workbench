from sentence_transformers import SentenceTransformer


class EmbeddingManager:

    def __init__(
        self,
        model_name="all-MiniLM-L6-v2"
    ):

        self.model_name = model_name

        self.model = SentenceTransformer(
            self.model_name
        )

        print(
            "Embedding dimension:",
            self.model.get_embedding_dimension()
        )

    def generate(self, texts):

        return self.model.encode(
            texts,
            show_progress_bar=False
        )

    def generate_query_embedding(self, query):

        return self.model.encode(
            [query],
            show_progress_bar=False
        )[0]