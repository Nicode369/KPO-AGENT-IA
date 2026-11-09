"use server";

import { revalidatePath } from "next/cache";

import { recordAuditEvent } from "@/lib/audit/log";
import { requireSimulatorUser } from "@/lib/auth/simulator";
import {
  SIMULATOR_EXPECTED_OUTCOMES,
  type SimulatorExpectedOutcome,
} from "@/lib/simulator/types";

export type SimulatorActionState = {
  status: "idle" | "error" | "success";
  message?: string;
};

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function errorState(message: string): SimulatorActionState {
  return { status: "error", message };
}

function parseTerms(value: string): string[] {
  return [
    ...new Set(
      value
        .split(",")
        .map((term) => term.trim())
        .filter(Boolean)
        .slice(0, 10),
    ),
  ];
}

function normalizeExpectedOutcome(value: string): SimulatorExpectedOutcome | null {
  return SIMULATOR_EXPECTED_OUTCOMES.includes(
    value as SimulatorExpectedOutcome,
  )
    ? (value as SimulatorExpectedOutcome)
    : null;
}

async function validatedInput(formData: FormData) {
  const context = await requireSimulatorUser();
  const groupId = field(formData, "group_id");
  const title = field(formData, "title");
  const question = field(formData, "question");
  const expectedOutcome = normalizeExpectedOutcome(field(formData, "expected_outcome"));
  const expectedDocumentId = field(formData, "expected_document_id") || null;
  const expectedTerms = parseTerms(field(formData, "expected_terms"));
  const notes = field(formData, "notes") || null;

  if (!groupId) return { ok: false as const, message: "Selecciona un grupo." };
  if (
    !context.isSuperadmin &&
    !context.manageGroupIds.includes(groupId)
  ) {
    return {
      ok: false as const,
      message: "No puedes gestionar casos de ese grupo.",
    };
  }
  if (title.length < 2 || title.length > 120) {
    return {
      ok: false as const,
      message: "El título debe tener entre 2 y 120 caracteres.",
    };
  }
  if (question.length < 3 || question.length > 1200) {
    return {
      ok: false as const,
      message: "La pregunta debe tener entre 3 y 1200 caracteres.",
    };
  }
  if (!expectedOutcome) {
    return { ok: false as const, message: "Selecciona un resultado esperado." };
  }

  if (expectedDocumentId) {
    const { data: document, error } = await context.supabase
      .from("documents")
      .select("group_id")
      .eq("id", expectedDocumentId)
      .maybeSingle<{ group_id: string }>();
    if (error) return { ok: false as const, message: "No se pudo validar el documento." };
    if (!document || document.group_id !== groupId) {
      return {
        ok: false as const,
        message: "El documento esperado no pertenece a ese grupo.",
      };
    }
  }

  return {
    ok: true as const,
    context,
    input: {
      groupId,
      title,
      question,
      expectedOutcome,
      expectedDocumentId,
      expectedTerms,
      notes,
    },
  };
}

async function auditCaseEvent(
  context: Awaited<ReturnType<typeof requireSimulatorUser>>,
  eventType: string,
  caseId: string,
  groupId: string,
  metadata: Record<string, unknown>,
) {
  await recordAuditEvent({
    eventType,
    actorId: context.userId,
    actorEmail: context.profile.email,
    groupId,
    targetType: "simulator_case",
    targetId: caseId,
    metadata,
  });
}

export async function createSimulatorCaseAction(
  _previousState: SimulatorActionState,
  formData: FormData,
): Promise<SimulatorActionState> {
  const validated = await validatedInput(formData);
  if (!validated.ok) return errorState(validated.message);

  const { context, input } = validated;
  const { data, error } = await context.supabase
    .from("simulator_cases")
    .insert({
      group_id: input.groupId,
      title: input.title,
      question: input.question,
      expected_outcome: input.expectedOutcome,
      expected_document_id: input.expectedDocumentId,
      expected_terms: input.expectedTerms,
      notes: input.notes,
      created_by: context.userId,
    })
    .select("id")
    .single<{ id: string }>();

  if (error) {
    return errorState(
      /simulator_cases|schema cache/i.test(error.message)
        ? "Falta aplicar la migración del simulador en Supabase."
        : "No se pudo crear el caso.",
    );
  }

  await auditCaseEvent(context, "simulator_case_created", data.id, input.groupId, {
    title: input.title,
    expected_outcome: input.expectedOutcome,
  });
  revalidatePath("/app/simulator");
  return { status: "success", message: "Caso creado." };
}

export async function updateSimulatorCaseAction(
  _previousState: SimulatorActionState,
  formData: FormData,
): Promise<SimulatorActionState> {
  const caseId = field(formData, "case_id");
  if (!caseId) return errorState("Caso inválido.");

  const validated = await validatedInput(formData);
  if (!validated.ok) return errorState(validated.message);

  const { context, input } = validated;
  const { data: current } = await context.supabase
    .from("simulator_cases")
    .select("group_id")
    .eq("id", caseId)
    .maybeSingle<{ group_id: string }>();

  if (!current || current.group_id !== input.groupId) {
    return errorState("No autorizado para ese caso.");
  }

  const { error } = await context.supabase
    .from("simulator_cases")
    .update({
      title: input.title,
      question: input.question,
      expected_outcome: input.expectedOutcome,
      expected_document_id: input.expectedDocumentId,
      expected_terms: input.expectedTerms,
      notes: input.notes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", caseId);

  if (error) return errorState("No se pudo actualizar el caso.");

  await auditCaseEvent(context, "simulator_case_updated", caseId, input.groupId, {
    title: input.title,
    expected_outcome: input.expectedOutcome,
  });
  revalidatePath("/app/simulator");
  return { status: "success", message: "Caso actualizado." };
}

export async function toggleSimulatorCaseAction(
  _previousState: SimulatorActionState,
  formData: FormData,
): Promise<SimulatorActionState> {
  const context = await requireSimulatorUser();
  const caseId = field(formData, "case_id");
  const isActive = field(formData, "is_active") === "true";
  if (!caseId) return errorState("Caso inválido.");

  const { data: current } = await context.supabase
    .from("simulator_cases")
    .select("group_id")
    .eq("id", caseId)
    .maybeSingle<{ group_id: string }>();

  if (
    !current ||
    (!context.isSuperadmin && !context.manageGroupIds.includes(current.group_id))
  ) {
    return errorState("No autorizado para ese caso.");
  }

  const { error } = await context.supabase
    .from("simulator_cases")
    .update({ is_active: !isActive, updated_at: new Date().toISOString() })
    .eq("id", caseId);

  if (error) return errorState("No se pudo cambiar el estado del caso.");

  await auditCaseEvent(
    context,
    isActive ? "simulator_case_deactivated" : "simulator_case_activated",
    caseId,
    current.group_id,
    { is_active: !isActive },
  );
  revalidatePath("/app/simulator");
  return {
    status: "success",
    message: isActive ? "Caso desactivado." : "Caso activado.",
  };
}

export async function deleteSimulatorCaseAction(
  _previousState: SimulatorActionState,
  formData: FormData,
): Promise<SimulatorActionState> {
  const context = await requireSimulatorUser();
  const caseId = field(formData, "case_id");
  if (!caseId) return errorState("Caso inválido.");

  const { data: current } = await context.supabase
    .from("simulator_cases")
    .select("group_id, title")
    .eq("id", caseId)
    .maybeSingle<{ group_id: string; title: string }>();

  if (
    !current ||
    (!context.isSuperadmin && !context.manageGroupIds.includes(current.group_id))
  ) {
    return errorState("No autorizado para ese caso.");
  }

  const { error } = await context.supabase
    .from("simulator_cases")
    .delete()
    .eq("id", caseId);

  if (error) return errorState("No se pudo eliminar el caso.");

  await auditCaseEvent(context, "simulator_case_deleted", caseId, current.group_id, {
    title: current.title,
  });
  revalidatePath("/app/simulator");
  return { status: "success", message: "Caso eliminado." };
}
