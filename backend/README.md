# TeachAssist Backend (FastAPI + PostgreSQL + Gemini)

This is a minimal backend skeleton for your FYP:

- Teacher signup/login (username + password)
- Upload a document on the fly (not stored in DB or disk)
- Generate an exam (quiz/assignment/midterm/final) using Gemini API

## 1. Create and activate virtualenv (Windows)

```bash
cd backend
python -m venv venv
venv\Scripts\activate
```

## 2. Install dependencies

```bash
pip install -r requirements.txt
```

## 3. Configure PostgreSQL

1. Install PostgreSQL and pgAdmin from the official installer.
2. Open **pgAdmin** and:
   - Create a new database: `teachassist_db`
   - Create a user: `teachassist_user` with password `strongpassword`
   - Give this user **ALL PRIVILEGES** on `teachassist_db`.

3. Copy `.env.example` to `.env` and update:

```env
DATABASE_URL=postgresql+psycopg2://teachassist_user:strongpassword@localhost:5432/teachassist_db
GEMINI_API_KEY=your_real_gemini_key_here
```

## 4. Run the backend

```bash
uvicorn app.main:app --reload
```

Backend will be at: `http://127.0.0.1:8000`

Main endpoints:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/generate-exam`

You can connect Angular to these endpoints using HttpClient.
