import chromadb
from chromadb.config import Settings

class RAGEngine:
    def __init__(self):
        self.client = chromadb.Client(
            Settings(
                persist_directory="chroma",
                anonymized_telemetry=False
            )
        )
        self.collection = self.client.get_or_create_collection(
            name="teachassist"
        )

    def add_documents(self, texts: list, metadatas: list):
        ids = [f"doc_{i}" for i in range(len(texts))]
        self.collection.add(
            documents=texts,
            metadatas=metadatas,
            ids=ids
        )

    def search(self, query: str, top_k: int = 5, filter: dict | None = None):
        results = self.collection.query(
            query_texts=[query],
            n_results=top_k,
            where=filter
        )
        return results["documents"][0]
