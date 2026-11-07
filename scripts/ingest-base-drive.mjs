#!/usr/bin/env node
import { readFile, readdir, stat } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const PROJECT_ROOT = resolve(import.meta.dirname, "../..");
const DEFAULT_BASE_DRIVE = join(PROJECT_ROOT, "base_drive");

const DOCUMENTS = [
  {
    file: "01_Procedimientos_auditoria.docx",
    title: "Procedimientos de auditoría — plantilla del Bootcamp",
    documentType: "procedimiento",
    normNumber: "TEMPLATE-01",
    versionLabel: "Material didáctico",
  },
  {
    file: "02_Guia_practica_NIA.docx",
    title: "Guía práctica de NIAs — síntesis del Bootcamp",
    documentType: "guia",
    normNumber: "TEMPLATE-02",
    versionLabel: "Material didáctico",
  },
  {
    file: "03_Control_interno_COSO_y_hallazgos.docx",
    title: "COSO y hallazgos — guía del Bootcamp",
    documentType: "guia",
    normNumber: "TEMPLATE-03",
    versionLabel: "Material didáctico",
  },
  {
    file: "04_Cumplimiento_SARLAFT_SAGRILAFT_ROS.docx",
    title: "SARLAFT/SAGRILAFT/ROS — mapa del Bootcamp",
    documentType: "guia",
    normNumber: "TEMPLATE-04",
    versionLabel: "Material didáctico",
  },
  {
    file: "Circular Externa 100-000002 de 14 de marzo de 2025.pdf",
    title: "Circular Externa 100-000002 de 14 de marzo de 2025",
    documentType: "circular",
    normNumber: "100-000002",
    versionLabel: "2025-03-14",
  },
  {
    file: "Circular Externa 100-000003 de 23 de abril de 2024.pdf",
    title: "Circular Externa 100-000003 de 23 de abril de 2024",
    documentType: "circular",
    normNumber: "100-000003",
    versionLabel: "2024-04-23",
  },
  {
    file: "Circular Externa 100-000004 de 4 de octubre de 2023.pdf",
    title: "Circular Externa 100-000004 de 4 de octubre de 2023",
    documentType: "circular",
    normNumber: "100-000004",
    versionLabel: "2023-10-04",
  },
  {
    file: "Circular Externa 100-000008 de 1 de noviembre de 2023.pdf",
    title: "Circular Externa 100-000008 de 1 de noviembre de 2023",
    documentType: "circular",
    normNumber: "100-000008",
    versionLabel: "2023-11-01",
  },
  {
    file: "Circular Externa 100-000020 de 2 de julio de 2026.pdf",
    title: "Circular Externa 100-000020 de 2 de julio de 2026",
    documentType: "circular",
    normNumber: "100-000020",
    versionLabel: "2026-07-02",
  },
  {
    file: "Circular Externa 100-300000 de 6 de diciembre de 2024.pdf",
    title: "Circular Externa 100-300000 de 6 de diciembre de 2024",
    documentType: "circular",
    normNumber: "100-300000",
    versionLabel: "2024-12-06",
  },
  {
    file: "Circular-Cumplimiento-2023-01-734390.PDF",
    title: "Circular de Cumplimiento 2023-01-734390",
    documentType: "circular",
    normNumber: "2023-01-734390",
    versionLabel: "2023",
  },
  {
    file: "Circular-Externa-100-000004-de-09-04-2021.pdf",
    title: "Circular Externa 100-000004 de 9 de abril de 2021",
    documentType: "circular",
    normNumber: "100-000004",
    versionLabel: "2021-04-09",
  },
  {
    file: "Circular-Externa-100-000015-de-24-12-2021.pdf",
    title: "Circular Externa 100-000015 de 24 de diciembre de 2021",
    documentType: "circular",
    normNumber: "100-000015",
    versionLabel: "2021-12-24",
    ocr: true,
  },
  {
    file: "Circular-Externa-100-000016-de-24-12-2020.pdf",
    title: "Circular Externa 100-000016 de 24 de diciembre de 2020",
    documentType: "circular",
    normNumber: "100-000016",
    versionLabel: "2020-12-24",
  },
  {
    file: "Decreto_2420_de_2015_Normas_de_contabilidad,_de_información_financiera_y_de_aseguramiento_de_información.pdf",
    title: "Decreto 2420 de 2015 — Normas de contabilidad, información financiera y aseguramiento",
    documentType: "decreto",
    normNumber: "2420 de 2015",
    versionLabel: "2015",
  },
];

const SKIPPED = new Set([
  "05_Indice_fuentes_y_metadatos.csv",
  "Ejercicio Semana 4 KPO complementado - versión ajustada.html",
  "Ejercicio Semana 4 KPO complementado.html",
]);

const dryRun = process.argv.includes("--dry-run");

async function main() {
  const baseDrive = process.env.BASE_DRIVE_DIR
    ? resolve(process.env.BASE_DRIVE_DIR)
    : DEFAULT_BASE_DRIVE;

  const files = await readdir(baseDrive);
  const present = new Set(files);
  const missing = DOCUMENTS.filter((document) => !present.has(document.file));
  if (missing.length) {
    console.warn(`Faltan ${missing.length} archivos esperados en ${baseDrive}:`);
    for (const document of missing) console.warn(`  - ${document.file}`);
  }

  const skipped = files.filter((file) => SKIPPED.has(file));
  console.log(`Base drive: ${baseDrive}`);
  console.log(`Ingesta: ${DOCUMENTS.length} documentos; omitidos: ${skipped.length}`);
  for (const file of skipped) console.log(`  omitido: ${file}`);

  if (dryRun) {
    for (const document of DOCUMENTS) {
      const path = join(baseDrive, document.file);
      const info = await stat(path);
      console.log(
        `  ${document.documentType.padEnd(14)} ${(info.size / 1024).toFixed(0).padStart(6)} KB  ${document.title}${document.ocr ? " [OCR]" : ""}`,
      );
    }
    return;
  }

  const supabaseUrl = required("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = required(
    "SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  );
  const workerUrl = required("INGEST_WORKER_URL").replace(/\/+$/, "");
  const email = required("INGEST_EMAIL");
  const password = required("INGEST_PASSWORD");

  const supabase = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (authError || !authData.session) {
    throw new Error(`No fue posible iniciar sesión: ${authError?.message ?? "sin sesión"}`);
  }

  const groupId = await resolveGroupId(supabase);
  console.log(`Grupo destino: ${groupId}`);
  console.log("Los documentos quedarán en revisión; no se publican automáticamente.\n");

  const token = authData.session.access_token;
  let created = 0;
  let skippedExisting = 0;
  let failed = 0;

  for (const document of DOCUMENTS) {
    const path = join(baseDrive, document.file);
    if (!present.has(document.file)) {
      failed += 1;
      continue;
    }

    const exists = await documentExists(supabase, groupId, document.title);
    if (exists) {
      skippedExisting += 1;
      console.log(`  ya existe  ${document.title}`);
      continue;
    }

    const bytes = await readFile(path);
    const form = new FormData();
    form.append("group_id", groupId);
    form.append("document_type", document.documentType);
    form.append("title", document.title);
    form.append("norm_number", document.normNumber);
    form.append("version_label", document.versionLabel);
    form.append(
      "file",
      new Blob([bytes], { type: mimeType(document.file) }),
      document.file,
    );

    process.stdout.write(`  procesando ${document.title}${document.ocr ? " [OCR]" : ""}... `);
    let response;
    try {
      response = await fetch(`${workerUrl}/ingest`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        body: form,
      });
    } catch (error) {
      console.log(`ERROR de conexión: ${error instanceof Error ? error.message : error}`);
      failed += 1;
      continue;
    }

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const message = payload?.error?.message ?? `HTTP ${response.status}`;
      if (/ya está registrado|already/i.test(message)) {
        skippedExisting += 1;
        console.log("ya existe");
      } else {
        failed += 1;
        console.log(`ERROR: ${message}`);
      }
      continue;
    }

    created += 1;
    const processing = payload?.processing;
    if (processing?.state === "error") {
      console.log(`registrado con error de procesamiento: ${processing.message}`);
    } else {
      console.log(`OK, ${processing?.chunk_count ?? 0} fragmentos`);
    }
  }

  console.log(
    `\nResumen: ${created} creados, ${skippedExisting} ya existentes, ${failed} fallidos.`,
  );
  console.log("Revisa, aprueba y publica en /admin/documents antes de consultar.");
}

async function resolveGroupId(supabase) {
  const explicit = process.env.INGEST_GROUP_ID?.trim();
  if (explicit) return explicit;

  const slug = process.env.INGEST_GROUP_SLUG?.trim() || "kpo";
  const { data, error } = await supabase
    .from("groups")
    .select("id, name")
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw new Error(`No fue posible resolver el grupo: ${error.message}`);
  if (!data) throw new Error(`No existe un grupo con slug "${slug}". Define INGEST_GROUP_ID.`);
  return data.id;
}

async function documentExists(supabase, groupId, title) {
  const { data, error } = await supabase
    .from("documents")
    .select("id")
    .eq("group_id", groupId)
    .eq("title", title)
    .limit(1);

  if (error) throw new Error(`No fue posible consultar documentos: ${error.message}`);
  return Boolean(data?.length);
}

function mimeType(file) {
  return extname(file).toLowerCase() === ".pdf"
    ? "application/pdf"
    : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
}

function required(...names) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  throw new Error(`Falta la variable de entorno ${names.join(" o ")}.`);
}

main().catch((error) => {
  console.error(`\nError: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
