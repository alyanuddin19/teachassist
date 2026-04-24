"""Session-scoped chunking and balanced retrieval helpers."""

import re
from collections import Counter


def chunk_text(text: str, size: int = 900, overlap: int = 140) -> list[str]:
    chunks: list[str] = []
    start = 0
    cleaned = text.strip()
    while start < len(cleaned):
        chunks.append(cleaned[start:start + size])
        start += max(1, size - overlap)
    return chunks


def clip_text(text: str, max_chars: int) -> str:
    if len(text) <= max_chars:
        return text
    return text[:max_chars].rstrip() + "\n...[truncated]"


def _tokenize(text: str) -> list[str]:
    return re.findall(r"[a-zA-Z0-9_+\-]+", text.lower())


def score_chunk(query: str, chunk: str) -> int:
    query_terms = Counter(_tokenize(query))
    chunk_terms = Counter(_tokenize(chunk))
    score = 0
    for token, count in query_terms.items():
        score += min(count, chunk_terms.get(token, 0))
    return score


def build_balanced_context(
    documents: list[dict],
    query: str,
    total_k: int = 8,
    per_doc_clip: int = 1500,
    total_clip: int = 6000,
) -> str:
    if not documents:
        return ""

    docs_count = len(documents)
    per_doc_k = max(1, total_k // docs_count)
    context_parts: list[str] = []

    for document in documents:
        chunks = document.get("chunks", [])
        if not chunks:
            continue

        ranked = sorted(
            chunks,
            key=lambda current: (score_chunk(query, current), len(current)),
            reverse=True,
        )
        selected = ranked[:per_doc_k]
        joined = clip_text("\n\n".join(selected), per_doc_clip)
        context_parts.append(f"===== DOCUMENT {document['doc_id']} | {document['filename']} =====\n{joined}")

    return clip_text("\n\n".join(context_parts), total_clip)
