# KPO Agent AI — Agent Guide

Project memory lives in [`docs/PROJECT_MEMORY.md`](docs/PROJECT_MEMORY.md). Read that first; this file is the quick operating guide. Product overview: [`README.md`](README.md). Architecture and diagrams: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Deployment: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Commands

From `web/`:

```bash
npm install
npm run dev          # http://localhost:3000
npm run lint
npm run build        # next build --webpack
npm test             # Vitest unit tests
npm run test:e2e     # Playwright; requiere servidor y navegador instalado
npm start -- -p 3101 # use when port 3000 is busy
```

Worker de ingesta (desde `workers/kpo-ingest/`):

```bash
npm install
npm run typecheck
npm test             # Vitest unit tests del chunker
npm run dry-run      # valida el bundle sin desplegar
npm run dev          # http://localhost:8787
npm run deploy       # requiere npx wrangler login
```

## Stack

- Next.js 16 App Router with React 19 and server actions.
- Supabase Auth, Postgres, RLS and security-definer RPCs.
- TypeScript, plain CSS with custom properties. Tailwind packages are installed but the UI does not use Tailwind utilities.

## Key paths

- `src/app/` — routes. Public auth pages use `(auth)`, signed-in workspace uses `(workspace)`.
- `src/app/globals.css` — full design system, components and responsive rules.
- `src/components/` — brand mark, SVG icons, auth frame, workspace shell, admin nav, invitation code input.
- `src/lib/supabase/` — browser/server clients, env checks and session proxy.
- `src/lib/auth/workspace.ts` — `requireUser`, `requireAdminUser`, role checks.
- `src/lib/admin/data.ts` — admin queries for groups, invitations and members.
- `src/lib/admin/documents.ts` — document library/detail queries, signed URLs and labels.
- `src/lib/admin/audit.ts` — admin query history via service role, scoped by group for `group_admin`.
- `src/lib/admin/audit-events.ts` — append-only audit events, filters, CSV export data and `verify_audit_chain`.
- `src/lib/admin/reports.ts` — 24 h overview of outcomes, security alerts, audit chain and documents.
- `src/app/(workspace)/admin/audit/page.tsx` — global/group-scoped query history for admins.
- `src/app/(workspace)/admin/audit/events/page.tsx` — audit events, hash-chain verifier and CSV export link.
- `src/app/(workspace)/admin/reports/page.tsx` — combined audit/operations report.
- `src/app/api/admin/audit/export/route.ts` — protected CSV export for queries/events; logs `audit_export`.
- `src/lib/audit/log.ts` — server-side `recordAuditEvent` (never throws; requires service role).
- `src/lib/agent/` — RAG prompt, citation validation, abstention, security classifier and response types.
- `src/app/(workspace)/admin/documents/` — document list, detail, review forms and server actions.
- `src/app/api/admin/documents/` — multipart proxies to the ingestion Worker.
- `src/app/api/agent/query/` — authenticated RAG endpoint (embedding, retrieval, chat, audit).
- `src/components/agent-console.tsx` — agent chat UI rendered in `/app`.
- `src/app/(workspace)/app/history/page.tsx` — personal agent query history.
- `scripts/ingest-base-drive.mjs` — batch ingestion of the `base_drive` folder; supports `--dry-run`.
- `e2e/` — Playwright smoke tests. Install browsers with `npx playwright install chromium`.
- `supabase/migrations/` — database source of truth. Apply in filename order.
- `workers/kpo-ingest/` — Cloudflare Worker for phase 4/5 ingestion and model access (`/health`, `/embed-test`, `/embed`, `/chat`, `/ingest`, `/documents/:id/process`, `/documents/:id/versions`). Secrets live in `.dev.vars` locally and `wrangler secret` in production.

## Invitations

- Codes are 6 characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` and are handled as uppercase.
- `InvitationCodeInput` uppercases and filters input; it also accepts a pasted legacy 48-hex code.
- `signUp` uppercases again server-side; the database trigger hashes the code.
- `invitations.code_hash` validates redemption. `invitations.code` (migration 4) lets admins see and copy the code in history.
- Existing invitations created before migration 4 have `code = null`; the UI shows `No disponible`.
- `create_invitation` allows up to 365 days and 500 uses. If the remote function still has the 90-day limit, the action retries with 90 days.

## Registration errors

`signUp` maps Supabase errors to short codes in `src/app/auth/actions.ts` and `AuthMessage` renders the message:

- `over_email_send_rate_limit` / HTTP 429 → `email_rate_limit`. Supabase's built-in SMTP has a low hourly limit; configure custom SMTP or wait.
- `weak_password` → increase the Supabase Auth minimum or use a compliant password.
- `23514` / message contains `invitation` → invalid, used or expired invitation.
- `Database error saving new user` → `registration_database`; usually the invitation trigger rejected the row.
- Server logs include only `{ code, status, message }` under `[signUp] Supabase error`; never log passwords or codes.

## Session revocation

- Migration 5 adds `profiles.sessions_revoked_at` and `revoke_user_sessions(p_user_id)`.
- The RPC is superadmin-only, updates the timestamp and deletes `auth.sessions`; refresh tokens cascade.
- `requireWorkspaceUser` compares the JWT `iat` with `sessions_revoked_at` and signs out stale sessions to `/login?error=session_revoked`.
- `/admin/users` exposes **Revocar sesiones** only to superadmins and not for their own account. Revocation forces a new login; use profile deactivation to block the account.

## Current pending work

- Migrations 6, 7 and 8 are applied remotely. Both private buckets, pgvector and the retrieval/audit RPCs exist.
- Migrations 9 (`202611120001_audit_events_chain.sql`) and 10 (`202611120002_audit_events_immutable_refs.sql`) are applied remotely. The chain verifies clean after removing the mutable `on delete set null` FKs.
- Migration 11 (`202611120003_agent_out_of_scope.sql`) is **pending to apply**: it adds `out_of_scope` to the `agent_queries` outcome constraint and migrates legacy rows without relevant sources.
- Phase 6 is complete: hash-chained `audit_events`, auth/admin/export logging, event viewer, integrity verifier, reports and CSV export. E2E covers the events/reports pages and CSV export.
- Dates are stored in UTC. Server-rendered UI and CSV exports use `America/Bogota`; date filters treat `from`/`to` as Colombian calendar days.
- Cloudflare is authenticated. The Worker runs locally on port 8787 and passes `typecheck`, `test`, `dry-run` and `/health`; it is not deployed yet.
- `INGEST_WORKER_URL` is set in `.env.local` to the local Worker. `npm run ingest:base-drive` completed: 15 documents, 1185 chunks, all published as `common`.
- OCR and `/chat` are validated against the live Workers AI binding. `Circular Externa 100-000015` was reprocessed with Mistral Small 3.1 and the agent answered the `631-5` question with a versioned citation.
- The active `analyst` test account in the KPO group validated the non-superadmin agent flow.
- Remaining: deploy the Worker with its secrets, move large OCR jobs off the request path, extend Playwright/E2E to analyst/group-admin flows, and complete deployment configuration (`APP_ORIGIN`, `INGEST_WORKER_URL`).
- The app is local only; no deployment yet.
- The current project uses **Confirm email** disabled to avoid the built-in SMTP 429 limit. Configure custom SMTP before re-enabling verification for the final challenge.

## Rules

- Never commit `.env.local` or secrets. Service-role key stays server-side.
- Do not expose codes, hashes or user data in logs.
- Keep changes small and verify with `npm run lint`, `npm run build`, `npm test`, and the Worker `typecheck`/`test`/`dry-run` when touching `workers/`.
- `next dev` rewrites the Next.js block below; keep it in the file.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
