#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

import { seedQuestionSuggestions } from "./lib/question-suggestions.mjs";

const APPLY = process.argv.includes("--apply");
const SUGGESTIONS_PATH = new URL("../data/question-suggestions.json", import.meta.url);

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

async function main() {
  const supabaseUrl = required("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = required("SUPABASE_SERVICE_ROLE_KEY");
  const suggestions = JSON.parse(await readFile(SUGGESTIONS_PATH, "utf8"));

  const service = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  for (const [slug, questions] of Object.entries(suggestions)) {
    if (!Array.isArray(questions) || !questions.length) continue;

    const { data: group, error } = await service
      .from("groups")
      .select("id, name, slug")
      .eq("slug", slug)
      .maybeSingle();
    if (error) throw new Error(`No se pudo leer el grupo ${slug}: ${error.message}`);
    if (!group) {
      log(`Grupo ${slug} no existe; se omite.`);
      continue;
    }

    log(`${group.name}: ${questions.length} preguntas sugeridas.`);
    if (!APPLY) continue;

    const count = await seedQuestionSuggestions(service, group, questions);
    log(`${group.name}: ${count} preguntas sembradas.`);
  }
}

main().catch((error) => {
  console.error(`\nError: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
