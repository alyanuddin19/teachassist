import re
from difflib import SequenceMatcher


def normalize(text: str) -> str:
    text = text.lower()
    text = re.sub(r"[^a-z0-9 ]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, a, b).ratio()


def semantic_map(source_df, template_fields):
    mapping = {}
    used_sources = set()

    source_cols = list(source_df.columns)

    for field in template_fields:
        t_label = field["label"]
        t_norm = normalize(t_label)

        best_score = 0
        best_source = None

        for s_col in source_cols:
            if s_col in used_sources:
                continue

            s_norm = normalize(s_col)
            score = 0

            # 1️⃣ Exact match
            if t_norm == s_norm:
                score = 1.0

            # 2️⃣ Containment
            elif t_norm in s_norm or s_norm in t_norm:
                score = 0.8

            # 3️⃣ Similarity
            else:
                sim = similarity(t_norm, s_norm)
                if sim >= 0.55:
                    score = sim

                # 🔥 NEW: numeric / score fallback (NO hardcode)
                elif any(k in t_norm for k in ["mark", "score", "point"]) and \
                     any(k in s_norm for k in ["mark", "score", "point"]):
                    score = 0.6

            if score > best_score:
                best_score = score
                best_source = s_col

        if best_source and best_score >= 0.5:
            mapping[t_label] = {
                "source_column": best_source,
                "column": field["column"],
                "row": field["row"],
                "score": round(best_score, 2)
            }
            used_sources.add(best_source)

    return mapping
