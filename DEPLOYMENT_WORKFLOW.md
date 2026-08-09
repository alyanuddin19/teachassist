# TeachAssist Local To Production Workflow

Use this machine as a local development copy. Do not point local development at the production database unless you are intentionally performing a production operation.

## Daily Local Run

Open two PowerShell windows from the project root.

```powershell
powershell -ExecutionPolicy Bypass -File .\start-backend.ps1
```

```powershell
powershell -ExecutionPolicy Bypass -File .\start-frontend.ps1
```

Local URLs:

```text
Backend:  http://127.0.0.1:8000
Frontend: http://localhost:4200
```

## Database Rule

Local database changes stay local. Production database changes happen only on the production database.

Recommended setup:

```text
Local backend/.env DATABASE_URL      -> local PostgreSQL teachassist database
Render DATABASE_URL                  -> production PostgreSQL database
```

Never commit `backend/.env`.

## Before Changing Code

Create a backup of the local database:

```powershell
$env:PGPASSWORD="1234"
powershell -ExecutionPolicy Bypass -File .\backup-postgres.ps1
```

Backups are written to `backups/`, which is ignored by Git.

## Before Deploying

Run the local verification:

```powershell
powershell -ExecutionPolicy Bypass -File .\verify-local.ps1
```

This checks that the backend imports successfully and the Angular frontend builds.

## Code Deployment Path

1. Make changes locally.
2. Run `verify-local.ps1`.
3. Commit changes on a feature branch.
4. Push the branch to GitHub.
5. Open a pull request.
6. Merge to `main` only after review.
7. Render deploys the backend from the connected branch.
8. Deploy the Angular build to the frontend host.

## Data Deployment Path

Do not sync local database edits to production automatically.

If production data needs to change:

1. Back up the production database from Render or the production PostgreSQL provider.
2. Apply the data change intentionally through the app, an approved SQL script, or a controlled restore.
3. Verify production health at `/health`.

## Production Environment

Render must have these environment variables:

```env
DATABASE_URL=production_postgres_url
GROQ_API_KEY=production_groq_key
GEMINI_API_KEY=production_gemini_key
ALLOWED_ORIGINS=https://your-frontend-domain
```

The production frontend URLs live in:

```text
frontendd/src/environments/environment.prod.ts
```

Current production backend:

```text
https://teachassist-backend.onrender.com
```
