import Link from "next/link";
import { connection } from "next/server";

import { OUTCOME_LABELS } from "@/lib/agent/labels";
import { getAdminGroups } from "@/lib/admin/data";
import { requireSimulatorUser } from "@/lib/auth/simulator";
import { formatDateTime } from "@/lib/datetime";
import {
  getSimulatorCases,
  getSimulatorDocuments,
  getSimulatorResults,
  getSimulatorRuns,
} from "@/lib/simulator/data";
import type {
  SimulatorCase,
  SimulatorResult,
  SimulatorRun,
  SimulatorRunStatus,
} from "@/lib/simulator/types";

import {
  SimulatorCaseDeleteForm,
  SimulatorCaseEditForm,
  SimulatorCaseForm,
  SimulatorCaseToggleForm,
  SimulatorRunPanel,
} from "./simulator-forms";

export const instant = false;

const RUN_STATUS_LABELS: Record<SimulatorRunStatus, string> = {
  running: "En ejecución",
  completed: "Completada",
  failed: "Incompleta",
};

const RUN_STATUS_TONES: Record<SimulatorRunStatus, string> = {
  running: "admin-tag-warn",
  completed: "admin-tag-ok",
  failed: "admin-tag-error",
};

type SearchParams = Promise<{ group?: string }>;

export default async function SimulatorPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await connection();
  const params = await searchParams;
  const context = await requireSimulatorUser();
  const groups = await getAdminGroups(
    context.supabase,
    context.isSuperadmin,
    context.simulatorGroupIds,
  );

  const requestedGroup =
    typeof params.group === "string" ? params.group : "";
  const selectedGroup =
    groups.find((group) => group.id === requestedGroup) ?? groups[0];

  const manageGroups = context.isSuperadmin
    ? groups
    : groups.filter((group) => context.manageGroupIds.includes(group.id));
  const canManageSelected = Boolean(
    selectedGroup &&
      (context.isSuperadmin ||
        context.manageGroupIds.includes(selectedGroup.id)),
  );

  let cases: SimulatorCase[] = [];
  let runs: SimulatorRun[] = [];
  let latestResults: SimulatorResult[] = [];
  let documents: { id: string; title: string; group_id: string }[] = [];
  let loadError: string | null = null;

  if (selectedGroup) {
    try {
      const [caseData, runData] = await Promise.all([
        getSimulatorCases(
          context.supabase,
          selectedGroup.id,
          selectedGroup.name,
        ),
        getSimulatorRuns(
          context.supabase,
          selectedGroup.id,
          selectedGroup.name,
        ),
      ]);
      cases = caseData;
      runs = runData;

      const documentGroups = context.canManage ? manageGroups : [];
      const documentLists = await Promise.all(
        documentGroups.map((group) =>
          getSimulatorDocuments(context.supabase, group.id).then((items) =>
            items.map((document) => ({ ...document, group_id: group.id })),
          ),
        ),
      );
      documents = documentLists.flat();

      if (runs[0]) {
        latestResults = await getSimulatorResults(context.supabase, runs[0].id);
      }
    } catch (error) {
      loadError = error instanceof Error ? error.message : "Error desconocido";
    }
  }

  const migrationMissing = Boolean(
    loadError &&
      /simulator_cases|simulator_runs|simulator_results|could not find the table|schema cache/i.test(
        loadError,
      ),
  );
  const latestRun = runs[0] ?? null;

  return (
    <main className="signed-in-content simulator-page">
      <div className="admin-page-head">
        <div>
          <p className="admin-eyebrow">Calidad del asistente</p>
          <h1>Simulador de pruebas</h1>
          <p className="workspace-lead">
            Define preguntas esperadas y ejecútalas contra el mismo agente que usan
            los analistas. Los resultados miden aciertos, fuentes, términos y
            latencia sin afectar el historial real.
          </p>
        </div>
        <Link className="button button-secondary" href="/app">
          Volver al asistente
        </Link>
      </div>

      {migrationMissing ? (
        <section className="admin-panel admin-panel-warning">
          <h2>Falta aplicar la migración del simulador</h2>
          <p>
            Ejecuta{" "}
            <code>web/supabase/migrations/202611120004_simulator.sql</code> en el
            SQL Editor de Supabase y recarga esta página.
          </p>
        </section>
      ) : null}

      {loadError && !migrationMissing ? (
        <p className="admin-message admin-message-error" role="alert">
          No se pudo cargar el simulador: {loadError}
        </p>
      ) : null}

      {!groups.length ? (
        <section className="admin-panel">
          <h2>Sin grupos disponibles</h2>
          <p>
            El simulador requiere un grupo activo donde tengas rol de
            administrador o supervisor.
          </p>
        </section>
      ) : null}

      {selectedGroup && !migrationMissing ? (
        <>
          {groups.length > 1 ? (
            <form className="admin-filter simulator-group-filter" method="get">
              <div className="admin-field">
                <label htmlFor="simulator-group">Grupo</label>
                <select
                  id="simulator-group"
                  name="group"
                  defaultValue={selectedGroup.id}
                >
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="admin-filter-actions">
                <button type="submit">Ver grupo</button>
              </div>
            </form>
          ) : null}

          <SimulatorRunPanel
            key={selectedGroup.id}
            groupId={selectedGroup.id}
            cases={cases}
            latestRun={latestRun}
            latestResults={latestResults}
          />

          <section className="admin-panel">
            <h2>Casos de prueba</h2>
            <p>
              {cases.length
                ? `${cases.length} caso${cases.length === 1 ? "" : "s"} en ${selectedGroup.name}.`
                : `Todavía no hay casos en ${selectedGroup.name}.`}
            </p>

            {cases.length ? (
              <div className="admin-table-wrap">
                <table className="admin-table admin-table-wide">
                  <thead>
                    <tr>
                      <th>Caso</th>
                      <th>Esperado</th>
                      <th>Documento</th>
                      <th>Términos</th>
                      <th>Estado</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cases.map((simulatorCase) => (
                      <tr key={simulatorCase.id}>
                        <td>
                          <strong>{simulatorCase.title}</strong>
                          <span className="admin-subtle">
                            {simulatorCase.question}
                          </span>
                          {simulatorCase.notes ? (
                            <span className="admin-subtle">
                              {simulatorCase.notes}
                            </span>
                          ) : null}
                        </td>
                        <td>
                          {OUTCOME_LABELS[simulatorCase.expected_outcome] ??
                            simulatorCase.expected_outcome}
                        </td>
                        <td>
                          {simulatorCase.expected_document_title ?? "—"}
                        </td>
                        <td>
                          {simulatorCase.expected_terms.length
                            ? simulatorCase.expected_terms.join(", ")
                            : "—"}
                        </td>
                        <td>
                          <span
                            className={`admin-tag ${
                              simulatorCase.is_active
                                ? "admin-tag-ok"
                                : "admin-tag-muted"
                            }`}
                          >
                            {simulatorCase.is_active ? "Activo" : "Inactivo"}
                          </span>
                        </td>
                        <td>
                          {canManageSelected ? (
                            <div className="simulator-case-actions">
                              <SimulatorCaseToggleForm
                                caseId={simulatorCase.id}
                                isActive={simulatorCase.is_active}
                              />
                              <SimulatorCaseDeleteForm
                                caseId={simulatorCase.id}
                              />
                            </div>
                          ) : (
                            <span className="admin-muted">Solo lectura</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="admin-muted">
                Crea el primer caso con una pregunta, el resultado esperado y,
                opcionalmente, el documento y los términos que deben aparecer.
              </p>
            )}

            {canManageSelected && cases.length ? (
              <details className="simulator-edit-details">
                <summary>Editar un caso</summary>
                <div className="simulator-edit-list">
                  {cases.map((simulatorCase) => (
                    <details
                      className="simulator-edit-item"
                      key={simulatorCase.id}
                    >
                      <summary>{simulatorCase.title}</summary>
                      <SimulatorCaseEditForm
                        caseData={simulatorCase}
                        documents={documents}
                      />
                    </details>
                  ))}
                </div>
              </details>
            ) : null}

            {canManageSelected ? (
              <details className="simulator-create-details" id="nuevo-caso">
                <summary>Nuevo caso de prueba</summary>
                <SimulatorCaseForm
                  groups={manageGroups.map((group) => ({
                    id: group.id,
                    name: group.name,
                  }))}
                  documents={documents}
                  defaultGroupId={selectedGroup.id}
                />
              </details>
            ) : null}
          </section>

          <section className="admin-panel">
            <h2>Historial de ejecuciones</h2>
            {runs.length ? (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Inicio</th>
                      <th>Estado</th>
                      <th>Casos</th>
                      <th>Aciertos</th>
                      <th>Latencia media</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((run) => {
                      const metrics = run.metadata.metrics as
                        | {
                            passed?: number;
                            total?: number;
                            averageLatencyMs?: number | null;
                          }
                        | undefined;
                      return (
                        <tr key={run.id}>
                          <td>{formatDateTime(run.started_at)}</td>
                          <td>
                            <span
                              className={`admin-tag ${
                                RUN_STATUS_TONES[run.status] ?? "admin-tag-muted"
                              }`}
                            >
                              {RUN_STATUS_LABELS[run.status] ?? run.status}
                            </span>
                          </td>
                          <td>
                            {run.completed_cases}/{run.total_cases}
                          </td>
                          <td>
                            {metrics?.passed == null
                              ? "—"
                              : `${metrics.passed}/${metrics.total ?? run.total_cases}`}
                          </td>
                          <td>
                            {metrics?.averageLatencyMs == null
                              ? "—"
                              : `${metrics.averageLatencyMs} ms`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="admin-muted">
                Aún no hay ejecuciones registradas en este grupo.
              </p>
            )}
          </section>
        </>
      ) : null}
    </main>
  );
}
