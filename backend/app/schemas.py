from pydantic import BaseModel
from datetime import datetime

# -------- TEACHER --------
class TeacherCreate(BaseModel):
    username: str
    password: str

class TeacherLogin(BaseModel):
    username: str
    password: str

class TeacherOut(BaseModel):
    id: int
    username: str

    class Config:
        from_attributes = True   # ✅ Pydantic v2 fix


# -------- EXAM --------
from pydantic import BaseModel
from datetime import datetime

class ExamOut(BaseModel):
    id: int
    exam_type: str
    content: str     # ✅ MUST MATCH DB MODEL

    class Config:
        orm_mode = True

