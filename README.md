# Reto 3 KPO Agent AI

Aplicación web para consulta documental en auditoría, contabilidad y cumplimiento. Esta fase incorpora el esquema inicial de identidad y grupos, el registro por invitación, la autenticación por correo con sesiones seguras en cookies y una administración mínima de grupos, invitaciones y membresías. El procesamiento documental y el agente RAG pertenecen a fases posteriores.

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

Si usas la CLI y Docker:

```bash
supabase start
supabase db reset
supabase status
```

`db reset` aplica las migraciones en la base local. Para el proyecto remoto, aplica el SQL desde el Dashboard o con `supabase db push` después de vincular el proyecto.

La migración inicial crea grupos, perfiles, membresías, invitaciones y sus usos; los códigos se validan con SHA-256 y se reclaman de forma atómica al insertar el usuario. RLS y permisos de tabla limitan las lecturas y prohíben que los usuarios editen sus roles directamente. La segunda migración amplía la expiración de invitaciones de 90 a 365 días y mantiene la revocación manual. La tercera migración reduce los códigos a 6 caracteres alfanuméricos en mayúsculas, conserva la expiración de 365 días y sigue aceptando los códigos heredados de 48 caracteres hexadecimales. La cuarta migración conserva el código de cada invitación para mostrarlo en el historial; solo lo devuelve la función autorizada a superadministradores y administradores del grupo. La quinta agrega `profiles.sessions_revoked_at` y la función `revoke_user_sessions`, que invalida las sesiones de Auth y expulsa los tokens emitidos antes de la revocación.

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

El código de 6 caracteres en mayúsculas aparece en el historial y puede copiarse de nuevo. La validación sigue usando su hash; el código solo lo devuelve la función autorizada a superadministradores y administradores del grupo. Un administrador de grupo solo ve su grupo y no puede asignar el rol `group_admin`.

## Comprobaciones locales

```bash
npm run lint
npm run build
```

## Estructura

```text
src/
  app/          Rutas App Router, layout raíz y estilos globales
  components/   Componentes de interfaz reutilizables
  lib/supabase/ Clientes de navegador/servidor y actualización de sesión
  lib/auth/     Guardas de sesión, perfil y permisos de administración
  lib/admin/    Consultas de grupos, invitaciones y membresías
  proxy.ts      Renovación de sesión en Next.js 16
supabase/
  migrations/   Esquema de identidad, invitaciones, roles, RLS y expiración
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
- La interfaz no consulta documentos ni representa una biblioteca publicada.

## Fases pendientes

1. Carga privada, extracción, revisión, aprobación y versionado documental.
2. Recuperación RAG, citas verificables y reglas de rechazo.
3. Auditoría y trazabilidad.
4. Simulador, integración y despliegue autorizado.
