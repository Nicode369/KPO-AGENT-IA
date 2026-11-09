"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";

import {
  OUTCOME_LABELS,
  OUTCOME_TONES,
} from "@/lib/agent/labels";
import { summarizeSimulatorResults } from "@/lib/simulator/metrics";
import {
  SIMULATOR_EXPECTED_OUTCOMES,
  type SimulatorCase,
  type SimulatorMetrics,
  type SimulatorResult,
  type SimulatorRun,
} from "@/lib/simulator/types";

import {
  type SimulatorActionState,
  createSimulatorCaseAction,
  deleteSimulatorCaseAction,
  toggleSimulatorCaseAction,
  updateSimulatorCaseAction,
} from "./actions";

const initialState: SimulatorActionState = { status: "idle" };

type GroupOption = { id: string; name: string };
type DocumentOption = { id: string; title: string; group_id: string };

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

function ActionMessage({ state }: { state: SimulatorActionState }) {
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

function OutcomeSelect({ defaultValue }: { defaultValue?: string }) {
  return (
    <select
      name="expected_outcome"
      defaultValue={defaultValue ?? "answered"}
      required
    >
      {SIMULATOR_EXPECTED_OUTCOMES.map((outcome) => (
        <option key={outcome} value={outcome}>
          {OUTCOME_LABELS[outcome] ?? outcome}
        </option>
      ))}
    </select>
  );
}

function CaseFields({
  groups,
  documents,
  defaultGroupId,
  caseData,
  showGroup = true,
}: {
  groups: GroupOption[];
  documents: DocumentOption[];
  defaultGroupId?: string;
  caseData?: SimulatorCase;
  showGroup?: boolean;
}) {
  const [groupId, setGroupId] = useState(
    caseData?.group_id ?? defaultGroupId ?? groups[0]?.id ?? "",
  );
  const groupDocuments = documents.filter(
    (document) => document.group_id === groupId,
  );

  return (
    <div className="admin-form-grid">
      {showGroup ? (
        <div className="admin-field">
          <label htmlFor={`sim-group-${caseData?.id ?? "new"}`}>Grupo</label>
          <select
            id={`sim-group-${caseData?.id ?? "new"}`}
            name="group_id"
            value={groupId}
            onChange={(event) => setGroupId(event.target.value)}
            required
          >
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <input type="hidden" name="group_id" value={groupId} />
      )}
      <div className="admin-field">
        <label htmlFor={`sim-title-${caseData?.id ?? "new"}`}>Título</label>
        <input
          id={`sim-title-${caseData?.id ?? "new"}`}
          name="title"
          required
          minLength={2}
          maxLength={120}
          defaultValue={caseData?.title ?? ""}
          placeholder="Plazo del artículo 631-5"
        />
      </div>
      <div className="admin-field admin-field-wide">
        <label htmlFor={`sim-question-${caseData?.id ?? "new"}`}>
          Pregunta
        </label>
        <textarea
          id={`sim-question-${caseData?.id ?? "new"}`}
          name="question"
          required
          minLength={3}
          maxLength={1200}
          defaultValue={caseData?.question ?? ""}
          placeholder="¿Cuál es el plazo del artículo 631-5?"
        />
      </div>
      <div className="admin-field">
        <label htmlFor={`sim-outcome-${caseData?.id ?? "new"}`}>
          Resultado esperado
        </label>
        <OutcomeSelect defaultValue={caseData?.expected_outcome} />
      </div>
      <div className="admin-field">
        <label htmlFor={`sim-document-${caseData?.id ?? "new"}`}>
          Documento esperado (opcional)
        </label>
        <select
          id={`sim-document-${caseData?.id ?? "new"}`}
          name="expected_document_id"
          defaultValue={caseData?.expected_document_id ?? ""}
        >
          <option value="">Sin documento específico</option>
          {groupDocuments.map((document) => (
            <option key={document.id} value={document.id}>
              {document.title}
            </option>
          ))}
        </select>
      </div>
      <div className="admin-field">
        <label htmlFor={`sim-terms-${caseData?.id ?? "new"}`}>
          Términos esperados
        </label>
        <input
          id={`sim-terms-${caseData?.id ?? "new"}`}
          name="expected_terms"
          defaultValue={(caseData?.expected_terms ?? []).join(", ")}
          placeholder="631-5, plazo"
        />
        <span className="admin-field-help">
          Separados por coma. Se validan sin distinguir mayúsculas.
        </span>
      </div>
      <div className="admin-field">
        <label htmlFor={`sim-notes-${caseData?.id ?? "new"}`}>Notas</label>
        <input
          id={`sim-notes-${caseData?.id ?? "new"}`}
          name="notes"
          maxLength={500}
          defaultValue={caseData?.notes ?? ""}
          placeholder="Contexto del caso"
        />
      </div>
    </div>
  );
}

export function SimulatorCaseForm({
  groups,
  documents,
  defaultGroupId,
}: {
  groups: GroupOption[];
  documents: DocumentOption[];
  defaultGroupId: string;
}) {
  const [state, formAction] = useActionState(
    createSimulatorCaseAction,
    initialState,
  );

  return (
    <form className="admin-form" action={formAction}>
      <ActionMessage state={state} />
      <CaseFields
        groups={groups}
        documents={documents}
        defaultGroupId={defaultGroupId}
      />
      <SubmitButton pendingLabel="Creando...">Crear caso</SubmitButton>
    </form>
  );
}

export function SimulatorCaseEditForm({
  caseData,
  documents,
}: {
  caseData: SimulatorCase;
  documents: DocumentOption[];
}) {
  const [state, formAction] = useActionState(
    updateSimulatorCaseAction,
    initialState,
  );

  return (
    <form className="admin-form" action={formAction}>
      <ActionMessage state={state} />
      <input type="hidden" name="case_id" value={caseData.id} />
      <CaseFields
        groups={[{ id: caseData.group_id, name: caseData.group_name }]}
        documents={documents}
        defaultGroupId={caseData.group_id}
        caseData={caseData}
        showGroup={false}
      />
      <SubmitButton pendingLabel="Guardando...">Guardar cambios</SubmitButton>
    </form>
  );
}

export function SimulatorCaseToggleForm({
  caseId,
  isActive,
}: {
  caseId: string;
  isActive: boolean;
}) {
  const [state, formAction] = useActionState(
    toggleSimulatorCaseAction,
    initialState,
  );

  return (
    <form className="admin-inline-form" action={formAction}>
      <input type="hidden" name="case_id" value={caseId} />
      <input type="hidden" name="is_active" value={String(isActive)} />
      <SubmitButton pendingLabel="Guardando...">
        {isActive ? "Desactivar" : "Activar"}
      </SubmitButton>
      <ActionMessage state={state} />
    </form>
  );
}

export function SimulatorCaseDeleteForm({ caseId }: { caseId: string }) {
  const [state, formAction] = useActionState(
    deleteSimulatorCaseAction,
    initialState,
  );

  return (
    <form className="admin-inline-form" action={formAction}>
      <input type="hidden" name="case_id" value={caseId} />
      <SubmitButton pendingLabel="Eliminando...">Eliminar</SubmitButton>
      <ActionMessage state={state} />
    </form>
  );
}

type RunApiResponse =
  | {
      runId: string;
      cases: { id: string; title: string; question: string }[];
    }
  | { result: SimulatorResult }
  | { status: string; metrics: SimulatorMetrics; results: SimulatorResult[] }
  | { error: { code: string; message: string } };

async function runRequest(body: Record<string, unknown>): Promise<RunApiResponse> {
  const response = await fetch("/api/simulator/run", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as
    | RunApiResponse
    | null;
  if (!response.ok) {
    const message =
      payload && "error" in payload
        ? payload.error.message
        : "No se pudo ejecutar el simulador.";
    throw new Error(message);
  }
  if (!payload) throw new Error("Respuesta inválida del simulador.");
  return payload;
}

export function SimulatorRunPanel({
  groupId,
  cases,
  latestRun,
  latestResults,
}: {
  groupId: string;
  cases: SimulatorCase[];
  latestRun: SimulatorRun | null;
  latestResults: SimulatorResult[];
}) {
  const router = useRouter();
  const activeCases = cases.filter((item) => item.is_active);
  const [selected, setSelected] = useState<string[]>(
    activeCases.map((item) => item.id),
  );
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(latestResults.length);
  const [results, setResults] = useState<SimulatorResult[]>(latestResults);
  const [metrics, setMetrics] = useState<SimulatorMetrics>(
    summarizeSimulatorResults(latestResults),
  );
  const [error, setError] = useState<string | null>(null);

  const toggleCase = (caseId: string) => {
    setSelected((current) =>
      current.includes(caseId)
        ? current.filter((id) => id !== caseId)
        : [...current, caseId],
    );
  };

  const execute = async () => {
    if (!selected.length || running) return;
    setRunning(true);
    setError(null);
    setProgress(0);
    setResults([]);
    setMetrics(summarizeSimulatorResults([]));

    try {
      const started = await runRequest({
        action: "start",
        groupId,
        caseIds: selected,
      });
      if (!("runId" in started)) throw new Error("No se pudo iniciar el lote.");
      setTotal(started.cases.length);
      const collected: SimulatorResult[] = [];

      for (const caseItem of started.cases) {
        const response = await runRequest({
          action: "case",
          runId: started.runId,
          caseId: caseItem.id,
        });
        if (!("result" in response)) {
          throw new Error(`No se pudo ejecutar el caso ${caseItem.title}.`);
        }
        collected.push(response.result);
        setResults([...collected]);
        setMetrics(summarizeSimulatorResults(collected));
        setProgress(collected.length);
      }

      const finished = await runRequest({
        action: "finish",
        runId: started.runId,
      });
      if ("metrics" in finished) {
        setMetrics(finished.metrics);
        setResults(finished.results);
      }
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Error desconocido.");
    } finally {
      setRunning(false);
    }
  };

  return (
    <section className="admin-panel">
      <h2>Ejecutar casos</h2>
      <p>
        Las ejecuciones no se guardan en el historial real ni consumen el límite
        de consultas. Cada caso usa el mismo agente, documentos publicados y
        filtros de seguridad.
      </p>

      {activeCases.length ? (
        <>
          <div className="simulator-case-picker">
            {activeCases.map((item) => (
              <label key={item.id} className="simulator-case-option">
                <input
                  type="checkbox"
                  checked={selected.includes(item.id)}
                  onChange={() => toggleCase(item.id)}
                  disabled={running}
                />
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.question}</small>
                </span>
              </label>
            ))}
          </div>
          <div className="simulator-run-actions">
            <button
              className="admin-button"
              type="button"
              onClick={() => void execute()}
              disabled={running || !selected.length}
            >
              {running
                ? `Ejecutando ${progress}/${total}...`
                : `Ejecutar ${selected.length} caso${selected.length === 1 ? "" : "s"}`}
            </button>
            <button
              className="admin-button admin-button-secondary"
              type="button"
              onClick={() => setSelected(activeCases.map((item) => item.id))}
              disabled={running}
            >
              Seleccionar todos
            </button>
            <button
              className="admin-button admin-button-secondary"
              type="button"
              onClick={() => setSelected([])}
              disabled={running}
            >
              Limpiar selección
            </button>
          </div>
        </>
      ) : (
        <p className="admin-muted">No hay casos activos en este grupo.</p>
      )}

      {error ? (
        <p className="admin-message admin-message-error" role="alert">
          {error}
        </p>
      ) : null}

      {results.length ? (
        <>
          <div className="admin-stats simulator-stats" aria-label="Métricas del simulador">
            <div className="admin-stat">
              <span>Aciertos</span>
              <strong>
                {metrics.passed}/{metrics.total}
              </strong>
              <small>
                {metrics.total
                  ? `${Math.round((metrics.passed / metrics.total) * 100)}%`
                  : "Sin datos"}
              </small>
            </div>
            <div className="admin-stat">
              <span>Outcome correcto</span>
              <strong>
                {metrics.outcomeMatches}/{metrics.total}
              </strong>
              <small>Resultado esperado vs. real</small>
            </div>
            <div className="admin-stat">
              <span>Citas</span>
              <strong>{Math.round(metrics.citationRate * 100)}%</strong>
              <small>Respuestas con fuentes</small>
            </div>
            <div className="admin-stat">
              <span>Latencia media</span>
              <strong>
                {metrics.averageLatencyMs == null
                  ? "—"
                  : `${metrics.averageLatencyMs} ms`}
              </strong>
              <small>
                p95 {metrics.p95LatencyMs == null ? "—" : `${metrics.p95LatencyMs} ms`}
              </small>
            </div>
          </div>

          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Caso</th>
                  <th>Estado</th>
                  <th>Esperado</th>
                  <th>Real</th>
                  <th>Fuente</th>
                  <th>Términos</th>
                  <th>Latencia</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {results.map((result) => {
                  const passed =
                    result.outcome_match &&
                    result.source_match !== false &&
                    result.terms_match;
                  return (
                    <tr key={result.id}>
                      <td>
                        <strong>{result.case_title}</strong>
                        <span className="admin-subtle">{result.question}</span>
                      </td>
                      <td>
                        <span
                          className={`admin-tag ${
                            passed ? "admin-tag-ok" : "admin-tag-error"
                          }`}
                        >
                          {passed ? "PASS" : "FAIL"}
                        </span>
                      </td>
                      <td>
                        {OUTCOME_LABELS[result.expected_outcome] ??
                          result.expected_outcome}
                      </td>
                      <td>
                        <span
                          className={`admin-tag ${
                            OUTCOME_TONES[result.actual_outcome] ??
                            "admin-tag-muted"
                          }`}
                        >
                          {OUTCOME_LABELS[result.actual_outcome] ??
                            result.actual_outcome}
                        </span>
                      </td>
                      <td>
                        {result.source_match == null
                          ? "—"
                          : result.source_match
                            ? "Encontrada"
                            : "No encontrada"}
                      </td>
                      <td>{result.terms_match ? "Sí" : "No"}</td>
                      <td>
                        {result.latency_ms == null
                          ? "—"
                          : `${result.latency_ms} ms`}
                      </td>
                      <td>{result.error ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : latestRun ? (
        <p className="admin-muted">
          El último lote no tiene resultados todavía.
        </p>
      ) : null}
    </section>
  );
}
