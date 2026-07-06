# Production Deployment Guide

This app is a **split deployment**:

| Component | Platform | Why |
|-----------|----------|-----|
| **Frontend** (React SPA) | [Vercel](https://vercel.com) | Static hosting, CDN, custom domain |
| **Backend** (Express API) | [Render](https://render.com) | Long-running Node server, file uploads, PostgreSQL |
| **Database** | [Neon](https://neon.tech) or Render Postgres | Managed PostgreSQL with SSL |

> Vercel alone cannot run this Express API with persistent file uploads (selfies, site photos). The backend runs on Render; the frontend on Vercel calls it via `VITE_API_URL`.

---

## 1. Database (Neon — recommended)

1. Create a project at [neon.tech](https://neon.tech)
2. Copy the **pooled connection string** (`postgresql://...?sslmode=require`)
3. Save it as `DATABASE_URL` for the backend

---

## 2. Backend (Render)

### Option A — Blueprint (from this repo)

1. Push this repo to GitHub
2. In Render: **New → Blueprint** → connect the repo
3. Render reads `render.yaml` and creates `ozone-attendance-api`
4. Set these environment variables in the Render dashboard:

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | Neon connection string |
| `CLIENT_URL` | Your Vercel frontend URL (e.g. `https://ozone-attendance.vercel.app`) |
| `JWT_ACCESS_SECRET` | Random 64+ char string |
| `JWT_REFRESH_SECRET` | Different random 64+ char string |
| `NODE_ENV` | `production` |
| `TZ` | `Asia/Kolkata` |
| `DATABASE_SSL` | `true` (if not auto-detected) |

5. After first deploy, open the **Render Shell** and run once:

```bash
npm run deploy:setup
```

This runs migrations and seeds the admin account. **Save the printed admin credentials.**

6. Note your API URL: `https://ozone-attendance-api.onrender.com`

### Option B — Manual

- Root directory: `backend`
- Build: `npm install && npm run build && npm run migrate`
- Start: `npm run start:prod`
- Health check: `/api/health`

---

## 3. Frontend (Vercel)

1. Import the GitHub repo in [Vercel](https://vercel.com/new)
2. Set **Root Directory** to `frontend`
3. Framework preset: **Vite** (auto-detected)
4. Add environment variable:

| Variable | Value |
|----------|-------|
| `VITE_API_URL` | Render API origin, **no trailing slash** (e.g. `https://ozone-attendance-api.onrender.com`) |

5. Deploy

`vercel.json` is included for SPA routing (all routes → `index.html`).

### Redeploy after backend URL changes

`VITE_API_URL` is embedded at **build time**. If you change the API URL, trigger a new Vercel deployment.

---

## 4. CORS & cookies (cross-origin)

The frontend (Vercel) and API (Render) are on different domains. This is configured automatically:

- Backend `CLIENT_URL` = your Vercel URL
- Refresh cookies use `SameSite=None; Secure` in production
- Frontend axios uses `withCredentials: true`

---

## 5. Local development

```bash
docker compose up -d          # Postgres
cd backend && cp .env.example .env && npm install && npm run migrate && npm run seed && npm run dev
cd frontend && cp .env.example .env && npm install && npm run dev
```

Leave `VITE_API_URL` empty locally — Vite proxies `/api` to `localhost:4000`.

---

## 6. Production checklist

After deploy, verify:

- [ ] `GET https://<api>/api/health` returns `{ "status": "ok" }`
- [ ] Login as admin on the Vercel URL
- [ ] Create employee, check-in with GPS/selfie, check-out
- [ ] Leave request submit and admin approval
- [ ] Export PDF/Excel report
- [ ] Settings save and persist after refresh
- [ ] Mobile layout (resize browser / phone)

---

## 7. CLI deploy (optional)

```bash
# Frontend
cd frontend
npx vercel --prod
# Set VITE_API_URL in Vercel dashboard first, or:
npx vercel env add VITE_API_URL production

# Backend — use Render dashboard or Blueprint
```

---

## Environment reference

See `backend/.env.example` and `frontend/.env.example`. **Never commit `.env` files.**
