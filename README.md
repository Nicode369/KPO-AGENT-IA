# RAG-AGENT-IA

Aplicación web para consulta documental en auditoría, contabilidad y cumplimiento. Combina autenticación por invitación, aislamiento por grupos, gestión documental con OCR y versionado, y un agente RAG que responde únicamente con versiones publicadas, cita los fragmentos usados y se abstiene cuando no hay evidencia suficiente.

[![Next.js](https://img.shields.io/badge/Next.js-16.4.5-black?logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.3-149eca?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript)](https://www.typescriptlang.org/)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%2B%20pgvector-3ecf8e?logo=supabase)](https://supabase.com/)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers%20%2B%20Workers%20AI-f38020?logo=cloudflare)](https://workers.cloudflare.com/)
[![Tests](https://img.shields.io/badge/tests-90%20unitarios%20%2B%206%20E2E-2ea44f)](#pruebas)

- **Repositorio:** <https://github.com/Nicode369/KPO-AGENT-IA>
- **Arquitectura detallada:** [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- **Despliegue:** [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)
- **Memoria técnica:** [`docs/PROJECT_MEMORY.md`](docs/PROJECT_MEMORY.md)
- **Caso de estudio:** [`docs/CASE_STUDY.md`](docs/CASE_STUDY.md)

## Índice

- [Qué resuelve](#qué-resuelve)
- [Estado del proyecto](#estado-del-proyecto)
- [Capacidades](#capacidades)
- [Arquitectura](#arquitectura)
- [Tecnologías](#tecnologías)
- [Estructura del repositorio](#estructura-del-repositorio)
- [Puesta en marcha](#puesta-en-marcha)
- [Variables de entorno](#variables-de-entorno)
- [Migraciones](#migraciones)
- [Rutas de la aplicación](#rutas-de-la-aplicación)
- [API](#api)
- [Modelo de datos](#modelo-de-datos)
- [Roles y permisos](#roles-y-permisos)
- [Seguridad](#seguridad)
- [Pruebas](#pruebas)
- [Despliegue](#despliegue)
- [Limitaciones conocidas](#limitaciones-conocidas)
- [Fases pendientes](#fases-pendientes)

## Qué resuelve

El proyecto implementa el Reto 3 RAG Agent AI con una arquitectura desacoplada:

- **Next.js** sirve la interfaz, las rutas privadas, las server actions y las APIs internas.
- **Supabase** concentra Auth, PostgreSQL con `pgvector`, RLS y Storage privado.
- **Cloudflare Workers** ejecuta ingesta, OCR, embeddings y chat mediante Workers AI.
- **Vercel** es el destino previsto para la aplicación Next.js; el Worker se despliega por separado en Cloudflare.

El principio central es que el agente **no responde con conocimiento general**: recupera fragmentos autorizados de versiones publicadas, construye el contexto, valida citas y registra la consulta. Si no alcanza la evidencia, se abstiene.

## Estado del proyecto

| Fase | Alcance | Estado |
| --- | --- | --- |
| 1 | Inspección y planificación | ✅ Completada |
| 2 | Estructura base, diseño y navegación | ✅ Completada |
| 3 | Base de datos, Auth, invitaciones, roles y RLS | ✅ Completada |
| 4 | Gestión documental, OCR, publicación y versionado | ✅ Completada en local |
| 5 | Agente RAG, citas, abstención, seguridad e historial | ✅ Completada en local |
| 6 | Auditoría y trazabilidad ampliada | ✅ Completada en local: `audit_events` append-only con cadena SHA-256, eventos de auth/admin/ciclo documental, visor `/admin/audit/events`, verificador, reportes y exportación CSV protegida. Migraciones 9, 10 y 11 aplicadas y verificadas |
| 7 | Simulador de pruebas | ✅ Implementada: casos esperados, ejecución por lotes contra el agente real, métricas de acierto/citas/términos/latencia y aislamiento del historial. Migración 12 aplicada |
| 8 | Integración y despliegue | ✅ App en Vercel y Worker desplegados; pendientes smoke tests de Auth/redirects, backups y monitoreo |

El repositorio incluye una validación con **39 documentos y 4.671 fragmentos**: 15 en KPO, 1 en BPO y 23 en la demo de riesgo climático y datos abiertos, todos publicados como `restricted`. El corpus KPO no se versiona: vive fuera del repositorio, en `../base_drive/`, y se ignora mediante `.gitignore`; el PDF de BPO se obtiene con `npm run configure:groups` y el corpus demo con `npm run setup:demo -- --apply`.

## Capacidades

### Identidad, grupos e invitaciones

- Registro exclusivamente por invitación; no hay registro público sin código.
- Códigos de 6 caracteres en mayúsculas, con alfabeto sin caracteres ambiguos.
- Validación por hash SHA-256 y consumo atómico mediante trigger de Auth.
- Invitaciones con vigencia, límite de usos, revocación e historial.
- Roles `group_admin`, `supervisor` y `analyst`, más `superadmin`.
- Membresías activas, pendientes y deshabilitadas.
- Revocación de sesiones para superadministradores.
- Eliminación permanente de cuentas desde la tabla de miembros de `/admin/users`, exclusiva del superadmin; conserva la auditoría histórica.
- El superadmin elige un grupo activo; las consultas se registran y auditan en ese grupo sin exigir una membresía.
- RLS y RPCs `security definer` para administración; ocultar botones no sustituye los controles de servidor.

### Gestión documental

- Carga privada de PDF y DOCX.
- Validación de extensión, MIME, firma, tamaño y duplicados por SHA-256.
- Extracción de texto; OCR de PDFs escaneados con Mistral Small 3.1 Vision.
- Normalización de texto y persistencia del Markdown extraído.
- Fragmentación de ~1.400 caracteres con 200 de solapamiento.
- Embeddings multilingües de 1.024 dimensiones con BGE-M3.
- Almacenamiento de vectores en PostgreSQL con `pgvector` e índice HNSW.
- Flujo de revisión: `pending_review`, `approved`, `published`, `retired`, `error`.
- Publicación explícita y atómica de una versión.
- Versionado inmutable; los usuarios normales solo ven la versión publicada.
- Buckets privados `documents-original` y `documents-processed`.
- URLs firmadas de corta duración para administradores autorizados.
- Eventos del ciclo de vida en `document_events`.

### Agente RAG

- Recuperación semántica restringida por grupo y por versión publicada.
- Para el superadmin, la recuperación usa el grupo activo seleccionado en `/app` más los documentos `common`; la consulta queda asociada a ese `group_id`.
- Respuesta en español basada solo en el contexto recuperado.
- Citas obligatorias a fragmentos, documento, versión y página.
- Abstención explícita cuando la evidencia es insuficiente.
- Validación determinista de citas y del formato de respuesta.
- Clasificador de seguridad contra:
  - extracción del prompt del sistema;
  - solicitudes de secretos o credenciales;
  - acceso a información de otros grupos;
  - extracción masiva de documentos.
- Límite de 20 consultas por minuto por usuario.
- Historial personal en `/app/history` con resultado, modelo, latencia, grounding y fuentes.
- Auditoría en `agent_queries` y `agent_query_sources`, incluyendo hashes de pregunta y respuesta.
- Cadena global append-only `audit_events` con SHA-256: cada evento enlaza el hash anterior.
- Registro de login/logout, fallos de autenticación, cambios administrativos, ciclo documental, denegaciones de acceso, exportaciones y verificaciones de integridad.
- Verificador de cadena y visor filtrable en `/admin/audit/events` para superadmin y `group_admin`.

### Administración

- `/admin/groups`: crear y listar grupos.
- `/admin/invitations`: generar, copiar y revocar invitaciones.
- `/admin/users`: cambiar rol y estado, activar/desactivar cuentas y eliminar cuentas (solo superadmin).
- `/admin/documents`: cargar, procesar, revisar, aprobar, publicar, retirar y versionar.
- `/admin/documents/[id]`: detalle de versiones, fragmentos, accesos, eventos y errores.
- `/admin/audit`: historial global de consultas para superadmin y acotado a sus grupos para `group_admin`, con filtros por resultado, grupo, usuario, fechas y texto.
- `/admin/audit/events`: eventos auditados de la cadena SHA-256, filtros por tipo, grupo, actor y fecha, exportación CSV y verificación de integridad.
- `/admin/reports`: resumen 24 h de resultados del agente, alertas de seguridad, estado de la cadena, documentos por estado y exportaciones.
- `/admin/security`: intentos bloqueados y rechazados de los grupos administrados.
- Panel de resumen con miembros, invitaciones, documentos, consultas y alertas.
- Contador global de fragmentos indexados.

## Arquitectura

```mermaid
flowchart LR
  U["Usuario / Admin"] -->|HTTPS| N["Next.js 16<br/>App Router + Server Actions"]
  N -->|Cookies + JWT| A["Supabase Auth"]
  N -->|SQL / RLS| P[("PostgreSQL<br/>+ pgvector")]
  N -->|Storage API| B[("Buckets privados")]
  N -->|JWT + JSON / multipart| W["Cloudflare Worker<br/>kpo-ingest"]
  W -->|Workers AI| M["Embeddings · Chat · OCR"]
  W -->|Service role| P
  W -->|Objetos| B
  A -->|Identidad| P
  G["GitHub privado"] -->|CI/CD| V["Vercel"]
  V --> N
```

**Flujo de una consulta:** navegador → `/api/agent/query` → clasificador y rate limit → Worker `/embed` → BGE-M3 → `match_document_chunks` con RLS → Worker `/chat` → Gemma → validación de citas → `record_agent_query` → respuesta con fuentes.

**Flujo documental:** admin → `/api/admin/documents/upload` → Worker `/ingest` → validación y hash → Storage original → extracción/OCR → normalización → chunking → embeddings → `document_chunks` → revisión → `publish_document` → disponible para el agente.

Los diagramas de secuencia, el modelo entidad-relación completo y la topología de despliegue están en [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Tecnologías

| Capa | Tecnología | Uso |
| --- | --- | --- |
| Frontend | Next.js 16.4.5, React 19.3, App Router | Rutas, layouts, server components, server actions |
| Lenguaje | TypeScript 5 | Tipado estricto en app y Worker |
| Estilos | CSS propio + variables; Tailwind CSS 4 instalado | Diseño responsive, componentes y sistema visual |
| Auth | Supabase Auth + `@supabase/ssr` | Sesiones en cookies, login, registro por invitación |
| Base de datos | Supabase PostgreSQL + `pgvector` | Datos, RLS, búsqueda vectorial, RPCs |
| Storage | Supabase Storage | PDFs originales y Markdown procesado, buckets privados |
| Backend IA | Cloudflare Workers + TypeScript | Ingesta, OCR, embeddings, chat y endpoints internos |
| Modelos | BGE-M3, Gemma, Mistral Small 3.1 | Embeddings, generación y OCR |
| Procesamiento | `unpdf`, Workers AI `toMarkdown` | Extracción de PDF/DOCX |
| Tests | Vitest 3, Vitest 5 (Worker), Playwright 1.65 | Unitarias, Worker y E2E |
| Calidad | ESLint 9, `eslint-config-next`, `tsc --noEmit` | Lint y typecheck |
| Deploy | Vercel + Cloudflare + Supabase | Hosting previsto de app, Worker y datos |
| Git | GitHub privado | Versionado y despliegue continuo |

## Estructura del repositorio

```text
.
├── src/
│   ├── app/
│   │   ├── (auth)/                 # login, registro, recuperación, verificación
│   │   ├── (workspace)/app/        # dashboard, agente e historial
│   │   ├── (workspace)/admin/      # grupos, invitaciones, usuarios, documentos
│   │   ├── api/agent/query/        # endpoint RAG autenticado
│   │   ├── api/admin/documents/    # proxies multipart al Worker
│   │   ├── auth/                   # server actions y callback de Auth
│   │   └── globals.css             # sistema visual completo
│   ├── components/                 # shell, navegación, consola, iconos, formularios
│   ├── lib/
│   │   ├── admin/                  # consultas administrativas y documentos
│   │   ├── agent/                  # prompt, seguridad, tipos y validación
│   │   ├── auth/                   # guardas de sesión, rol y grupo
│   │   └── supabase/               # clientes browser/server, proxy y env
│   └── proxy.ts                    # renovación de sesión en Next.js 16
├── supabase/
│   ├── migrations/                 # fuente de verdad del esquema
│   └── config.toml
├── workers/kpo-ingest/             # Worker de ingesta, OCR y modelos
├── scripts/ingest-base-drive.mjs   # ingesta masiva local
├── scripts/configure-groups.mjs    # reconfiguración KPO/BPO, sin A/B
├── scripts/setup-demo.mjs          # grupos, cuentas demo KPO/clima y corpus climático
├── e2e/                            # Playwright
├── docs/                           # arquitectura, despliegue y memoria
└── public/                         # activos estáticos
```

## Puesta en marcha

### Requisitos

- Node.js 20.9 o superior; desarrollo validado con Node.js 22.22.0.
- npm 10 o superior.
- Proyecto de Supabase con Auth, PostgreSQL, `pgvector` y Storage.
- Cuenta de Cloudflare con Workers AI para el Worker.
- Opcional: Docker y Supabase CLI para desarrollo local de la base.

### 1. Instalar la aplicación

```bash
git clone https://github.com/Nicode369/KPO-AGENT-IA.git
cd KPO-AGENT-IA
npm install
cp .env.example .env.local
```

Completa `.env.local` con los valores reales. Nunca lo subas al repositorio.

### 2. Aplicar migraciones

Aplica los archivos de `supabase/migrations/` en orden. Puedes usar el Dashboard o la CLI:

```bash
supabase start
supabase db reset
supabase status
```

Para el proyecto remoto, vincula el proyecto y ejecuta `supabase db push`, o aplica el SQL manualmente en orden.

### 3. Instalar y ejecutar el Worker

```bash
cd workers/kpo-ingest
npm install
cp .dev.vars.example .dev.vars
# completa SUPABASE_URL, SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY
npx wrangler login
npm run typecheck
npm run dry-run
npm run dev
```

El Worker local queda en `http://localhost:8787`. Configura `INGEST_WORKER_URL=http://localhost:8787` en `.env.local`.

### 4. Crear la primera cuenta superadministradora

El primer usuario no se registra desde `/register` porque el registro exige invitación. Créalo desde el Admin API de Supabase con `app_metadata.bootstrap_superadmin = true`:

```bash
curl -X POST "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/admin/users" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "tu-correo@dominio.com",
    "password": "TU_CONTRASEÑA_SEGURA",
    "email_confirm": true,
    "app_metadata": { "bootstrap_superadmin": true }
  }'
```

La migración acepta esa marca una sola vez, cuando todavía no existe ningún superadministrador, y la elimina al crear el perfil. No la establezcas desde `user_metadata`.

### 5. Ejecutar la app

```bash
npm run dev
```

Abre <http://localhost:3000>. Sin Supabase configurado, los formularios muestran que la integración no está disponible.

### 6. Ingesta opcional del corpus local

```bash
# desde la raíz del repo
npm run ingest:base-drive -- --dry-run
npm run ingest:base-drive
```

El script usa `INGEST_EMAIL`, `INGEST_PASSWORD`, `INGEST_GROUP_ID`, `INGEST_GROUP_SLUG` y `BASE_DRIVE_DIR`. Requiere una cuenta `group_admin` del grupo destino. `base_drive/` está ignorado y no forma parte del repositorio.

Para reconfigurar los grupos de validación (KPO con 15 documentos restringidos, BPO con el paper IESE OP-08-02 y sin grupos A/B), ejecuta primero el dry-run y luego aplica:

```bash
npm run configure:groups
npm run configure:groups -- --apply
```

El script requiere `SUPABASE_SERVICE_ROLE_KEY` para borrar los grupos/cuentas de prueba y `INGEST_WORKER_URL` accesible para ingestar el PDF de BPO. La cuenta `INGEST_EMAIL` debe ser superadministradora.

Para crear o actualizar las demos de portafolio (`DEMO KPO` y `DEMO CLIMA`), ejecuta:

```bash
npm run setup:demo           # dry-run
npm run setup:demo -- --apply --replace
npm run setup:demo -- --apply --replace --rotate  # rota contraseñas

# Crear o verificar las cuentas demo sin reingestar documentos
npm run setup:demo -- --apply --skip-documents
```

El script asegura la cuenta `demo.kpo@example.com` en el grupo `kpo` y las cuentas de clima en `riesgo-climatico`. Las credenciales se guardan en `/tmp/opencode/demo-credentials-*.json` con permisos `600` y no deben confirmarse en Git. Para corpus grandes, el Worker gratuito puede superar su límite de CPU; en ese caso levanta `npm run dev` en `workers/kpo-ingest` y ejecuta `DEMO_WORKER_URL=http://localhost:8787 npm run setup:demo -- --apply --replace`.

### 7. Confirmación de correo

La configuración actual usa **Confirm email desactivado** para evitar el límite 429 del SMTP integrado de Supabase. Las cuentas creadas desde el panel de Auth ya están confirmadas. Si se requiere verificación real, configura un proveedor SMTP propio y reactiva la confirmación; el trigger ya deja la membresía pendiente hasta que el usuario confirme.

> Sin SMTP propio, la recuperación de contraseña por correo no es fiable. El login con contraseña sí funciona.

## Variables de entorno

### Aplicación Next.js

| Variable | Ámbito | Uso |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Público | URL del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Público | Clave publicable para el cliente |
| `APP_ORIGIN` | Servidor | Origen usado en redirects de Auth |
| `INGEST_WORKER_URL` | Servidor | URL del Worker de ingesta y modelos |
| `SUPABASE_SERVICE_ROLE_KEY` | Servidor | Panel de alertas de seguridad y scripts/bootstrap; nunca en el navegador |
| `DEMO_KPO_EMAIL` | Servidor | Correo de la cuenta demo KPO; por defecto `demo.kpo@example.com` |
| `DEMO_KPO_PASSWORD` | Servidor | Contraseña de la demo KPO; nunca en el navegador |
| `DEMO_KPO_GROUP_SLUG` | Servidor | Grupo de la demo KPO; por defecto `kpo` |
| `DEMO_CLIMA_EMAIL` | Servidor | Correo de la cuenta demo climática |
| `DEMO_CLIMA_PASSWORD` | Servidor | Contraseña de la demo climática; nunca en el navegador |
| `DEMO_CLIMA_GROUP_SLUG` | Servidor | Grupo de la demo climática; por defecto `riesgo-climatico` |
| `DEMO_ANALYST_EMAIL` | Servidor | Compatibilidad: fallback de la demo climática |
| `DEMO_ANALYST_PASSWORD` | Servidor | Compatibilidad: fallback de la demo climática |
| `DEMO_GROUP_SLUG` | Servidor | Compatibilidad: fallback del grupo climático |
| `DEMO_RATE_LIMIT_PER_MINUTE` | Servidor | Límite de consultas demo; por defecto `60` |
| `DEMO_WORKER_URL` | Servidor | Worker usado por `setup:demo`; permite apuntar al dev local |

### Worker de Cloudflare

| Variable | Tipo | Uso |
| --- | --- | --- |
| `SUPABASE_URL` | Secreto | URL del proyecto Supabase |
| `SUPABASE_ANON_KEY` | Secreto | Validación de JWT de usuarios |
| `SUPABASE_SERVICE_ROLE_KEY` | Secreto | Ingesta y escritura controlada en Postgres/Storage |
| `ALLOWED_ORIGINS` | Var | Orígenes permitidos para CORS |
| `AI_EMBEDDING_MODEL` | Var | Modelo de embeddings; por defecto BGE-M3 |
| `AI_CHAT_MODEL` | Var | Modelo de chat; por defecto Gemma |
| `AI_OCR_MODEL` | Var | Modelo de OCR; por defecto Mistral Small 3.1 |
| `OCR_MIN_TEXT_CHARS` | Var | Umbral para decidir OCR |
| `MAX_UPLOAD_BYTES` | Var | Tamaño máximo de carga |

### Script de ingesta masiva

| Variable | Uso |
| --- | --- |
| `INGEST_EMAIL` | Cuenta `group_admin` que ejecuta la ingesta |
| `INGEST_PASSWORD` | Contraseña de esa cuenta |
| `INGEST_GROUP_ID` | UUID del grupo destino |
| `INGEST_GROUP_SLUG` | Slug del grupo, por defecto `kpo` |
| `BASE_DRIVE_DIR` | Ruta local del corpus |

## Migraciones

| # | Archivo | Contenido |
| --- | --- | --- |
| 1 | `202611060001_initial_identity_and_access.sql` | Grupos, perfiles, membresías, invitaciones, trigger de Auth, RLS y RPCs |
| 2 | `202611070001_invitation_long_expiry.sql` | Vigencia de invitaciones a 365 días |
| 3 | `202611080001_short_invitation_codes.sql` | Códigos de 6 caracteres y compatibilidad heredada |
| 4 | `202611090001_invitation_code_history.sql` | Historial de códigos y RPC autorizada |
| 5 | `202611090002_revoke_user_sessions.sql` | `sessions_revoked_at` y revocación de sesiones |
| 6 | `202611100001_documents_and_ingestion.sql` | Documentos, versiones, chunks, pgvector, eventos, buckets y RPCs |
| 7 | `202611110001_document_version_publication.sql` | `published_version_id`, RLS por versión y publicación/retiro |
| 8 | `202611110002_agent_retrieval.sql` | `match_document_chunks`, `agent_queries` y `agent_query_sources` |
| 9 | `202611120001_audit_events_chain.sql` | `audit_events` append-only, cadena SHA-256, `append_audit_event`, `verify_audit_chain` y disparadores |
| 10 | `202611120002_audit_events_immutable_refs.sql` | Elimina las FKs mutables de `audit_events` y repara eventos afectados por borrados |
| 11 | `202611120003_agent_out_of_scope.sql` | Añade el resultado `out_of_scope` y migra consultas sin fuentes relevantes |
| 12 | `202611120004_simulator.sql` | Casos, ejecuciones y resultados del simulador con RLS por grupo |

Las migraciones 1–12 están aplicadas en el proyecto remoto usado durante el desarrollo. La migración 9 se verificó con `select * from public.verify_audit_chain(null);`, la 10 dejó la cadena íntegra, la 11 habilitó `out_of_scope` y la 12 creó las tablas del simulador. Verifica siempre el estado en el Dashboard antes de un despliegue nuevo.

## Rutas de la aplicación

| Ruta | Acceso | Descripción |
| --- | --- | --- |
| `/` | Público | Landing con acceso a las demos KPO y clima |
| `/caso-de-estudio` | Público | Caso de estudio de riesgo climático y datos abiertos |
| `/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email` | Público | Flujos de autenticación |
| `/app` | Usuario activo | Dashboard, consola del agente y selector de grupo activo para superadmin |
| `/app/history` | Usuario activo | Historial personal de consultas |
| `/app/simulator` | Superadmin / `group_admin` / `supervisor` | Casos, ejecución y métricas del simulador |
| `/admin` | Superadmin / `group_admin` | Resumen administrativo |
| `/admin/groups` | Superadmin | Crear y listar grupos |
| `/admin/invitations` | Superadmin / `group_admin` | Generar, copiar y revocar invitaciones |
| `/admin/users` | Superadmin / `group_admin` | Roles, estados, activación y eliminación de cuentas (solo superadmin) |
| `/admin/documents` | Superadmin / `group_admin` | Biblioteca y carga documental |
| `/admin/documents/[id]` | Superadmin / `group_admin` | Detalle, versiones, fragmentos y eventos |
| `/admin/audit` | Superadmin / `group_admin` | Historial global o acotado a sus grupos |
| `/admin/audit/events` | Superadmin / `group_admin` | Eventos append-only, verificación y exportación |
| `/admin/reports` | Superadmin / `group_admin` | Reportes operativos y de auditoría |
| `/admin/security` | Superadmin / `group_admin` | Intentos bloqueados y rechazados |
| `/api/admin/audit/export` | Admin | Descarga CSV de consultas o eventos |
| `/api/agent/query` | Usuario activo | Consulta RAG |
| `/api/simulator/run` | Superadmin / `group_admin` / `supervisor` | Inicio, ejecución por caso y cierre de lotes |
| `/api/admin/documents/upload` | Superadmin / `group_admin` | Proxy multipart al Worker |
| `/api/admin/documents/[id]/versions` | Superadmin / `group_admin` | Nueva versión |
| `/auth/callback` | Público | Intercambio de código de Auth |

## API

### Cloudflare Worker

| Método | Endpoint | Auth | Función |
| --- | --- | --- | --- |
| `GET` | `/health` | Pública | Estado del servicio y bindings |
| `POST` | `/embed-test` | JWT | Prueba de embeddings BGE-M3 |
| `POST` | `/embed` | JWT | Embedding de la pregunta |
| `POST` | `/chat` | JWT | Generación con el modelo configurado |
| `POST` | `/ingest` | Superadmin / `group_admin` | Validación, almacenamiento y procesamiento |
| `POST` | `/documents/:id/process` | Superadmin / `group_admin` | Reprocesar versión actual |
| `POST` | `/documents/:id/versions` | Superadmin / `group_admin` | Crear y procesar nueva versión |

### Next.js

| Método | Endpoint | Auth | Función |
| --- | --- | --- | --- |
| `POST` | `/api/agent/query` | Sesión activa | Clasificación, rate limit, RAG, citas y auditoría |
| `POST` | `/api/simulator/run` | Simulador | `start`, `case` y `finish` de un lote contra `runAgentQuery` |
| `POST` | `/api/admin/documents/upload` | Admin | Reenvía multipart al Worker |
| `POST` | `/api/admin/documents/[id]/versions` | Admin | Reenvía nueva versión al Worker |
| `GET` | `/api/admin/audit/export` | Admin | CSV de consultas o eventos; registra `audit_export` |

## Modelo de datos

```mermaid
erDiagram
  AUTH_USERS ||--|| PROFILES : tiene
  PROFILES ||--o{ GROUP_MEMBERSHIPS : pertenece
  GROUPS ||--o{ GROUP_MEMBERSHIPS : incluye
  GROUPS ||--o{ INVITATIONS : emite
  INVITATIONS ||--o{ INVITATION_REDEMPTIONS : registra
  GROUPS ||--o{ DOCUMENTS : posee
  DOCUMENTS ||--o{ DOCUMENT_VERSIONS : versiona
  DOCUMENT_VERSIONS ||--o{ DOCUMENT_CHUNKS : fragmenta
  DOCUMENTS ||--o{ DOCUMENT_ACCESS : comparte
  DOCUMENTS ||--o{ DOCUMENT_EVENTS : audita
  PROFILES ||--o{ AGENT_QUERIES : consulta
  AGENT_QUERIES ||--o{ AGENT_QUERY_SOURCES : cita
  DOCUMENT_CHUNKS ||--o{ AGENT_QUERY_SOURCES : referenciado
```

- `documents` guarda la versión vigente y `published_version_id`.
- `document_versions` conserva original, extracción, `chunk_count`, estado y error.
- `document_chunks` contiene `vector(1024)`, metadatos de página/sección/artículo/numeral e índice HNSW coseno.
- `document_access` autoriza grupos adicionales para documentos restringidos.
- `agent_queries` / `agent_query_sources` guardan la auditoría de cada consulta y sus fuentes.

## Roles y permisos

| Capacidad | Superadmin | `group_admin` | `supervisor` | `analyst` |
| --- | --- | --- | --- | --- |
| Consultar documentos publicados de su grupo | ✅ Global | ✅ Su grupo | ✅ Su grupo | ✅ Su grupo |
| Historial personal | ✅ | ✅ | ✅ | ✅ |
| Crear grupos | ✅ | ❌ | ❌ | ❌ |
| Gestionar invitaciones | ✅ Global | ✅ Su grupo | ❌ | ❌ |
| Gestionar miembros y roles | ✅ Global | ✅ Su grupo, sin asignar `group_admin` | ❌ | ❌ |
| Gestionar documentos | ✅ Global | ✅ Su grupo | ❌ | ❌ |
| Publicar/retirar versiones | ✅ Global | ✅ Su grupo | ❌ | ❌ |
| Revocar sesiones (RPC) | ✅ | ❌ | ❌ | ❌ |
| Historial de consultas administrativo | ✅ Global | ✅ Su grupo | ❌ | ❌ |
| Eventos auditados, reportes y exportación CSV | ✅ Global | ✅ Su grupo | ❌ | ❌ |
| Verificar cadena de auditoría | ✅ | ✅ | ❌ | ❌ |
| Simulador | ✅ Gestionar y ejecutar | ✅ Su grupo | ✅ Ejecutar | ❌ |

`supervisor` puede ejecutar casos y consultar resultados de sus grupos; `group_admin` y `superadmin` además crean, editan y eliminan casos. `analyst` no accede al simulador.

## Seguridad

- **Autenticación:** Supabase Auth con sesiones en cookies y renovación en `src/proxy.ts`.
- **Autorización en servidor:** `requireWorkspaceUser` y `requireAdminUser` validan perfil activo, membresía, rol y revocación de sesión.
- **RLS:** todas las lecturas sensibles se limitan en PostgreSQL; los usuarios normales solo ven la versión publicada de documentos autorizados.
- **RPCs `security definer`:** invitaciones, membresías, publicación y auditoría se ejecutan mediante funciones con permisos controlados.
- **Aislamiento por grupo:** documentos, chunks, Storage y consultas se filtran por grupo. El superadmin opera con un grupo activo persistido en cookie `httpOnly`, validado en servidor.
- **Storage privado:** buckets sin acceso público; el frontend solo recibe URLs firmadas de corta duración.
- **Secretos:** `SUPABASE_SERVICE_ROLE_KEY` y tokens de Cloudflare viven solo en servidor/Worker. `.env.local`, `.dev.vars` y archivos de claves están ignorados.
- **Agente:** clasificador determinista, citas obligatorias, abstención, rate limit de 20 consultas/minuto y bloqueo de extracción masiva. Distingue `out_of_scope` (sin fuentes publicadas relevantes) de `insufficient_evidence` (hay fuentes, pero no alcanzan o no se citan).
- **Fechas:** la base guarda UTC; la UI y los CSV muestran `America/Bogota`, y los filtros por día interpretan el día colombiano.
- **Auditoría:** hashes SHA-256 de pregunta/respuesta, fuentes recuperadas, modelo, latencia y grounding en `agent_queries`; cadena global append-only `audit_events` con verificación de integridad y exportaciones registradas.
- **Exportaciones:** CSV solo para administradores, acotado a sus grupos y con `content-disposition` de descarga; cada exportación se audita.
- **Git:** repositorio privado; el historial fue escaneado para descartar claves, JWT, correos y URLs reales.

## Pruebas

| Suite | Comando | Cobertura |
| --- | --- | --- |
| Web unitarias | `npm test` | 74 tests: prompt, seguridad, outcomes, auditoría, eventos, CSV, fechas, demos y conteo de fragmentos |
| Worker | `cd workers/kpo-ingest && npm test` | 16 tests: OCR, archivos, chunking y documentos |
| E2E | `npm run test:e2e` | 6 tests: autenticación, rutas privadas y auto-login de ambas demos |
| Lint | `npm run lint` | ESLint + reglas de Next |
| Build | `npm run build` | Next.js producción con webpack |
| Typecheck Worker | `npm run typecheck` | TypeScript estricto |

Para E2E:

```bash
npx playwright install chromium
npm run dev
npm run test:e2e
```

Las pruebas E2E cargan `.env.local`, verifican `/login`, `/app`, `/app/history`, `/caso-de-estudio`, el auto-login de ambas demos con `DEMO_KPO_*` y `DEMO_CLIMA_*` (o `DEMO_ANALYST_*` como fallback), `/admin`, `/admin/invitations`, `/admin/documents`, `/admin/users`, `/admin/groups`, `/admin/audit`, `/admin/audit/events`, `/admin/reports`, la descarga CSV y `/admin/security`, y fallan si aparece un overlay de ruta bloqueada o un valor inestable de Next.js. Los nuevos checks requieren `SUPABASE_SERVICE_ROLE_KEY` y las migraciones 9 y 10 aplicadas.

## Despliegue

Arquitectura objetivo:

- **Vercel** para Next.js.
- **Cloudflare Worker** para ingesta y modelos.
- **Supabase** para Auth, Postgres, pgvector y Storage.

La app está desplegada en `https://kpo-agent-ai.vercel.app` y el Worker en `https://kpo-ingest.nicode.workers.dev`. La guía completa, variables, secretos, redirect URLs, smoke tests y rollback están en [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

Resumen:

1. Aplicar/verificar migraciones y buckets privados.
2. Configurar secretos del Worker y desplegarlo.
3. Importar el repo privado en Vercel.
4. Configurar `NEXT_PUBLIC_SUPABASE_*`, `INGEST_WORKER_URL` y `APP_ORIGIN`.
5. Configurar Site URL y Redirect URLs en Supabase Auth.
6. Ejecutar smoke tests con superadmin y `analyst`.
7. Verificar que los buckets sigan privados y que los logs no expongan datos.

## Limitaciones conocidas

- **Sin backfill de auditoría:** la migración 9 no reconstruye eventos anteriores; la cadena empieza a registrar desde su aplicación.
- **Despliegue sin cierre operativo:** la app está en Vercel, pero faltan smoke tests completos, backups y monitoreo; `.env.local` sigue apuntando a local.
- **OCR síncrono:** el procesamiento ocurre dentro del request; `maxDuration = 60` puede ser insuficiente para PDFs muy grandes.
- **Límite de Vercel:** el proxy multipart puede limitar cuerpos grandes (~4.5 MB). El corpus actual está por debajo; para documentos mayores conviene cola o carga directa.
- **Sin SMTP propio:** confirmación de correo desactivada; recuperación de contraseña por correo no fiable.
- **Rate limit no probado bajo carga real.**
- **OCR de imágenes embebidas en DOCX no implementado.**
- **Supervisor sin panel de seguimiento dedicado:** puede ejecutar el simulador y consultar sus resultados, pero no gestiona casos ni miembros.
- **Datos de validación:** los 39 documentos y 4.671 fragmentos no forman parte del repo; KPO vive en `../base_drive/`, BPO se descarga desde el IESE y la demo usa 23 PDFs públicos de entidades colombianas.
- **Integración de proveedor de IA:** la capa está separada en el Worker, pero cambiar de proveedor requiere adaptar `workers/kpo-ingest/src`.

## Fases pendientes

1. **Fase 6 — Auditoría y trazabilidad:** completada (cadena SHA-256, eventos de auth/admin/ciclo documental, visor, verificador, reportes y CSV); migraciones 9, 10 y 11 aplicadas y cadena verificada.
2. **Fase 7 — Simulador:** implementada con tablas `simulator_cases`, `simulator_runs`, `simulator_results`, reutilización de `runAgentQuery`, UI `/app/simulator`, métricas de acierto/abstención/citas/términos/latencia y ejecución por lotes. Migración 12 aplicada; el simulador usa documentos publicados propios y comunes del grupo.
3. **Fase 8 — Cierre:** app y Worker desplegados; completar smoke tests de Auth/redirects, backups, monitoreo y documentación final.
4. **Mejoras operativas:** mover OCR a cola, probar rate limit con carga, añadir SMTP si se requiere verificación real y ampliar E2E a flujos de grupo.

## Documentación

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): componentes, flujos, ERD, roles, API y decisiones.
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md): despliegue Vercel + Cloudflare + Supabase.
- [`docs/PROJECT_MEMORY.md`](docs/PROJECT_MEMORY.md): memoria técnica y estado detallado.
- [`docs/CASE_STUDY.md`](docs/CASE_STUDY.md): corpus, recorrido y límites de la demo pública.
- [`AGENTS.md`](AGENTS.md): comandos y reglas operativas para agentes de desarrollo.
- [`supabase/migrations/`](supabase/migrations/): fuente de verdad del esquema.
