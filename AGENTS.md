# KPO Agent AI — Agent Guide

Project memory lives in [`docs/PROJECT_MEMORY.md`](docs/PROJECT_MEMORY.md). Read that first; this file is the quick operating guide.

## Commands

From `web/`:

```bash
npm install
npm run dev          # http://localhost:3000
npm run lint
npm run build        # next build --webpack
npm start -- -p 3101 # use when port 3000 is busy
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
- `src/lib/admin/data.ts` — admin queries and role labels.
- `supabase/migrations/` — database source of truth. Apply in filename order.

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

- Apply `202611080001_short_invitation_codes.sql`, `202611090001_invitation_code_history.sql` and `202611090002_revoke_user_sessions.sql` to the remote Supabase project. The remote may have an older lowercase implementation of migration 3; migration 4 is compatible with existing 6- and 48-character hashes.
- The app is local only; no deployment yet.
- The current project uses **Confirm email** disabled to avoid the built-in SMTP 429 limit. Configure custom SMTP before re-enabling verification for the final challenge.

## Rules

- Never commit `.env.local` or secrets. Service-role key stays server-side.
- Do not expose codes, hashes or user data in logs.
- Keep changes small and verify with `npm run lint` and `npm run build`.
- `next dev` rewrites the Next.js block below; keep it in the file.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
