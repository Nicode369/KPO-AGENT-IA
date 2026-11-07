"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  type AdminActionState,
  createGroupAction,
  createInvitationAction,
  revokeInvitationAction,
  revokeUserSessionsAction,
  setProfileActiveAction,
  updateMembershipAction,
} from "./actions";

const initialState: AdminActionState = { status: "idle" };

type GroupOption = { id: string; name: string };
type Role = "group_admin" | "supervisor" | "analyst";
type MembershipStatus = "pending" | "active" | "disabled";

function SubmitButton({ children, pendingLabel }: { children: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending}>{pending ? pendingLabel : children}</button>;
}

function ActionMessage({ state }: { state: AdminActionState }) {
  if (state.status === "idle" || !state.message) return null;
  return (
    <p className={state.status === "error" ? "admin-message admin-message-error" : "admin-message admin-message-success"} role="status">
      {state.message}
    </p>
  );
}

export function CopyCodeButton({ code }: { code: string }) {
  return (
    <button
      className="admin-copy"
      type="button"
      onClick={() => { void navigator.clipboard?.writeText(code); }}
    >
      Copiar código
    </button>
  );
}

export function CreateGroupForm() {
  const [state, formAction] = useActionState(createGroupAction, initialState);

  return (
    <form className="admin-form" action={formAction}>
      <ActionMessage state={state} />
      <div className="admin-form-grid">
        <div className="admin-field">
          <label htmlFor="group-name">Nombre</label>
          <input id="group-name" name="name" required minLength={2} maxLength={120} placeholder="Grupo A" />
        </div>
        <div className="admin-field">
          <label htmlFor="group-slug">Identificador</label>
          <input id="group-slug" name="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxLength={80} placeholder="grupo-a" spellCheck={false} />
        </div>
      </div>
      <SubmitButton pendingLabel="Creando...">Crear grupo</SubmitButton>
    </form>
  );
}

export function CreateInvitationForm({
  groups,
  defaultExpiry,
  canAssignGroupAdmin,
}: {
  groups: GroupOption[];
  defaultExpiry: string;
  canAssignGroupAdmin: boolean;
}) {
  const [state, formAction] = useActionState(createInvitationAction, initialState);

  return (
    <form className="admin-form" action={formAction}>
      <ActionMessage state={state} />
      {state.invitationCode ? (
        <div className="admin-code" role="status">
          <span>{state.invitationCode.length === 6 ? "Código de 6 caracteres en mayúsculas" : "Código de 48 caracteres en mayúsculas"} (solo se muestra ahora)</span>
          <code>{state.invitationCode}</code>
          {state.invitationExpiresAt ? (
            <small>Vence el {new Date(state.invitationExpiresAt).toLocaleDateString("es-CO")}</small>
          ) : null}
          <CopyCodeButton code={state.invitationCode} />
        </div>
      ) : null}
      <div className="admin-form-grid">
        <div className="admin-field">
          <label htmlFor="invitation-group">Grupo</label>
          <select id="invitation-group" name="group_id" required defaultValue={groups[0]?.id ?? ""}>
            {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
          </select>
        </div>
        <div className="admin-field">
          <label htmlFor="invitation-role">Rol</label>
          <select id="invitation-role" name="role" defaultValue="analyst">
            <option value="analyst">Analista</option>
            <option value="supervisor">Supervisor</option>
            {canAssignGroupAdmin ? <option value="group_admin">Administrador de grupo</option> : null}
          </select>
        </div>
        <div className="admin-field">
          <label htmlFor="invitation-uses">Usos máximos</label>
          <input id="invitation-uses" name="max_uses" type="number" min={1} max={500} defaultValue={100} required />
        </div>
        <div className="admin-field">
          <label htmlFor="invitation-expiry">Expira</label>
          <input id="invitation-expiry" name="expires_at" type="date" defaultValue={defaultExpiry} required />
        </div>
      </div>
      <SubmitButton pendingLabel="Generando...">Generar invitación</SubmitButton>
    </form>
  );
}

export function RevokeInvitationForm({ invitationId }: { invitationId: string }) {
  const [state, formAction] = useActionState(revokeInvitationAction, initialState);

  return (
    <form className="admin-inline-form" action={formAction}>
      <input type="hidden" name="invitation_id" value={invitationId} />
      <ActionMessage state={state} />
      <SubmitButton pendingLabel="Revocando...">Revocar</SubmitButton>
    </form>
  );
}

export function MembershipForm({
  membershipId,
  role,
  status,
  canAssignGroupAdmin,
}: {
  membershipId: string;
  role: Role;
  status: MembershipStatus;
  canAssignGroupAdmin: boolean;
}) {
  const [state, formAction] = useActionState(updateMembershipAction, initialState);

  return (
    <form className="admin-inline-form admin-membership-form" action={formAction}>
      <input type="hidden" name="membership_id" value={membershipId} />
      <select name="role" defaultValue={role} aria-label="Rol">
        <option value="analyst">Analista</option>
        <option value="supervisor">Supervisor</option>
        {canAssignGroupAdmin ? <option value="group_admin">Administrador de grupo</option> : null}
      </select>
      <select name="status" defaultValue={status} aria-label="Estado">
        <option value="pending">Pendiente</option>
        <option value="active">Activo</option>
        <option value="disabled">Deshabilitado</option>
      </select>
      <SubmitButton pendingLabel="Guardando...">Guardar</SubmitButton>
      <ActionMessage state={state} />
    </form>
  );
}

export function ProfileActiveForm({ userId, isActive }: { userId: string; isActive: boolean }) {
  const [state, formAction] = useActionState(setProfileActiveAction, initialState);

  return (
    <form className="admin-inline-form" action={formAction}>
      <input type="hidden" name="user_id" value={userId} />
      <input type="hidden" name="is_active" value={isActive ? "false" : "true"} />
      <SubmitButton pendingLabel="Guardando...">{isActive ? "Desactivar" : "Reactivar"}</SubmitButton>
      <ActionMessage state={state} />
    </form>
  );
}

export function RevokeSessionsForm({ userId }: { userId: string }) {
  const [state, formAction] = useActionState(revokeUserSessionsAction, initialState);

  return (
    <form className="admin-inline-form" action={formAction}>
      <input type="hidden" name="user_id" value={userId} />
      <SubmitButton pendingLabel="Revocando...">Revocar sesiones</SubmitButton>
      <ActionMessage state={state} />
    </form>
  );
}
