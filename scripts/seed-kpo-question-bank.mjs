#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const BANK_PATH = new URL("../data/kpo-question-bank.json", import.meta.url);
const GROUP_SLUG = process.env.KPO_GROUP_SLUG?.trim() || "kpo";
const TITLE_PREFIX = "KPO CCB #";

function required(...names) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  throw new Error(`Falta la variable de entorno ${names.join(" o ")}.`);
}

function log(message) {
  console.log(`${APPLY ? "[apply]" : "[dry-run]"} ${message}`);
}

function caseTitle(item) {
  return `${TITLE_PREFIX}${String(item.id).padStart(2, "0")} · ${item.title}`;
}

async function main() {
  const bank = JSON.parse(await readFile(BANK_PATH, "utf8"));
  if (!Array.isArray(bank) || bank.length !== 50) {
    throw new Error("El banco KPO debe contener exactamente 50 consultas.");
  }

  const service = createClient(
    required("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"),
    required("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data: group, error: groupError } = await service
    .from("groups")
    .select("id, name, slug")
    .eq("slug", GROUP_SLUG)
    .maybeSingle();
  if (groupError) throw new Error(`No se pudo leer el grupo: ${groupError.message}`);
  if (!group) throw new Error(`No existe el grupo ${GROUP_SLUG}.`);

  const { data: documents, error: documentsError } = await service
    .from("documents")
    .select("id, title")
    .eq("group_id", group.id)
    .eq("status", "published");
  if (documentsError) {
    throw new Error(`No se pudieron leer los documentos: ${documentsError.message}`);
  }

  const documentIdByTitle = new Map(
    (documents ?? []).map((document) => [document.title, document.id]),
  );
  const now = new Date().toISOString();

  const rows = bank.map((item) => {
    if (
      typeof item.id !== "number" ||
      typeof item.title !== "string" ||
      typeof item.question !== "string" ||
      typeof item.expectedOutcome !== "string" ||
      !Array.isArray(item.expectedTerms)
    ) {
      throw new Error(`Caso KPO inválido: ${JSON.stringify(item)}`);
    }

    const expectedDocumentId = item.expectedDocumentTitle
      ? documentIdByTitle.get(item.expectedDocumentTitle) ?? null
      : null;
    if (item.expectedDocumentTitle && !expectedDocumentId) {
      throw new Error(
        `No se encontró el documento "${item.expectedDocumentTitle}" para el caso ${item.id}.`,
      );
    }

    return {
      group_id: group.id,
      title: caseTitle(item),
      question: item.question,
      expected_outcome: item.expectedOutcome,
      expected_document_id: expectedDocumentId,
      expected_terms: item.expectedTerms.slice(0, 10),
      notes: `CCB #${item.id} · ${item.sourceRef}. ${item.notes}`,
      is_active: true,
      updated_at: now,
    };
  });

  const { data: existing, error: existingError } = await service
    .from("simulator_cases")
    .select("id, title")
    .eq("group_id", group.id)
    .like("title", `${TITLE_PREFIX}%`);
  if (existingError) {
    throw new Error(`No se pudieron leer los casos existentes: ${existingError.message}`);
  }

  const existingByTitle = new Map(
    (existing ?? []).map((item) => [item.title, item.id]),
  );
  const currentTitles = new Set(rows.map((row) => row.title));
  const stale = (existing ?? []).filter((item) => !currentTitles.has(item.title));

  log(
    `${group.name}: ${rows.length} casos del banco; ` +
      `${existingByTitle.size} existentes, ${rows.length - existingByTitle.size} nuevos.`,
  );
  if (!APPLY) {
    log(
      `Documentos resueltos: ${rows.filter((row) => row.expected_document_id).length}/${rows.length}.`,
    );
    log("Dry-run completado. Ejecuta con --apply para escribir en Supabase.");
    return;
  }

  let created = 0;
  let updated = 0;
  for (const row of rows) {
    const id = existingByTitle.get(row.title);
    if (id) {
      const { error } = await service
        .from("simulator_cases")
        .update(row)
        .eq("id", id);
      if (error) throw new Error(`No se pudo actualizar "${row.title}": ${error.message}`);
      updated += 1;
      continue;
    }

    const { error } = await service.from("simulator_cases").insert(row);
    if (error) throw new Error(`No se pudo crear "${row.title}": ${error.message}`);
    created += 1;
  }

  if (stale.length) {
    const { error } = await service
      .from("simulator_cases")
      .delete()
      .in(
        "id",
        stale.map((item) => item.id),
      );
    if (error) {
      throw new Error(`No se pudieron retirar casos antiguos: ${error.message}`);
    }
  }

  log(
    `${group.name}: ${created} creados, ${updated} actualizados, ` +
      `${stale.length} retirados.`,
  );
}

main().catch((error) => {
  console.error(`\nError: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
