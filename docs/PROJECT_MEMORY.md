# Project memory — KPO Agent AI

Last updated: 2026-11-08. Keep this file current when architecture or pending work changes.

## Documentation map

- `README.md` — descripción del producto, inicio rápido, rutas, API, seguridad y estado.
- `docs/ARCHITECTURE.md` — componentes, flujos, ERD, roles, API y decisiones técnicas.
- `docs/DEPLOYMENT.md` — despliegue Vercel + Cloudflare + Supabase, smoke tests y rollback.
- `docs/PROJECT_MEMORY.md` — este documento; estado operativo y memoria de mantenimiento.
- `AGENTS.md` — comandos, rutas clave y reglas para agentes.

## Product

Web app for document consultation in audit, accounting and compliance. Phases 1–7 are implemented in local. Phase 3 covers identity, invitation-based registration, groups, memberships and the admin area. Phase 4 adds private document upload, extraction (including OCR for scanned PDFs), chunking, embeddings, review, publication and versioning. Phase 5 adds a retrieval-augmented agent that answers only from published versions, cites fragment numbers, abstains when evidence is insufficient, blocks prompt/secret/cross-group extraction attempts and records an auditable per-user history. Phase 6 adds an append-only `audit_events` hash chain (SHA-256), auth/admin/ciclo documental logging, group-scoped events viewer, integrity verifier, reports and protected CSV exports. Phase 7 adds simulator cases, batch runs against `runAgentQuery`, per-case metrics (outcome, source, terms, citations, latency) and isolation from real query history. Migrations 1–11 are applied in Supabase; migration 12 (`simulator.sql`) is pending. Phase 8 (deployment) remains pending or partial.

## Routes

- `/` — landing.
- `/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email` — public auth.
- `/app` — signed-in dashboard and document agent. Requires an active profile and membership (or superadmin).
- `/app/history` — personal query history with outcome, model, latency, grounding and sources.
- `/app/simulator` — simulator for superadmins, group admins and supervisors: cases, batch execution and metrics.
- `/api/simulator/run` — `start`, `case` and `finish` actions; reuses `runAgentQuery` with history and rate limit disabled.
- `/admin`, `/admin/groups`, `/admin/invitations`, `/admin/users` — access administration.
- `/admin/audit` — global query history for superadmins and group-scoped history for `group_admin`, read with the service role and group filters.
- `/admin/audit/events` — append-only audit events with hash chain, filters, page size 25, CSV export and manual integrity verification.
- `/admin/reports` — 24 h overview of agent outcomes, security alerts, audit-chain state, document status and protected exports.
- `/admin/security` — blocked and rejected security events for the groups an admin manages.
- `/admin/documents`, `/admin/documents/[id]` — document library, upload, review, access and version history.
- `/api/admin/documents/upload`, `/api/admin/documents/[id]/versions` — authenticated multipart proxies to the ingestion Worker.
- `/api/admin/audit/export` — admin-only CSV export (`dataset=queries|events`) scoped to the profile; each export appends an `audit_export` event.
- `/api/agent/query` — authenticated RAG query: embeds the question, retrieves authorized published chunks, calls the chat model, validates citations and records an audit trail.
- `/auth/callback` — exchanges Supabase auth codes and redirects.

## Stack and conventions

- Next.js 16 App Router, React 19, server actions, TypeScript.
- Supabase JS + SSR; cookies via `src/lib/supabase/server.ts` and `src/proxy.ts`.
- Plain CSS in `src/app/globals.css`; no Tailwind utilities.
- `export const instant = false` on pages that read live session data.
- Spanish UI copy, `es-CO` dates.

## Cloudflare Worker (fases 4 y 5)

- `workers/kpo-ingest/` — Worker independiente para ingesta documental y acceso a modelos. No usa OpenNext ni reemplaza Next.js.
- Endpoints: `GET /health`, `POST /embed-test`, `POST /embed`, `POST /chat`, `POST /ingest`, `POST /documents/:id/process`, `POST /documents/:id/versions`.
- `POST /embed-test` valida el JWT de Supabase y ejecuta `@cf/baai/bge-m3` (1024 dimensiones, multilingüe) mediante el binding `AI`. `POST /embed` devuelve los vectores para el agente.
- `POST /chat` valida el JWT y ejecuta el modelo de chat configurado (`@cf/google/gemma-4-26b-a4b-it` por defecto). El OCR de PDF escaneado usa `@cf/mistralai/mistral-small-3.1-24b-instruct`.
- `POST /ingest` exige superadministrador o `group_admin` del grupo, valida PDF/DOCX por extensión, MIME, firma y tamaño, calcula SHA-256, sube el original a `documents-original`, registra documento/versión y procesa en línea.
- Procesamiento: DOCX usa `env.AI.toMarkdown`. Los PDF pasan por `unpdf`: se extrae el texto por página y las imágenes; cuando una página tiene menos de `OCR_MIN_TEXT_CHARS` (40 por defecto), la imagen se envía a Mistral Small 3.1 Vision. El OCR reduce el ancho a 1400 px, conserva hasta 2400 px de alto, divide páginas de más de 2200 px en franjas de 850 px con 80 px de solapamiento, limita a 4 imágenes por página, elimina sellos administrativos y preámbulos conversacionales, y acepta PDFs con espacios antes de `%PDF-`. El texto se normaliza, se divide en bloques de ~1400 caracteres con solapamiento de 200 (las líneas más largas se segmentan), se generan embeddings BGE-M3 y se insertan en `document_chunks`. El Markdown queda en `documents-processed`.
- `POST /documents/:id/process` reprocesa la versión actual. `POST /documents/:id/versions` agrega una versión inmutable; se permite mientras el documento esté `approved` o `published` sin retirar la versión vigente.
- La publicación es explícita: `publish_document` fija `documents.published_version_id` y sincroniza los metadatos de la fuente. Los usuarios normales solo leen la versión publicada; los administradores leen todas.
- El endpoint del agente aplica un clasificador determinista contra extracción del prompt, secretos, acceso cruzado y extracción masiva; además limita a 20 consultas por minuto por usuario. Los bloqueos y errores también se registran.
- Los errores de extracción dejan el documento y la versión en `error` con `processing_error`; se puede reprocesar o cargar otra versión.
- Variables de modelo: `AI_EMBEDDING_MODEL`, `AI_CHAT_MODEL`, `AI_OCR_MODEL` (Mistral Small 3.1 por defecto) y `OCR_MIN_TEXT_CHARS` en `wrangler.jsonc`. Secretos del Worker: `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY`, en `.dev.vars` local y `wrangler secret` en producción.
- Estado: `typecheck`, tests, `dry-run`, `npm run build` y `GET /health` verificados en local. Cloudflare está autenticado y el Worker corre localmente en el puerto 8787; todavía no está desplegado.

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
- `documents` — documento lógico, versión vigente (`version`), versión publicada (`published_version_id`), estado, visibilidad, vigencia y metadatos de la fuente.
- `document_versions` — original inmutable por versión, extracción, conteo de fragmentos y error de procesamiento.
- `document_chunks` — fragmentos con `vector(1024)` y metadatos de página/sección/artículo/numeral; índice HNSW coseno. Solo son visibles para usuarios normales si pertenecen a `published_version_id`.
- `document_access` — grupos adicionales autorizados para documentos restringidos.
- `document_events` — auditoría del ciclo de vida (carga, procesamiento, aprobación, publicación, retiro, metadatos y accesos).
- `agent_queries` / `agent_query_sources` — auditoría de preguntas, respuesta, modelo, prompt, abstención, outcome, grounding, controles, hashes, latencia y fragmentos recuperados con título del documento.
- `audit_events` — cadena append-only global (`seq`, `event_type`, `actor_id`, `actor_email`, `group_id`, `target_type`, `target_id`, `metadata`, `prev_hash`, `event_hash`, `created_at`). Solo `service_role` accede; la escritura pasa por `append_audit_event` y la verificación por `verify_audit_chain`. `actor_id` y `group_id` se guardan **sin FK** para que borrar usuarios o grupos no mute columnas ya hasheadas. Disparadores registran cambios en perfiles, grupos, invitaciones, membresías y `document_events`; la app registra auth, denegaciones, exportaciones y verificaciones.
- Buckets privados: `documents-original` y `documents-processed`; las políticas de Storage validan el grupo en `(storage.foldername(name))[2]`.

RLS denies direct access to `invitations` for authenticated users. Admin screens use security-definer RPCs:

- `create_invitation(p_group_id, p_role, p_max_uses, p_expires_at)` — 6-character uppercase code, up to 365 days.
- `list_group_invitations(p_group_id)` — returns code and usage to superadmins or that group's admin.
- `revoke_invitation(p_invitation_id)`.
- `update_group_membership(...)`, `set_profile_active(...)`, `create_group(...)`.
- `revoke_user_sessions(p_user_id)` — superadmin only; sets `sessions_revoked_at` and deletes `auth.sessions`, which cascades to refresh tokens.
- `publish_document(p_document_id)`, `retire_document(p_document_id)` — version-aware lifecycle; publication is explicit and atomic.
- `match_document_chunks(p_query_embedding text, p_match_count integer, p_document_ids uuid[])` — similarity search restricted by RLS to readable, published chunks.
- `record_agent_query(...)` — writes the question/answer, outcome, controls, SHA-256 hashes and retrieved fragments to the audit tables.

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
6. `202611100001_documents_and_ingestion.sql` — document tables, pgvector chunks, lifecycle RPCs, RLS, private buckets and storage policies. Applied remotely and verified.
7. `202611110001_document_version_publication.sql` — `documents.published_version_id`, version-aware RLS, `publish_document` and `retire_document`. Applied remotely and verified.
8. `202611110002_agent_retrieval.sql` — `agent_queries`, `agent_query_sources`, `match_document_chunks` and `record_agent_query`. Applied remotely and verified.
9. `202611120001_audit_events_chain.sql` — append-only `audit_events`, SHA-256 hash chain, `append_audit_event`, `verify_audit_chain`, RLS/grants and triggers for profiles, groups, invitations, redemptions, memberships and document events. Applied remotely; the chain starts empty because historical events are not backfilled.
10. `202611120002_audit_events_immutable_refs.sql` — applied and verified. Drops the mutable `on delete set null` FKs on `audit_events.actor_id` and `audit_events.group_id` and restores the original `group_id`/`actor_id` values where they were nulled, so previously hashed events verify again.
11. `202611120003_agent_out_of_scope.sql` — applied. Adds `out_of_scope` to the `agent_queries` outcome constraint and migrates legacy `insufficient_evidence` rows without relevant sources.
12. `202611120004_simulator.sql` — **pending to apply.** Creates `simulator_cases`, `simulator_runs` and `simulator_results` with group-scoped RLS, manager/runner helpers and unique run/case results.

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
npm test
npm start -- -p 3101
```

Worker:

```bash
cd web/workers/kpo-ingest
npm run typecheck
npm test
npm run dry-run
```

Manual checks:

- Landing and auth pages at desktop and mobile widths.
- `/register` with a valid code: code input is uppercase, profile and membership are created, invitation `use_count` increments.
- `/admin/invitations`: new code appears in the success panel and in the history; copy button works; old invitations show `No disponible`.
- Password fields accept 6 characters in the UI and in the action.
- `/admin/users`: a superadmin can revoke another user's sessions; the affected user is redirected to `/login?error=session_revoked` on the next request and cannot refresh the old session.
- `/admin/documents`: upload a PDF/DOCX, confirm `pending_review`, inspect extracted/chunks, approve, publish and retire.
- Upload a new version while the document is `published`; verify the old version remains queryable until the new one is published.
- Reprocess a failed document and verify access restrictions with a group admin from another group.
- `/app`: ask a question answerable by the published corpus; confirm citations link to sources. Ask an unrelated question; confirm the exact abstention text and no sources. Try a prompt-injection or secret request; confirm it is blocked and appears in history.
- `/app/history`: confirm the query, outcome, model, latency, grounding and source snapshots are visible only to the same user.
- `/admin/audit`: as superadmin, confirm queries from every group are visible with full detail and filters; as `group_admin`, confirm only queries from the managed groups appear and the group filter cannot be escaped.
- `/admin/audit/events`: confirm login/logout, failed auth, admin changes, document lifecycle and export events appear with labels and hashes; run **Verificar integridad** and check the success panel; as `group_admin`, confirm only events for managed groups (plus his own scoped exports) are listed.
- `/admin/reports`: confirm 24 h counts, document status table, last hash and both CSV downloads; each download must append an `audit_export` event.
- `npm run test:e2e` with a running server (`npx playwright install chromium` once). The smoke test checks `/login`.

Do not commit test users, invitations, screenshots or credentials.

## Known issues / next steps

- Migraciones 6, 7 y 8 aplicadas en Supabase; tablas, RPCs, pgvector y buckets privados verificados.
- La migración 9 (`audit_events_chain`) está aplicada. La cadena arranca vacía: no hay backfill de eventos anteriores.
- La migración 10 (`audit_events_immutable_refs`) está aplicada y verificada: eliminó las FKs `on delete set null` que alteraban `actor_id`/`group_id` ya incluidos en el hash y reparó los eventos afectados. La cadena verificó `is_valid: true`.
- La migración 11 (`agent_out_of_scope`) está aplicada: amplía el check de outcomes y migró consultas históricas sin fuentes relevantes.
- La migración 12 (`simulator.sql`) está pendiente: crea las tablas y políticas del simulador. Hasta aplicarla, `/app/simulator` muestra el aviso de migración faltante.
- La fase 6 está completa: cadena SHA-256, logging de auth/admin/exportaciones, visor de eventos, verificador y reportes. Los triggers se validaron creando/desactivando/borrando un grupo temporal.
- La fase 7 está implementada en local: `/app/simulator` permite gestionar casos (superadmin/group_admin), ejecutarlos por lotes (también supervisor) y ver métricas sin escribir en `agent_queries`.
- El agente distingue `out_of_scope` (sin fuentes publicadas relevantes) de `insufficient_evidence` (hay fuentes, pero el modelo se abstiene o no cita).
- Las fechas se guardan en UTC; UI y CSV muestran `America/Bogota`, y los filtros por día usan el calendario colombiano.
- Cloudflare autenticado; el Worker `kpo-ingest` está desplegado en `https://kpo-ingest.nicode.workers.dev` y responde `/health`.
- `INGEST_WORKER_URL` está configurado en `.env.local`; en producción debe apuntar al Worker desplegado.
- La migración 5 está aplicada en remoto. Verificar en el Dashboard que `create_invitation` use códigos de 6 caracteres y vigencia de 365 días (migraciones 3 y 4).
- The current project uses **Confirm email** disabled to avoid the built-in SMTP 429 limit. If email verification is required for the final challenge, configure a custom SMTP provider and re-enable it; the trigger already leaves memberships pending until confirmation.
- No deployment yet; `APP_ORIGIN` must match the deployed URL.
- Fases 4 y 5 están implementadas y validadas en local: 15 documentos, 1185 fragmentos, todos `published` y `common`; el agente respondió con citas versionadas, se abstuvo sin evidencia y bloqueó extracción del prompt. Falta el despliegue del Worker.
- El Worker procesa en línea dentro del request de Next (`maxDuration = 60`) y el proxy de Next puede limitar cuerpos grandes (~4.5 MB en Vercel). Un PDF escaneado muy grande puede agotar el tiempo; si ocurre, mover el procesamiento a una cola o ejecutar la ingesta desde el script con el Worker desplegado.
- El OCR de PDF escaneados quedó validado con `Circular Externa 100-000015` usando Mistral Small 3.1; el agente citó el artículo 631-5. El OCR de DOCX con imágenes no está implementado.
- La cuenta `analyst` de prueba del grupo KPO validó el acceso de un usuario no superadministrador a documentos `common`.

## Security notes

- `.env.local` is not committed. Only env var names are documented.
- `SUPABASE_SERVICE_ROLE_KEY` is server-only; never expose it to the browser.
- Both document buckets are private. The UI only shows short-lived signed URLs to authorized admins; the RAG phase should use the service role for retrieval, not public URLs.
- Storing `invitations.code` is an explicit product decision to support history. The column is only returned by an authorized security-definer RPC; keep it out of client-side direct table queries.
- `audit_events` is append-only: no `update`/`delete` policies, only `service_role` grants, and `private.append_audit_event` recomputes `prev_hash` under an advisory lock. Never expose the chain or raw metadata to clients; the UI reads it through server components with the service role.
- Rotate/revoke an invitation if a code leaks.
