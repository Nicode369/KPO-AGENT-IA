# Project memory — KPO Agent AI

Last updated: 2026-11-07. Keep this file current when architecture or pending work changes.

## Product

Web app for document consultation in audit, accounting and compliance. This phase covers identity, invitation-based registration, groups, memberships and a minimal admin area. Document ingestion and the RAG agent belong to later phases.

## Routes

- `/` — landing.
- `/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email` — public auth.
- `/app` — signed-in dashboard. Requires an active profile and membership (or superadmin).
- `/admin`, `/admin/groups`, `/admin/invitations`, `/admin/users` — admin area.
- `/auth/callback` — exchanges Supabase auth codes and redirects.

## Stack and conventions

- Next.js 16 App Router, React 19, server actions, TypeScript.
- Supabase JS + SSR; cookies via `src/lib/supabase/server.ts` and `src/proxy.ts`.
- Plain CSS in `src/app/globals.css`; no Tailwind utilities.
- `export const instant = false` on pages that read live session data.
- Spanish UI copy, `es-CO` dates.

## Design tokens

- Red primary: `--red-500 #e0313c`, `--red-600 #c72531`, `--red-700 #a51c27`.
- Ink: `--ink #181818`; surfaces `--white`, `--surface #f6f6f3`.
- Muted text: `--muted #62625d`, `--muted-2 #6f6f6a`.
- Fonts: Bricolage Grotesque (display), Schibsted Grotesk (body), loaded with `next/font`.
- Brand mark: four squares, one red, rotated; see `src/components/brand-mark.tsx`.
- Icons: inline SVG set in `src/components/icons.tsx`; no emoji or icon fonts.

## Data model

- `profiles` — one row per `auth.users` row; `is_superadmin`, `is_active`, `sessions_revoked_at`.
- `groups` — name, unique slug, active flag.
- `group_memberships` — user/group/role/status; unique per group and user.
- `invitations` — group, role, `code_hash`, optional `code` (history), max/used count, expiry, revocation.
- `invitation_redemptions` — audit row created by the trigger when a code is redeemed.
- Roles: `group_admin`, `supervisor`, `analyst`. Membership status: `pending`, `active`, `disabled`.

RLS denies direct access to `invitations` for authenticated users. Admin screens use security-definer RPCs:

- `create_invitation(p_group_id, p_role, p_max_uses, p_expires_at)` — 6-character uppercase code, up to 365 days.
- `list_group_invitations(p_group_id)` — returns code and usage to superadmins or that group's admin.
- `revoke_invitation(p_invitation_id)`.
- `update_group_membership(...)`, `set_profile_active(...)`, `create_group(...)`.
- `revoke_user_sessions(p_user_id)` — superadmin only; sets `sessions_revoked_at` and deletes `auth.sessions`, which cascades to refresh tokens.

## Invitation lifecycle

1. Admin generates an invitation. The RPC returns the plaintext code and stores both `code` and `code_hash` (migration 4).
2. The UI shows the code in the success panel and in the history, always uppercase. `CopyCodeButton` copies it.
3. `/register` requires the code. `InvitationCodeInput` uppercases, strips symbols and accepts 6 characters (or a pasted legacy 48-hex code).
4. `signUp` uppercases the code and calls Supabase Auth with it in `user_metadata`.
5. The `auth.users` trigger looks up `code_hash`, checks revocation/expiry/uses/group active, increments `use_count`, writes `invitation_redemptions`, creates the profile and membership.
6. The trigger removes `invitation_code` from user metadata after use.

Compatibility:

- 6-character codes are the default. The alphabet is `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (avoids ambiguous characters).
- Legacy 48-hex codes are still accepted.
- If the remote `create_invitation` still has the old 90-day limit, `createInvitationAction` retries with 90 days and tells the user which migration is missing.
- Invitations created before migration 4 have no stored code; history shows `No disponible`.

## Migrations

Apply in order:

1. `202611060001_initial_identity_and_access.sql` — schema, trigger, RLS, RPCs.
2. `202611070001_invitation_long_expiry.sql` — 365-day expiry.
3. `202611080001_short_invitation_codes.sql` — 6-character uppercase codes and trigger support for 6/48-character codes.
4. `202611090001_invitation_code_history.sql` — `code` column, code-aware `create_invitation`, code-aware `list_group_invitations`, and a replacement auth trigger. The trigger replacement keeps uppercase-hash creation and redemption consistent if migration 3 was applied partially.
5. `202611090002_revoke_user_sessions.sql` — `profiles.sessions_revoked_at` and the superadmin-only `revoke_user_sessions` RPC.

The remote project may have an older lowercase implementation of migration 3. Migration 4 accepts both uppercase and lowercase 6-character hashes, so reapplying it does not break existing invitations.

## Auth and admin guards

- `requireUser()` in `src/lib/auth/workspace.ts` checks the session, active profile and active membership.
- `requireAdminUser()` returns the Supabase client, superadmin flag and the group IDs the user administers.
- Superadmins can assign `group_admin`; group admins cannot.
- Blocked/inactive profiles are signed out and sent to `/login?error=inactive`.
- If the JWT `iat` is earlier than `profiles.sessions_revoked_at`, the session is signed out and redirected to `/login?error=session_revoked`. Deleting `auth.sessions` also invalidates refresh tokens. The user can log in again with their password; deactivate the profile to block access completely.

## Registration error handling

`src/app/auth/actions.ts` maps Supabase failures to stable query codes:

- `email_rate_limit` — Supabase built-in SMTP hourly limit (HTTP 429). Wait or configure custom SMTP.
- `weak_password` — Supabase Auth minimum is stricter than 6.
- `email_taken` — existing account (when Supabase reveals it).
- `invalid_invitation` — code invalid, used or expired.
- `registration_database` — `Database error saving new user`; usually the invitation trigger rejected the insert.
- `registration_failed` — fallback.

The server logs `{ code, status, message }` only. Never log passwords, codes or tokens.

## Local verification

```bash
cd web
npm run lint
npm run build
npm start -- -p 3101
```

Manual checks:

- Landing and auth pages at desktop and mobile widths.
- `/register` with a valid code: code input is uppercase, profile and membership are created, invitation `use_count` increments.
- `/admin/invitations`: new code appears in the success panel and in the history; copy button works; old invitations show `No disponible`.
- Password fields accept 6 characters in the UI and in the action.
- `/admin/users`: a superadmin can revoke another user's sessions; the affected user is redirected to `/login?error=session_revoked` on the next request and cannot refresh the old session.

Playwright is available through the global npx cache; test scripts were kept outside the repo in `/tmp/opencode/kpo-screens/`. Do not commit test users, invitations or screenshots.

## Known issues / next steps

- Apply migrations 4 and 5 to the remote project. Migration 4 is required for history codes; migration 5 is required for session revocation.
- The current project uses **Confirm email** disabled to avoid the built-in SMTP 429 limit. If email verification is required for the final challenge, configure a custom SMTP provider and re-enable it; the trigger already leaves memberships pending until confirmation.
- No deployment yet; `APP_ORIGIN` must match the deployed URL.
- Future phase: document upload, extraction, retrieval and the RAG agent.

## Security notes

- `.env.local` is not committed. Only env var names are documented.
- `SUPABASE_SERVICE_ROLE_KEY` is server-only; never expose it to the browser.
- Storing `invitations.code` is an explicit product decision to support history. The column is only returned by an authorized security-definer RPC; keep it out of client-side direct table queries.
- Rotate/revoke an invitation if a code leaks.
