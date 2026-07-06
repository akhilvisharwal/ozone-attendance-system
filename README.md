# Ozone Aircon — Attendance Management System

A secure, web-based Attendance Management System built for Ozone Aircon employees. Employees check in/out with live GPS + a live camera selfie and submit a daily work report; administrators get full visibility, employee management, and exportable reports.

## Tech Stack

| Layer          | Technology                                           |
| -------------- | ----------------------------------------------------- |
| Frontend       | React 19, TypeScript, Vite, Tailwind CSS v4, React Router |
| Backend        | Node.js, Express, TypeScript                          |
| Database       | PostgreSQL                                            |
| Auth           | JWT (access + refresh tokens), bcrypt, RBAC            |
| File storage   | Local disk (pluggable driver, swappable for S3/cloud)  |
| Reports        | ExcelJS (`.xlsx`), PDFKit (`.pdf`)                     |
| Reverse geocoding | OpenStreetMap Nominatim (no API key needed for dev) |

## Project Structure

```
ozone-attendance-system/
├── docker-compose.yml      # PostgreSQL for local development
├── backend/                # Express + TypeScript API
│   └── src/
│       ├── config/         # env vars, db pool
│       ├── db/             # SQL migrations + seed script
│       ├── middleware/     # auth, RBAC, upload, error handling
│       ├── modules/        # auth, employees, sites, attendance, dashboard, reports, files, audit
│       ├── services/       # storage abstraction, reverse geocoding
│       └── utils/
└── frontend/                # React + TypeScript + Tailwind SPA
    └── src/
        ├── api/             # axios client + typed API calls
        ├── auth/            # AuthContext, ProtectedRoute
        ├── components/      # shared UI + layout
        ├── hooks/           # camera + geolocation hooks
        └── pages/
            ├── employee/    # check-in/out, history, work reports
            └── admin/       # dashboard, employees, attendance, sites, reports
```

## Prerequisites

- Node.js 20+
- Docker Desktop (for the bundled PostgreSQL container) — or your own PostgreSQL 14+ instance

## Getting Started

### 1. Start PostgreSQL

```bash
docker compose up -d
```

This starts Postgres on `localhost:5432` with the credentials already wired into `backend/.env.example`.

If you'd rather use an existing PostgreSQL server, just update `DATABASE_URL` in `backend/.env` accordingly.

### 2. Backend setup

```bash
cd backend
cp .env.example .env    # already done for you if you're reading this from the generated repo
npm install
npm run migrate         # creates tables
npm run seed             # creates the initial administrator account
npm run dev               # starts the API on http://localhost:4000
```

The seed script prints a generated administrator Employee ID and password — **save these**, they won't be shown again. Defaults (override in `.env` before seeding):

- Employee ID: `OZNADMIN`
- Password: `ChangeMe@123`

### 3. Frontend setup

```bash
cd frontend
npm install
npm run dev   # starts the app on http://localhost:5173
```

The Vite dev server proxies `/api/*` to the backend on port 4000, so no CORS configuration is needed in development.

### 4. Log in

Open `http://localhost:5173`, sign in as the administrator, and use **Employees → Add Employee** to create real employee accounts. Each new employee gets an auto-generated Employee ID (`OZN001`, `OZN002`, …) and a temporary password shown once — share it with them securely.

## Core Features (per requirements)

**Administrator**
- Create employee accounts with auto-generated Employee IDs and temporary passwords
- Reset passwords, activate/deactivate accounts
- View all attendance records, GPS locations, selfies, and daily work reports
- Manage office/project sites
- Dashboard analytics (present/absent/late/checked-in/checked-out counts)
- Export attendance reports as Excel or PDF (daily/weekly/monthly/custom range, per employee)

**Employee**
- Login with Employee ID + password
- Check in: live camera selfie capture (no gallery uploads — captured via `getUserMedia`, not a file picker) + GPS location, reverse-geocoded to an address
- Check out: required daily work report (project/site, work summary, status, optional remarks & site photos)
- View only their own attendance history and work reports
- Cannot edit their profile, change their password, or modify/delete attendance records — all enforced server-side

## Security Notes

- All authorization is enforced **server-side** via `requireAuth` / `requireRole` middleware and per-record ownership checks — an employee cannot view another employee's data by editing IDs in the URL.
- Passwords are hashed with bcrypt; JWT access tokens are short-lived (15m) with rotating httpOnly refresh tokens (7d), stored hashed in the database so they can be revoked.
- Uploaded selfies/site photos are served through an authenticated endpoint (`/api/files/...`) with ownership checks — they are not publicly accessible static files.
- Login is rate-limited to slow down brute-force attempts.
- Helmet + strict CORS are enabled on the API.

## Environment Variables

See `backend/.env.example` for the full list (server port, JWT secrets, admin bootstrap credentials, upload limits, office start time used for "late arrival" detection, etc). **Change all secrets before deploying to production.**

## Production Deployment

See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for full instructions:

- **Frontend** → Vercel (`frontend/`, set `VITE_API_URL`)
- **Backend API** → Render (`render.yaml`, set `DATABASE_URL` + `CLIENT_URL`)
- **Database** → Neon or Render Postgres

## Known Limitations / Next Steps

- File storage defaults to local disk via a pluggable `StorageDriver` interface — implement an `S3Driver` (same interface) in `backend/src/services/storage/` to move to cloud storage without touching business logic.
- Reverse geocoding uses the free OpenStreetMap Nominatim API, which has usage limits; swap in Google Maps/Mapbox for production-scale volume.
- Future enhancements from the spec (geofencing, face recognition, QR attendance, payroll/inventory integration, push notifications) are not implemented in this version but the schema (`sites.radius_meters`, etc.) leaves room to add them.
- This environment did not have Docker/PostgreSQL available to run a live end-to-end smoke test — both the backend (`tsc`) and frontend (`vite build`) compile cleanly, but please run through the checklist below after starting the stack locally.

## Post-Setup Checklist

1. `docker compose up -d` then `npm run migrate && npm run seed` in `backend/`
2. Log in as admin, create a test employee
3. Log in as the employee, check in (grant camera + location permissions), then check out with a work report
4. As admin, confirm the record appears on the Dashboard and Attendance Records page, with selfie + map visible in the detail view
5. Export an Excel and PDF report from the Reports page
