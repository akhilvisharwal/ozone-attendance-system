# QA automation

The browser suite is safe by default. Public smoke tests always run; role smoke tests report a
Playwright skip unless the matching disposable credentials are present. Copy `.env.qa.example`
to `.env.qa` and fill it with disposable QA/staging values. The root `qa:*` scripts load that file
automatically; existing shell or CI variables take precedence. The populated file is ignored and
must never be committed.

## Commands

- `npm run qa:e2e:smoke` — Chromium public smoke plus credential-gated role checks.
- `npm run qa:e2e` — all configured browsers/devices/viewports. The Edge project uses the local
  Microsoft Edge channel; install it before selecting `--project=edge-chromium`.
- `npm run qa:test:http` — isolated HTTP integration coverage.
- `npm run qa:gate` — lint, unit/integration tests, and production builds.

Playwright starts the local backend and frontend when `QA_BASE_URL` points to localhost. Set
`QA_NO_WEBSERVER=1` when those servers are managed separately. Browser artifacts are written to
`test-results/playwright` and `playwright-report`. Direct Playwright commands also load
`qa/.env.qa` through `playwright.config.ts`, so `npx playwright test --list` behaves consistently
with the root runner.

The OTP inbox URL/token fields are provider-neutral placeholders for the later role-flow harness;
`QA_OTP_CODE` can hold a short-lived disposable code for an individual run. Render owner/service
IDs and API key support staging log inspection without placing credentials in scripts.

## Database safety

The HTTP integration suite mutates only disposable records and requires both:

1. `QA_ALLOW_DB_MUTATION=1`
2. a `DATABASE_URL` whose database name contains a distinct `qa` or `test` segment, such as
   `ozone_attendance_test`

Otherwise the suite is skipped before creating data. Never set the mutation flag for production.
CI provisions a fresh PostgreSQL service, runs all migrations, and uses only synthetic credentials.

Role-flow, camera/GPS, OTP inbox, real upload storage, and complete cross-role testing remain
credential/environment-dependent and are intentionally outside this smoke suite.
