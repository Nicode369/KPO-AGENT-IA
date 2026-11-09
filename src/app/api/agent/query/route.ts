import { NextResponse } from "next/server";

import { runAgentQuery } from "@/lib/agent/run";
import { getApiWorkspace } from "@/lib/auth/api";
import { getSuperadminGroupContext } from "@/lib/auth/group-context";
import { getPublishedDocumentIdsForGroup } from "@/lib/documents/retrieval";

export const maxDuration = 60;

export async function POST(request: Request) {
  const context = await getApiWorkspace();
  if (!context.ok) return fail(context.status, context.code, context.message);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "invalid_json", "El cuerpo de la solicitud no es válido.");
  }

  const question =
    body &&
    typeof body === "object" &&
    typeof (body as { question?: unknown }).question === "string"
      ? (body as { question: string }).question
      : "";

  let groupIds = context.value.groupIds;
  let documentIds: string[] | undefined;

  if (context.value.isSuperadmin) {
    const groupContext = await getSuperadminGroupContext(
      context.value.supabase,
      true,
    );

    if (groupContext.activeGroup) {
      groupIds = [groupContext.activeGroup.id];
      const documents = await getPublishedDocumentIdsForGroup(
        context.value.supabase,
        groupContext.activeGroup.id,
      );

      if (!documents.ok) {
        return fail(
          500,
          "documents_failed",
          "No se pudieron cargar los documentos del grupo activo.",
        );
      }

      documentIds = documents.ids;
    }
  }

  const result = await runAgentQuery({
    supabase: context.value.supabase,
    token: context.value.token,
    userId: context.value.userId,
    groupIds,
    documentIds,
    question,
    enforceRateLimit: true,
    recordHistory: true,
  });

  if (!result.ok) {
    return fail(result.status, result.code, result.message);
  }

  return NextResponse.json(result.response);
}

function fail(status: number, code: string, message: string) {
  return NextResponse.json(
    { error: { code, message } },
    { status, headers: { "cache-control": "no-store" } },
  );
}
