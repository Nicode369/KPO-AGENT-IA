# Reto 3 KPO Agent AI

Aplicación web para consulta documental en auditoría, contabilidad y cumplimiento. Incluye identidad y grupos, registro por invitación, autenticación con sesiones en cookies, administración de accesos, gestión documental (carga privada, OCR, extracción, fragmentación, embeddings, revisión, publicación y versionado) y un agente RAG que responde solo con versiones publicadas, cita fragmentos y se abstiene cuando la evidencia no alcanza.

## Contexto para agentes y mantenimiento

- `AGENTS.md`: comandos, rutas clave y reglas operativas.
- `docs/PROJECT_MEMORY.md`: arquitectura, modelo de datos, flujo de invitaciones, migraciones y estado actual.

## Requisitos locales

- Node.js 20.9 o posterior (desarrollo local: Node.js 22.22.0).
- npm 10 o posterior.

## Inicio local

```bash
npm install
npm run dev
```

Desde la carpeta `web/`, abre <http://localhost:3000>. Sin Supabase configurado, los formularios muestran que la integración no está disponible.

## Supabase

El proyecto actual usa un proyecto remoto de Supabase. Las migraciones están en `supabase/migrations/` y deben aplicarse en orden:

1. `202611060001_initial_identity_and_access.sql`
2. `202611070001_invitation_long_expiry.sql`
3. `202611080001_short_invitation_codes.sql`
4. `202611090001_invitation_code_history.sql`
5. `202611090002_revoke_user_sessions.sql`
6. `202611100001_documents_and_ingestion.sql`
7. `202611110001_document_version_publication.sql`
8. `202611110002_agent_retrieval.sql`

Si usas la CLI y Docker:

```bash
supabase start
supabase db reset
supabase status
```

`db reset` aplica las migraciones en la base local. Para el proyecto remoto, aplica el SQL desde el Dashboard o con `supabase db push` después de vincular el proyecto.

La migración inicial crea grupos, perfiles, membresías, invitaciones y sus usos; los códigos se validan con SHA-256 y se reclaman de forma atómica al insertar el usuario. RLS y permisos de tabla limitan las lecturas y prohíben que los usuarios editen sus roles directamente. La segunda migración amplía la expiración de invitaciones de 90 a 365 días y mantiene la revocación manual. La tercera migración reduce los códigos a 6 caracteres alfanuméricos en mayúsculas, conserva la expiración de 365 días y sigue aceptando los códigos heredados de 48 caracteres hexadecimales. La cuarta migración conserva el código de cada invitación para mostrarlo en el historial; solo lo devuelve la función autorizada a superadministradores y administradores del grupo. La quinta agrega `profiles.sessions_revoked_at` y la función `revoke_user_sessions`, que invalida las sesiones de Auth y expulsa los tokens emitidos antes de la revocación. La sexta crea documentos, versiones, fragmentos con pgvector, accesos, eventos, RPCs de revisión y los buckets privados `documents-original` y `documents-processed`. La séptima agrega `documents.published_version_id` y limita la lectura de versiones/fragmentos a la versión publicada para usuarios normales. La octava crea la recuperación autorizada (`match_document_chunks`), la auditoría de consultas (`agent_queries`, `agent_query_sources`) y `record_agent_query`.

> Si aplicaste la migración inicial pegando el SQL en el Dashboard, registra su versión en `supabase_migrations.schema_migrations` antes de usar `supabase db push`; de lo contrario, la CLI intentará reaplicarla.

### Primera cuenta superadministradora

El primer usuario no se registra desde `/register`: el registro exige una invitación. Debe crearse desde una operación confiable de Auth con `app_metadata.bootstrap_superadmin = true`. La migración acepta esa marca una sola vez, cuando aún no existe ningún superadministrador, y la elimina al crear el perfil. Nunca la establezcas desde `user_metadata` ni la expongas desde el navegador.

Opción recomendada, Admin API desde una terminal (nunca desde el navegador):

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

Opción SQL para un entorno local o controlado. Crea el usuario directamente en `auth.users` y en `auth.identities`; úsala una sola vez. La estructura interna de Auth puede cambiar entre versiones de Supabase, así que el Admin API sigue siendo la vía recomendada.

```sql
do $$
declare
  v_user_id uuid := gen_random_uuid();
  v_email text := 'tu-correo@dominio.com';
  v_password text := 'TU_CONTRASEÑA_SEGURA';
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000',
    v_user_id,
    'authenticated',
    'authenticated',
    v_email,
    extensions.crypt(v_password, extensions.gen_salt('bf')),
    now(),
    jsonb_build_object(
      'provider', 'email',
      'providers', jsonb_build_array('email'),
      'bootstrap_superadmin', true
    ),
    jsonb_build_object('full_name', 'Superadministrador'),
    now(), now(), '', '', '', ''
  );

  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(),
    v_user_id,
    jsonb_build_object(
      'sub', v_user_id::text,
      'email', v_email,
      'email_verified', true
    ),
    'email',
    v_user_id::text,
    now(), now(), now()
  );
end $$;
```

El SQL anterior crea la cuenta ya confirmada, por lo que no requiere abrir un enlace de correo.

#### Confirmación de correo

La aplicación soporta ambos modos:

- Con **Confirm email** activo, el usuario debe abrir el enlace; la membresía queda pendiente hasta confirmar.
- Si prefieres que baste con escribir el correo, desactiva **Confirm email** en Authentication → Providers → Email. Supabase crea la sesión al registrarse y la membresía queda activa de inmediato.

La configuración usada en este proyecto desactiva **Confirm email** para evitar el límite 429 del SMTP integrado; las cuentas creadas desde el panel de Auth ya están confirmadas. El reto pide verificación de correo: para cumplirlo hay que configurar SMTP propio y reactivar la confirmación. El trigger ya deja la membresía pendiente cuando el usuario aún no ha confirmado.

### Administración

Tras iniciar sesión como superadministrador, entra a `/admin`:

- `/admin/groups`: crear y listar grupos.
- `/admin/invitations`: generar una invitación por grupo y revocarla.
- `/admin/users`: cambiar rol y estado de las membresías.
- `/admin/documents`: cargar PDF/DOCX, revisar el procesamiento, aprobar, publicar, retirar y versionar.
- `/app`: consultar la biblioteca con el agente RAG.
- `/app/history`: historial personal de consultas, resultados, fuentes y grounding.

El código de 6 caracteres en mayúsculas aparece en el historial y puede copiarse de nuevo. La validación sigue usando su hash; el código solo lo devuelve la función autorizada a superadministradores y administradores del grupo. Un administrador de grupo solo ve su grupo y no puede asignar el rol `group_admin`.

## Cloudflare Worker de ingesta

`workers/kpo-ingest/` contiene un Worker independiente para las fases 4 y 5. No reemplaza Next.js: la aplicación lo invoca como API interna y le reenvía el JWT del usuario.

- `GET /health` — estado del servicio y bindings.
- `POST /embed-test` — valida la sesión y genera embeddings con `@cf/baai/bge-m3` (1024 dimensiones).
- `POST /embed` — genera el embedding de la pregunta para el agente.
- `POST /chat` — ejecuta el modelo de chat configurado (`@cf/google/gemma-4-26b-a4b-it` por defecto).
- OCR de PDF escaneado — usa `@cf/mistralai/mistral-small-3.1-24b-instruct`, reduce a 1400 px de ancho, divide páginas muy altas en franjas y limita a 4 imágenes por página.
- `POST /ingest` — valida PDF/DOCX, calcula SHA-256, sube el original a `documents-original`, registra documento/versión y procesa.
- `POST /documents/:id/process` — reprocesa la versión actual.
- `POST /documents/:id/versions` — agrega una nueva versión y la procesa sin retirar la versión publicada vigente.

El procesamiento de DOCX usa `env.AI.toMarkdown`. Los PDF usan `unpdf` para extraer texto e imágenes; si una página tiene poco texto, la imagen se envía a `@cf/mistralai/mistral-small-3.1-24b-instruct`. El OCR reduce el ancho a 1400 px, conserva hasta 2400 px de alto, divide páginas más altas en franjas de 850 px con 80 px de solapamiento, elimina sellos administrativos y preámbulos conversacionales, y limita a 4 imágenes por página. También acepta PDFs con espacios en blanco antes de `%PDF-`. El texto se normaliza, se divide en bloques de ~1400 caracteres con 200 de solapamiento, se generan embeddings BGE-M3 y se guardan en `document_chunks`. El Markdown extraído queda en `documents-processed`.

```bash
cd workers/kpo-ingest
npm install
cp .dev.vars.example .dev.vars   # completa los valores locales; no se versiona
npx wrangler login
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_ANON_KEY
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npm run typecheck
npm run dry-run
npm run deploy
```

`POST /ingest` usa el Worker configurado en `INGEST_WORKER_URL`. Las migraciones documentales 6–8 y los buckets privados ya están aplicados. El Worker no está desplegado todavía: en local la app apunta a `http://localhost:8787`.

## Comprobaciones locales

```bash
npm run lint
npm run build
npm test
npm run test:e2e
```

Worker:

```bash
cd workers/kpo-ingest
npm run typecheck
npm test
npm run dry-run
```

## Estructura

```text
src/
  app/          Rutas App Router, layout raíz y estilos globales
  components/   Componentes de interfaz reutilizables
  lib/supabase/ Clientes de navegador/servidor y actualización de sesión
  lib/auth/     Guardas de sesión, perfil y permisos de administración
  lib/admin/    Consultas de grupos, invitaciones, membresías y documentos
  proxy.ts      Renovación de sesión en Next.js 16
supabase/
  migrations/   Identidad, invitaciones, roles, RLS y gestión documental
```

La renovación de sesión en `proxy.ts` no sustituye la autorización. Las rutas privadas validan las claims del JWT y el perfil/membresía activa; las lecturas se vuelven a limitar en PostgreSQL mediante RLS.

## Dependencias principales

- Next.js 16.4.5 y React 19.3.0.
- TypeScript 5.
- Tailwind CSS 4 con integración Turbopack.
- ESLint 9 y `eslint-config-next`.
- `@supabase/ssr` 0.12.7 y `@supabase/supabase-js` 2.119.0.

Supabase documenta `@supabase/ssr` para sesiones con cookies en Next.js, aunque actualmente lo marca como beta y advierte que la API puede cambiar. Se usó porque es el mecanismo de SSR recomendado; conviene revisar sus cambios antes de actualizarlo.

## Variables de entorno

`.env.example` documenta los nombres de variables previstos. Copia ese archivo a `.env.local` y completa URL y publishable key de un proyecto local o autorizado. No incluyas claves secretas en archivos versionados; `SUPABASE_SERVICE_ROLE_KEY` y `CLOUDFLARE_API_TOKEN` son exclusivamente de servidor y todavía no los usa la aplicación.

## Material documental

La carpeta `../base_drive/` contiene fuentes locales de referencia. No se copian ni publican desde la interfaz. Las fuentes deben validar su estado, permisos y procesamiento antes de ser usadas como evidencia del agente.

## Límites de esta fase

- La cuenta debe existir en Supabase Auth; las migraciones no crean grupos ni usuarios por sí solas.
- La administración visual cubre grupos, invitaciones y membresías. La revocación de sesiones está integrada para superadministradores: invalida refresh tokens y expulsa access tokens emitidos antes de la marca `sessions_revoked_at`. El usuario puede volver a iniciar sesión con su contraseña; para bloquearlo definitivamente hay que desactivar su perfil.
- El bloqueo de perfil impide entrar al área privada y hace que las funciones de autorización por grupo nieguen acceso.
- Las migraciones `202611080001_short_invitation_codes.sql`, `202611090001_invitation_code_history.sql` y `202611090002_revoke_user_sessions.sql` deben aplicarse en el proyecto remoto para generar códigos de 6 caracteres, mostrarlos en el historial y habilitar la revocación de sesiones. Mientras la base conserve la función anterior, la aplicación reintenta con una vigencia de 90 días y el historial muestra «No disponible» en las invitaciones antiguas.
- La aplicación no está desplegada todavía; el link local no es accesible para otros equipos.
- No hay SMTP propio configurado. Supabase impone un límite temporal de correos (error 429); para 50–150 confirmaciones hace falta un proveedor SMTP propio.
- La biblioteca documental y el flujo de revisión están operativos en local: migraciones 6–8 aplicadas, buckets privados creados, 15 documentos publicados como `common` y 1185 fragmentos indexados.
- El OCR de PDFs escaneados quedó validado con `Circular Externa 100-000015`; el texto extraído conserva el artículo 631-5 y la respuesta del agente lo cita. El OCR de imágenes dentro de DOCX no está implementado.
- El Worker procesa en línea dentro del request de Next (`maxDuration = 60`) y el proxy de Next puede limitar cuerpos grandes (~4.5 MB en Vercel). Para documentos muy grandes, mover el procesamiento a una cola o ejecutar la ingesta desde el script con el Worker desplegado.
- El Worker aún no está desplegado y `INGEST_WORKER_URL` apunta al Worker local. Las migraciones 6–8 ya están aplicadas en el proyecto remoto.

## Fases pendientes

1. Desplegar el Worker de ingesta y configurar sus secretos y `INGEST_WORKER_URL` en el entorno de producción.
2. Ampliar Playwright/E2E a flujos de miembro analista y administración de grupos.
3. Mover el OCR/procesamiento de PDFs grandes a una cola o flujo asíncrono.
4. Auditoría y trazabilidad ampliada (cadena de hashes, reportes, verificador).
5. Simulador de pruebas, integración y despliegue autorizado.
