import json
import os
from functools import lru_cache
from pathlib import Path
from typing import Any


DEFAULT_CONFIG_PATH = Path(__file__).with_name("mapping_config.json")


@lru_cache(maxsize=1)
def get_mapping_config() -> dict[str, Any]:
    config_path = Path(os.getenv("COLUMN_MAPPING_CONFIG_PATH", DEFAULT_CONFIG_PATH))
    with config_path.open("r", encoding="utf-8") as handle:
        config = json.load(handle)

    max_upload_mb = os.getenv("COLUMN_MAPPING_MAX_UPLOAD_MB")
    if max_upload_mb:
        config["max_upload_mb"] = int(max_upload_mb)

    allow_duplicates = os.getenv("COLUMN_MAPPING_ALLOW_DUPLICATES")
    if allow_duplicates is not None:
        config["allow_duplicate_target_mappings"] = allow_duplicates.lower() in {"1", "true", "yes"}

    return config


def confidence_label(score: float) -> str:
    thresholds = sorted(
        get_mapping_config().get("confidence_thresholds", []),
        key=lambda item: float(item.get("min_score", 0)),
        reverse=True,
    )
    for threshold in thresholds:
        if score >= float(threshold.get("min_score", 0)):
            return str(threshold.get("label", "Low"))
    return "Low"
