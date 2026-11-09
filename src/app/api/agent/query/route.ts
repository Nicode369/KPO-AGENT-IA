import { NextResponse } from "next/server";

import { runAgentQuery } from "@/lib/agent/run";
import { getApiWorkspace } from "@/lib/auth/api";

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

  const result = await runAgentQuery({
    supabase: context.value.supabase,
    token: context.value.token,
    userId: context.value.userId,
    groupIds: context.value.groupIds,
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
