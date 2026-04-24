from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from typing import Any


def load_t2_transform_app() -> Any | None:
    backend_dir = Path(__file__).resolve().parents[2] / "t2" / "backend"
    main_file = backend_dir / "main.py"

    if not main_file.exists():
        return None

    backend_dir_str = str(backend_dir)
    if backend_dir_str not in sys.path:
        sys.path.insert(0, backend_dir_str)

    module_name = "teachassist_t2_backend_main"
    existing_module = sys.modules.get(module_name)
    if existing_module is not None:
        return getattr(existing_module, "app", None)

    spec = importlib.util.spec_from_file_location(module_name, main_file)
    if spec is None or spec.loader is None:
        return None

    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return getattr(module, "app", None)


def load_t2_excel_builder():
    backend_dir = Path(__file__).resolve().parents[2] / "t2" / "backend"
    module_file = backend_dir / "excel_handler.py"

    if not module_file.exists():
        return None

    backend_dir_str = str(backend_dir)
    if backend_dir_str not in sys.path:
        sys.path.insert(0, backend_dir_str)

    module_name = "teachassist_t2_excel_handler"
    existing_module = sys.modules.get(module_name)
    if existing_module is not None:
        return getattr(existing_module, "build_marksheet_excel", None)

    spec = importlib.util.spec_from_file_location(module_name, module_file)
    if spec is None or spec.loader is None:
        return None

    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return getattr(module, "build_marksheet_excel", None)
