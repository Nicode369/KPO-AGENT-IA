import { NextResponse } from "next/server";

import { requireAdminUser } from "@/lib/auth/workspace";

export const maxDuration = 60;

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const { supabase } = await requireAdminUser();
  const baseUrl = process.env.INGEST_WORKER_URL?.replace(/\/+$/, "");

  if (!baseUrl) {
    return NextResponse.json(
      { error: { message: "Falta configurar INGEST_WORKER_URL." } },
      { status: 503 },
    );
  }

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    return NextResponse.json(
      { error: { message: "La sesión no es válida." } },
      { status: 401 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: { message: "No se pudo leer el archivo cargado." } },
      { status: 400 },
    );
  }

  let workerResponse: Response;
  try {
    workerResponse = await fetch(
      `${baseUrl}/documents/${encodeURIComponent(id)}/versions`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        body: form,
        cache: "no-store",
      },
    );
  } catch {
    return NextResponse.json(
      { error: { message: "No se pudo conectar con el servicio de ingesta." } },
      { status: 502 },
    );
  }

  return new Response(await workerResponse.text(), {
    status: workerResponse.status,
    headers: {
      "content-type":
        workerResponse.headers.get("content-type") ?? "application/json",
      "cache-control": "no-store",
    },
  });
}
