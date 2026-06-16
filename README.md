# TeachAssist

TeachAssist is a web application with a FastAPI backend, PostgreSQL database, and Angular frontend.

## Project Structure

```text
backend/    FastAPI API, database models, file processing, AI integrations
frontendd/  Angular frontend
render.yaml Render backend deployment config
```

## Prerequisites

Install these before setting up the project on a new machine:

- Git
- Python 3.11
- Node.js and npm
- PostgreSQL

## Clone the Repository

```bash
git clone https://github.com/alyanuddin19/teachassist.git
cd teachassist
```

## Backend Setup

```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

Create a PostgreSQL database for the app. Example local settings:

```text
Database: teachassist
Host: 127.0.0.1
Port: 5432
```

Copy the environment template and fill in local credentials:

```bash
copy .env.example .env
```

Required backend environment variables:

```env
DATABASE_URL=postgresql://postgres:your_password@127.0.0.1:5432/teachassist
GROQ_API_KEY=your_groq_api_key
GEMINI_API_KEY=your_gemini_api_key
ALLOWED_ORIGINS=http://localhost:4200,http://127.0.0.1:4200
```

Run the backend:

```bash
uvicorn app.main:app --reload
```

Backend URL:

```text
http://127.0.0.1:8000
```

Health check:

```text
http://127.0.0.1:8000/health
```

## Frontend Setup

```bash
cd frontendd
npm install
npm start
```

Frontend URL:

```text
http://localhost:4200
```

The local frontend API URLs are configured in:

```text
frontendd/src/environments/environment.ts
```

The production frontend API URLs are configured in:

```text
frontendd/src/environments/environment.prod.ts
```

## Database Data

If another developer needs sample data, restore the included PostgreSQL dump using pgAdmin or `pg_restore`:

```text
TeachAssist_public.dump
```

Each developer should use their own local database credentials in `backend/.env`.

## Developer Workflow

Create a branch for each change:

```bash
git pull origin main
git checkout -b feature/my-change
```

After making changes:

```bash
git status
git add backend frontendd README.md render.yaml
git commit -m "Describe the change"
git push origin feature/my-change
```

Open a pull request on GitHub, review it, then merge it into `main`.

## Deployment

### Backend on Render

The backend is configured through `render.yaml`:

```yaml
services:
  - type: web
    name: teachassist-backend
    env: python
    rootDir: backend
    buildCommand: pip install -r requirements.txt
    startCommand: uvicorn app.main:app --host 0.0.0.0 --port $PORT
    healthCheckPath: /health
```

In Render, set these environment variables:

```env
DATABASE_URL=your_production_database_url
GROQ_API_KEY=your_production_groq_api_key
GEMINI_API_KEY=your_production_gemini_api_key
ALLOWED_ORIGINS=https://your-frontend-domain
```

Render can deploy automatically when changes are merged to the connected GitHub branch.

### Frontend

Build the Angular app:

```bash
cd frontendd
npm run build
```

Deploy the generated `frontendd/dist/` output to a static hosting provider such as Render Static Site, Netlify, Vercel, or Firebase Hosting.

Before production deployment, confirm `frontendd/src/environments/environment.prod.ts` points to the deployed backend URL.

## Adding Another Developer

1. Add the developer as a GitHub collaborator on the repository.
2. Add the developer to the Render team or service with deploy permissions.
3. Share required production environment variable values through a secure channel.
4. Never commit real `.env` files, API keys, database passwords, local virtual environments, or `node_modules`.

