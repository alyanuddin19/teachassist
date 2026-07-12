from dataclasses import dataclass
from pathlib import Path
from time import time
from uuid import uuid4

from fastapi import HTTPException

from .workbook_service import WorkbookFile, cleanup_paths


@dataclass
class MappingSession:
    id: str
    source: WorkbookFile
    target: WorkbookFile | None
    created_at: float


class MappingSessionStore:
    def __init__(self) -> None:
        self.sessions: dict[str, MappingSession] = {}

    def create(self, source: WorkbookFile, target: WorkbookFile | None = None) -> MappingSession:
        session = MappingSession(uuid4().hex, source, target, time())
        self.sessions[session.id] = session
        return session

    def get(self, session_id: str) -> MappingSession:
        session = self.sessions.get(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Mapping session expired. Please upload the files again.")
        return session

    def cleanup(self, session_id: str) -> None:
        session = self.sessions.pop(session_id, None)
        if session:
            paths = [session.source.path]
            if session.target:
                paths.append(session.target.path)
            cleanup_paths(paths)
