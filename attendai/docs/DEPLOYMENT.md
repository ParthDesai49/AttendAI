# Deploying AttendAI (free tiers)

Three pieces: database on **Neon**, backend on **Render**, frontend on **Vercel**. Do them in this order. Push the project to a GitHub repo first (the `.gitignore` already skips `venv`, `node_modules` and `.env`).

## 1. Database (Neon)
1. Create a project at neon.tech and copy the connection string (it starts with `postgresql://` and ends with `?sslmode=require`).
2. Load the schema from your laptop:
   ```
   psql "<your connection string>" -f database/schema.sql
   ```
3. Create the demo data from `backend`, with the string in your environment:
   ```
   set DATABASE_URL=<your connection string>        (Mac/Linux: export DATABASE_URL=...)
   python -m scripts.seed
   python -m scripts.seed_holidays
   ```

## 2. Backend (Render)
1. New > Web Service > connect the GitHub repo. Root directory `backend`, runtime Python 3.
2. Build command: `pip install -r requirements.txt`
3. Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
4. Environment variables:
   - `DATABASE_URL` = the Neon string
   - `SECRET_KEY` = a long random value (`python -c "import secrets; print(secrets.token_urlsafe(48))"`)
   - `CORS_ORIGINS` = your Vercel address, e.g. `https://attendai.vercel.app` (add after step 3, then redeploy)
   - `APP_URL` = the same Vercel address (links in emails and the QR code use it)
   - Email (optional): `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURITY` (`starttls` / `ssl`), `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`. Leave `SMTP_HOST` empty to keep test mode. Gmail needs an app password, not your normal one.
   - `QR_TOKEN_SECONDS` and `FACE_MATCH_THRESHOLD` only if you want to change the defaults (45 and 0.5)
   - Existing database? Nothing to run. The backend adds the Face ID table and columns itself on start.
5. Open `https://<service>.onrender.com/api/health`. It should return `{"status":"ok"}`.

The free tier sleeps after inactivity, so the first request can take up to a minute. Open the site once before an interview.

## 3. Frontend (Vercel)
1. Import the repo. Root directory `frontend`, framework Vite.
2. Environment variables:
   - `VITE_API_URL` = the Render address (no trailing slash)
   - `VITE_SHOW_DEMO` = `true` while showing it to interviewers (demo chips on the sign-in page), `false` for real use
3. Deploy. `vercel.json` already makes page refreshes work.
4. Go back to Render and set `CORS_ORIGINS` to the Vercel address, then redeploy.

## Before you share the link
- Use a new `SECRET_KEY` (never the default).
- If real people will use it, change the demo passwords and set `VITE_SHOW_DEMO=false`.
- Test sign-in, check-in and a report download on the live site.
- Open `/kiosk` as HR and scan it with your phone, then enrol Face ID once. Both need the https address (cameras are blocked on plain http).
- Press **Send me a test email** in Check-in setup.
- Render's free plan keeps Face ID lockout counters in memory per process, so a restart resets them.
- Put the live link and the GitHub link on your resume and LinkedIn.

## Demo-day checklist
1. Open the live site 5 minutes early so Render wakes up (the free plan sleeps).
2. Sign in as HR, open **Check-in setup > QR kiosk** on one screen and scan it from a phone over https.
3. Set up Face ID once on the laptop you will demo on, in the same lighting as the demo.
4. Have two tabs ready: an employee (send a leave request and a correction) and a manager (approve them, watch the bell).
5. Keep the GitHub page open: README screenshots, the 55 tests and the green CI badge are part of the story.
