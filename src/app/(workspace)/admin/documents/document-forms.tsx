"use client";

import { useActionState, useState, type FormEvent, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";

import type {
  AdminDocumentRecord,
  AdminDocumentVisibility,
} from "@/lib/admin/documents";
import {
  approveDocumentAction,
  initialDocumentActionState,
  publishDocumentAction,
  rejectDocumentAction,
  reprocessDocumentAction,
  retireDocumentAction,
  setDocumentAccessAction,
  updateDocumentMetadataAction,
  type DocumentActionState,
} from "./actions";

type GroupOption = { id: string; name: string };
type UploadState = { status: "idle" | "error" | "success"; message?: string };

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const DOCUMENT_TYPES = [
  ["ley", "Ley"],
  ["decreto", "Decreto"],
  ["resolucion", "Resolución"],
  ["circular", "Circular"],
  ["acuerdo", "Acuerdo"],
  ["concepto", "Concepto"],
  ["guia", "Guía"],
  ["manual", "Manual"],
  ["politica", "Política"],
  ["protocolo", "Protocolo"],
  ["otro", "Otro"],
] as const;

function SubmitButton({
  children,
  pendingLabel,
}: {
  children: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}>
      {pending ? pendingLabel : children}
    </button>
  );
}

function Message({ state }: { state: UploadState | DocumentActionState }) {
  if (state.status === "idle" || !state.message) return null;
  return (
    <p
      className={
        state.status === "error"
          ? "admin-message admin-message-error"
          : "admin-message admin-message-success"
      }
      role="status"
    >
      {state.message}
    </p>
  );
}

function validateFile(formData: FormData): string | null {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return "Selecciona un archivo PDF o DOCX.";
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return "El archivo supera el límite de 25 MB.";
  }
  return null;
}

export function UploadDocumentForm({ groups }: { groups: GroupOption[] }) {
  const router = useRouter();
  const [state, setState] = useState<UploadState>({ status: "idle" });
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const formData = new FormData(formElement);
    const validation = validateFile(formData);

    if (validation) {
      setState({ status: "error", message: validation });
      return;
    }

    setPending(true);
    setState({ status: "idle" });

    try {
      const response = await fetch("/api/admin/documents/upload", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json().catch(() => null)) as {
        document?: { id?: string; title?: string };
        processing?: { state?: string; message?: string; chunk_count?: number };
        error?: { message?: string };
      } | null;

      if (!response.ok) {
        setState({
          status: "error",
          message:
            payload?.error?.message ??
            "No se pudo cargar el documento. Revisa la configuración del Worker.",
        });
        return;
      }

      const documentId = payload?.document?.id;
      if (!documentId) {
        setState({ status: "error", message: "La carga no devolvió un documento." });
        return;
      }

      const processingError =
        payload?.processing?.state === "error"
          ? payload.processing.message
          : null;

      formElement.reset();
      router.push(`/admin/documents/${documentId}`);
      router.refresh();

      if (processingError) {
        setState({
          status: "error",
          message: `Documento cargado, pero el procesamiento falló: ${processingError}`,
        });
      }
    } catch {
      setState({
        status: "error",
        message: "No se pudo conectar con el servicio de carga.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="admin-form" onSubmit={onSubmit}>
      <Message state={state} />
      <div className="admin-form-grid">
        <div className="admin-field">
          <label htmlFor="doc-group">Grupo</label>
          <select id="doc-group" name="group_id" required defaultValue={groups[0]?.id ?? ""}>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
        </div>
        <div className="admin-field">
          <label htmlFor="doc-type">Tipo documental</label>
          <select id="doc-type" name="document_type" defaultValue="ley">
            {DOCUMENT_TYPES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="admin-field admin-field-wide">
          <label htmlFor="doc-title">Título</label>
          <input
            id="doc-title"
            name="title"
            maxLength={300}
            placeholder="Nombre oficial del documento"
          />
        </div>
        <div className="admin-field">
          <label htmlFor="doc-norm">Número de norma</label>
          <input id="doc-norm" name="norm_number" maxLength={80} placeholder="Ej. Ley 123 de 2026" />
        </div>
        <div className="admin-field">
          <label htmlFor="doc-version-label">Etiqueta de versión</label>
          <input id="doc-version-label" name="version_label" maxLength={80} placeholder="Ej. Versión original" />
        </div>
        <div className="admin-field">
          <label htmlFor="doc-from">Vigente desde</label>
          <input id="doc-from" name="effective_from" type="date" />
        </div>
        <div className="admin-field">
          <label htmlFor="doc-until">Vigente hasta</label>
          <input id="doc-until" name="effective_until" type="date" />
        </div>
        <div className="admin-field admin-field-wide">
          <label htmlFor="doc-file">Archivo</label>
          <input
            id="doc-file"
            name="file"
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            required
          />
          <small className="admin-field-help">PDF o DOCX, máximo 25 MB. Se extrae texto, se fragmenta y se generan embeddings.</small>
        </div>
      </div>
      <button type="submit" disabled={pending}>
        {pending ? "Cargando y procesando..." : "Cargar documento"}
      </button>
    </form>
  );
}

export function NewVersionForm({ documentId }: { documentId: string }) {
  const router = useRouter();
  const [state, setState] = useState<UploadState>({ status: "idle" });
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const formData = new FormData(formElement);
    const validation = validateFile(formData);

    if (validation) {
      setState({ status: "error", message: validation });
      return;
    }

    setPending(true);
    setState({ status: "idle" });

    try {
      const response = await fetch(
        `/api/admin/documents/${encodeURIComponent(documentId)}/versions`,
        { method: "POST", body: formData },
      );
      const payload = (await response.json().catch(() => null)) as {
        version?: { version?: number };
        processing?: { state?: string; message?: string };
        error?: { message?: string };
      } | null;

      if (!response.ok) {
        setState({
          status: "error",
          message: payload?.error?.message ?? "No se pudo cargar la nueva versión.",
        });
        return;
      }

      const processingError =
        payload?.processing?.state === "error"
          ? payload.processing.message
          : null;

      formElement.reset();
      router.refresh();
      setState(
        processingError
          ? {
              status: "error",
              message: `Versión creada, pero el procesamiento falló: ${processingError}`,
            }
          : {
              status: "success",
              message: `Versión ${payload?.version?.version ?? ""} creada y procesada.`,
            },
      );
    } catch {
      setState({
        status: "error",
        message: "No se pudo conectar con el servicio de carga.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="admin-form" onSubmit={onSubmit}>
      <Message state={state} />
      <div className="admin-form-grid">
        <div className="admin-field admin-field-wide">
          <label htmlFor="version-title">Título (opcional)</label>
          <input id="version-title" name="title" maxLength={300} placeholder="Conserva el título actual si lo dejas vacío" />
        </div>
        <div className="admin-field">
          <label htmlFor="version-norm">Número de norma (opcional)</label>
          <input id="version-norm" name="norm_number" maxLength={80} />
        </div>
        <div className="admin-field">
          <label htmlFor="version-label">Etiqueta de versión</label>
          <input id="version-label" name="version_label" maxLength={80} placeholder="Ej. Versión 2" />
        </div>
        <div className="admin-field">
          <label htmlFor="version-from">Vigente desde</label>
          <input id="version-from" name="effective_from" type="date" />
        </div>
        <div className="admin-field">
          <label htmlFor="version-until">Vigente hasta</label>
          <input id="version-until" name="effective_until" type="date" />
        </div>
        <div className="admin-field admin-field-wide">
          <label htmlFor="version-file">Nuevo archivo</label>
          <input
            id="version-file"
            name="file"
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            required
          />
          <small className="admin-field-help">El documento vuelve a revisión y reemplaza la versión actual al publicarse.</small>
        </div>
      </div>
      <button type="submit" disabled={pending}>
        {pending ? "Cargando y procesando..." : "Crear nueva versión"}
      </button>
    </form>
  );
}

function ActionForm({
  action,
  documentId,
  submitLabel,
  pendingLabel,
  children,
}: {
  action: (
    state: DocumentActionState,
    formData: FormData,
  ) => Promise<DocumentActionState>;
  documentId: string;
  submitLabel: string;
  pendingLabel: string;
  children?: ReactNode;
}) {
  const [state, formAction] = useActionState(
    action,
    initialDocumentActionState,
  );

  return (
    <form className="admin-action-form" action={formAction}>
      <input type="hidden" name="document_id" value={documentId} />
      {children}
      <SubmitButton pendingLabel={pendingLabel}>{submitLabel}</SubmitButton>
      <Message state={state} />
    </form>
  );
}

export function ApproveDocumentForm({
  documentId,
  notes,
}: {
  documentId: string;
  notes: string | null;
}) {
  return (
    <ActionForm
      action={approveDocumentAction}
      documentId={documentId}
      submitLabel="Aprobar"
      pendingLabel="Aprobando..."
    >
      <div className="admin-field">
        <label htmlFor="approve-notes">Notas de revisión (opcional)</label>
        <textarea id="approve-notes" name="notes" rows={3} defaultValue={notes ?? ""} />
      </div>
    </ActionForm>
  );
}

export function RejectDocumentForm({ documentId }: { documentId: string }) {
  return (
    <ActionForm
      action={rejectDocumentAction}
      documentId={documentId}
      submitLabel="Rechazar"
      pendingLabel="Rechazando..."
    >
      <div className="admin-field">
        <label htmlFor="reject-reason">Motivo del rechazo</label>
        <textarea id="reject-reason" name="reason" rows={3} required minLength={5} />
      </div>
    </ActionForm>
  );
}

export function RetireDocumentForm({ documentId }: { documentId: string }) {
  return (
    <ActionForm
      action={retireDocumentAction}
      documentId={documentId}
      submitLabel="Retirar"
      pendingLabel="Retirando..."
    >
      <div className="admin-field">
        <label htmlFor="retire-reason">Motivo del retiro</label>
        <textarea id="retire-reason" name="reason" rows={3} required minLength={5} />
      </div>
    </ActionForm>
  );
}

export function PublishDocumentForm({ documentId }: { documentId: string }) {
  return (
    <ActionForm
      action={publishDocumentAction}
      documentId={documentId}
      submitLabel="Publicar"
      pendingLabel="Publicando..."
    />
  );
}

export function ReprocessDocumentForm({ documentId }: { documentId: string }) {
  return (
    <ActionForm
      action={reprocessDocumentAction}
      documentId={documentId}
      submitLabel="Reprocesar"
      pendingLabel="Reprocesando..."
    />
  );
}

export function MetadataForm({ document }: { document: AdminDocumentRecord }) {
  return (
    <ActionForm
      action={updateDocumentMetadataAction}
      documentId={document.id}
      submitLabel="Guardar metadatos"
      pendingLabel="Guardando..."
    >
      <div className="admin-form-grid">
        <div className="admin-field admin-field-wide">
          <label htmlFor="metadata-title">Título</label>
          <input
            id="metadata-title"
            name="title"
            defaultValue={document.title}
            maxLength={300}
            required
          />
        </div>
        <div className="admin-field">
          <label htmlFor="metadata-type">Tipo documental</label>
          <input
            id="metadata-type"
            name="document_type"
            defaultValue={document.document_type}
            pattern="[a-z][a-z0-9_]{1,63}"
            required
          />
        </div>
        <div className="admin-field">
          <label htmlFor="metadata-norm">Número de norma</label>
          <input
            id="metadata-norm"
            name="norm_number"
            defaultValue={document.norm_number ?? ""}
            maxLength={80}
          />
        </div>
        <div className="admin-field">
          <label htmlFor="metadata-version-label">Etiqueta de versión</label>
          <input
            id="metadata-version-label"
            name="version_label"
            defaultValue={document.version_label ?? ""}
            maxLength={80}
          />
        </div>
        <div className="admin-field">
          <label htmlFor="metadata-from">Vigente desde</label>
          <input
            id="metadata-from"
            name="effective_from"
            type="date"
            defaultValue={document.effective_from ?? ""}
          />
        </div>
        <div className="admin-field">
          <label htmlFor="metadata-until">Vigente hasta</label>
          <input
            id="metadata-until"
            name="effective_until"
            type="date"
            defaultValue={document.effective_until ?? ""}
          />
        </div>
      </div>
    </ActionForm>
  );
}

export function AccessForm({
  documentId,
  visibility,
  accessGroupIds,
  groups,
}: {
  documentId: string;
  visibility: AdminDocumentVisibility;
  accessGroupIds: string[];
  groups: GroupOption[];
}) {
  const [selectedVisibility, setSelectedVisibility] = useState(visibility);
  const [state, formAction] = useActionState(
    setDocumentAccessAction,
    initialDocumentActionState,
  );

  return (
    <form className="admin-action-form" action={formAction}>
      <input type="hidden" name="document_id" value={documentId} />
      <div className="admin-field">
        <label htmlFor="access-visibility">Visibilidad</label>
        <select
          id="access-visibility"
          name="visibility"
          value={selectedVisibility}
          onChange={(event) =>
            setSelectedVisibility(event.target.value as AdminDocumentVisibility)
          }
        >
          <option value="restricted">Restringido a grupos seleccionados</option>
          <option value="common">Común a todos los grupos activos</option>
        </select>
      </div>
      <fieldset className="admin-fieldset" disabled={selectedVisibility === "common"}>
        <legend>Grupos con acceso adicional</legend>
        {groups.map((group) => (
          <label key={group.id} className="admin-check">
            <input
              type="checkbox"
              name="group_ids"
              value={group.id}
              defaultChecked={accessGroupIds.includes(group.id)}
            />
            {group.name}
          </label>
        ))}
      </fieldset>
      <SubmitButton pendingLabel="Guardando...">Guardar acceso</SubmitButton>
      <Message state={state} />
    </form>
  );
}
