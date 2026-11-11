#!/usr/bin/env node
import { randomBytes, createHash } from "node:crypto";
import { chmod, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

import { seedQuestionSuggestions } from "./lib/question-suggestions.mjs";

const APPLY = process.argv.includes("--apply");
const ROTATE = process.argv.includes("--rotate");
const REPLACE = process.argv.includes("--replace");
const SKIP_DOCUMENTS = process.argv.includes("--skip-documents");
const TEMP_DIR = "/tmp/opencode";
const MAX_PDF_BYTES = 26214400;
const DEFAULT_WORKER_URL = "https://kpo-ingest.nicode.workers.dev";
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const CACHE_DIR = resolve(process.env.DEMO_PDF_DIR ?? join(ROOT, "data/demo-pdfs"));
const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131 Safari/537.36";
const manifest = JSON.parse(
  await readFile(join(ROOT, "data/demo-corpus.json"), "utf8"),
);
const questionSuggestions = JSON.parse(
  await readFile(join(ROOT, "data/question-suggestions.json"), "utf8"),
);

const GROUP = {
  name: manifest.group.name,
  slug: manifest.group.slug,
  reuseGroupId: manifest.group.reuseGroupId ?? null,
  replaceSlug: manifest.group.replaceSlug ?? null,
};

const USERS = manifest.users;
const DOCUMENTS = manifest.documents;
const KPO_GROUP_SLUG = process.env.DEMO_KPO_GROUP_SLUG?.trim() || "kpo";
const KPO_DEMO_USER = {
  key: "kpo",
  email:
    process.env.DEMO_KPO_EMAIL?.trim().toLowerCase() || "demo.kpo@example.com",
  fullName: "Analista Demo KPO",
  role: "analyst",
};

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

function hashInvitation(code) {
  return createHash("sha256").update(code, "utf8").digest("hex");
}

function makePassword() {
  return randomBytes(18).toString("base64url");
}

function makeInvitationCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(6);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function safeFileName(document) {
  return `${document.normNumber
    .normalize("NFKD")
    .replace(/[^\w-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80)}.pdf`;
}

function validatePdfBytes(document, bytes, source) {
  if (bytes.length > MAX_PDF_BYTES) {
    throw new Error(`El PDF supera el límite de 25 MB (${source}): ${document.title}`);
  }
  if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
    throw new Error(`El recurso no parece un PDF (${source}): ${document.title}`);
  }
  return bytes;
}

async function fetchPdf(document) {
  const filePath = join(CACHE_DIR, safeFileName(document));
  try {
    const cached = await readFile(filePath);
    return validatePdfBytes(document, cached, "caché local");
  } catch (error) {
    if (error instanceof Error && !error.message.includes("ENOENT")) throw error;
  }

  log(`Descargando PDF: ${document.title}`);
  const response = await fetch(document.url, {
    method: "GET",
    redirect: "follow",
    headers: {
      "user-agent": USER_AGENT,
      accept: "application/pdf,*/*;q=0.8",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} al descargar ${document.url}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  validatePdfBytes(document, bytes, document.url);
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(filePath, bytes);
  return bytes;
}

async function inspectPdf(document) {
  const bytes = await fetchPdf(document);
  return { length: bytes.length, contentType: "application/pdf" };
}

async function findGroup(service, column, value) {
  if (!value) return null;
  const { data, error } = await service
    .from("groups")
    .select("id,name,slug,is_active")
    .eq(column, value)
    .maybeSingle();
  if (error) throw new Error(`No se pudo consultar el grupo demo: ${error.message}`);
  return data ?? null;
}

async function ensureGroup(service) {
  let existing = await findGroup(service, "id", GROUP.reuseGroupId);
  if (!existing) existing = await findGroup(service, "slug", GROUP.slug);
  if (!existing && GROUP.replaceSlug) {
    existing = await findGroup(service, "slug", GROUP.replaceSlug);
  }

  if (existing) {
    const needsUpdate =
      !existing.is_active ||
      existing.name !== GROUP.name ||
      existing.slug !== GROUP.slug;

    if (needsUpdate) {
      if (APPLY) {
        const conflict = await findGroup(service, "slug", GROUP.slug);
        if (conflict && conflict.id !== existing.id) {
          throw new Error(
            `Ya existe otro grupo con el slug ${GROUP.slug} (${conflict.id}).`,
          );
        }
        const { error: updateError } = await service
          .from("groups")
          .update({
            name: GROUP.name,
            slug: GROUP.slug,
            is_active: true,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
        if (updateError) {
          throw new Error(`No se pudo actualizar el grupo demo: ${updateError.message}`);
        }
        log(`Grupo actualizado: ${GROUP.name} [${GROUP.slug}] (${existing.id})`);
        return { ...existing, name: GROUP.name, slug: GROUP.slug, is_active: true };
      }
      log(
        `Actualizar grupo: ${existing.name} [${existing.slug}] → ` +
          `${GROUP.name} [${GROUP.slug}] (${existing.id})`,
      );
    } else {
      log(`Grupo existente: ${GROUP.name} [${GROUP.slug}] (${existing.id})`);
    }
    return existing;
  }

  if (!APPLY) {
    log(`Crear grupo: ${GROUP.name} [${GROUP.slug}]`);
    return null;
  }

  const { data, error: insertError } = await service
    .from("groups")
    .insert({ name: GROUP.name, slug: GROUP.slug, is_active: true })
    .select("id,name,slug,is_active")
    .single();

  if (insertError || !data) {
    throw new Error(`No se pudo crear el grupo demo: ${insertError?.message ?? "sin datos"}`);
  }

  log(`Grupo creado: ${data.name} (${data.id})`);
  return data;
}

async function findSuperadminId(service) {
  const { data, error } = await service
    .from("profiles")
    .select("id")
    .eq("is_superadmin", true)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`No se pudo resolver el superadmin: ${error.message}`);
  return data?.id ?? null;
}

async function findProfileByEmail(service, email) {
  const { data, error } = await service
    .from("profiles")
    .select("id,email,full_name,is_active")
    .eq("email", email.toLowerCase())
    .maybeSingle();

  if (error) throw new Error(`No se pudo consultar el perfil ${email}: ${error.message}`);
  return data ?? null;
}

async function findAuthUserByEmail(service, email) {
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`No se pudo listar usuarios: ${error.message}`);
    const match = data.users.find(
      (user) => user.email?.toLowerCase() === email.toLowerCase(),
    );
    if (match) return match;
    if (data.users.length < perPage) return null;
    page += 1;
  }
}

async function ensureMembership(service, userId, groupId, role, groupSlug) {
  const { data: existing, error } = await service
    .from("group_memberships")
    .select("id,role,status")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`No se pudo consultar la membresía demo: ${error.message}`);
  }

  if (existing) {
    if (existing.role === role && existing.status === "active") {
      log(`Membresía existente: ${role} en ${groupSlug}`);
      return false;
    }

    if (APPLY) {
      const { error: updateError } = await service
        .from("group_memberships")
        .update({ role, status: "active", updated_at: new Date().toISOString() })
        .eq("id", existing.id);
      if (updateError) {
        throw new Error(`No se pudo actualizar la membresía demo: ${updateError.message}`);
      }
      log(`Membresía actualizada: ${role} en ${groupSlug}`);
    } else {
      log(`Actualizar membresía: ${role} en ${groupSlug}`);
    }
    return true;
  }

  if (!APPLY) {
    log(`Crear membresía: ${role} en ${groupSlug}`);
    return true;
  }

  const { error: insertError } = await service
    .from("group_memberships")
    .insert({ group_id: groupId, user_id: userId, role, status: "active" });

  if (insertError) {
    throw new Error(`No se pudo crear la membresía demo: ${insertError.message}`);
  }

  log(`Membresía creada: ${role} en ${groupSlug}`);
  return true;
}

async function ensureUser(
  service,
  user,
  groupId,
  superadminId,
  credentials,
  existingPasswords = new Map(),
  groupSlug = GROUP.slug,
) {
  const profile = await findProfileByEmail(service, user.email);
  const authUser = profile ? null : await findAuthUserByEmail(service, user.email);
  const userId = profile?.id ?? authUser?.id ?? null;
  const password =
    process.env[`DEMO_${user.key.toUpperCase()}_PASSWORD`]?.trim() ||
    makePassword();

  if (userId) {
    log(`Usuario existente: ${user.email} (${userId})`);
    if (ROTATE) {
      if (!APPLY) {
        log(`Rotar contraseña: ${user.email}`);
      } else {
        const { error } = await service.auth.admin.updateUserById(userId, {
          password,
          email_confirm: true,
        });
        if (error) {
          throw new Error(`No se pudo rotar la contraseña de ${user.email}: ${error.message}`);
        }
        credentials.push({ ...user, password, existing: true, rotated: true, groupSlug });
        log(`Contraseña rotada: ${user.email}`);
      }
    } else {
      const knownPassword =
        process.env[`DEMO_${user.key.toUpperCase()}_PASSWORD`] ??
        existingPasswords.get(user.email.toLowerCase()) ??
        null;

      if (knownPassword) {
        credentials.push({
          ...user,
          password: knownPassword,
          existing: true,
          rotated: false,
          groupSlug,
        });
        log(`Contraseña reutilizada: ${user.email}`);
      } else {
        log(
          `Sin contraseña conocida para ${user.email}; usa --rotate para generarla.`,
        );
      }
    }
    if (groupId) {
      await ensureMembership(service, userId, groupId, user.role, groupSlug);
    } else {
      log(`Asegurar membresía: ${user.role} en ${groupSlug}`);
    }
    return userId;
  }

  if (!APPLY) {
    log(`Crear usuario: ${user.email} [${user.role}]`);
    return null;
  }

  const code = makeInvitationCode();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  const { data: invitation, error: inviteError } = await service
    .from("invitations")
    .insert({
      group_id: groupId,
      role: user.role,
      code,
      code_hash: hashInvitation(code),
      max_uses: 1,
      use_count: 0,
      expires_at: expiresAt,
      created_by: superadminId,
    })
    .select("id")
    .single();

  if (inviteError || !invitation) {
    throw new Error(
      `No se pudo crear la invitación de ${user.email}: ${inviteError?.message ?? "sin datos"}`,
    );
  }

  const { data: created, error: createError } = await service.auth.admin.createUser({
    email: user.email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: user.fullName,
      invitation_code: code,
    },
  });

  if (createError || !created.user) {
    await service.from("invitations").delete().eq("id", invitation.id);
    throw new Error(
      `No se pudo crear ${user.email}: ${createError?.message ?? "sin usuario"}`,
    );
  }

  await service
    .from("invitations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", invitation.id);

  await ensureMembership(service, created.user.id, groupId, user.role, groupSlug);
  credentials.push({ ...user, password, existing: false, rotated: false, groupSlug });
  log(`Usuario creado: ${user.email} [${user.role}]`);
  return created.user.id;
}

async function signInDemoAdmin(url, anonKey, email, password) {
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    throw new Error(`No se pudo iniciar sesión como ${email}: ${error?.message ?? "sin sesión"}`);
  }
  return { client, token: data.session.access_token };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function existingDocument(service, groupId, title) {
  const { data, error } = await service
    .from("documents")
    .select("id,title,status,published_version_id,version,processing_error")
    .eq("group_id", groupId)
    .eq("title", title)
    .maybeSingle();

  if (error) throw new Error(`No se pudo consultar el documento demo: ${error.message}`);
  return data ?? null;
}

async function waitForDocument(service, groupId, title, attempts = 6) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const document = await existingDocument(service, groupId, title);
    if (document) return document;
    await sleep(1000);
  }
  return null;
}

async function publishExisting(client, document) {
  if (document.published_version_id) return "published";

  if (document.status === "pending_review") {
    const { error } = await client.rpc("approve_document", {
      p_document_id: document.id,
      p_notes: "Documento público para demo de portafolio.",
    });
    if (error) throw new Error(`No se pudo aprobar ${document.title}: ${error.message}`);
  }

  if (document.status === "approved" || document.status === "pending_review") {
    const { error } = await client.rpc("publish_document", {
      p_document_id: document.id,
    });
    if (error) throw new Error(`No se pudo publicar ${document.title}: ${error.message}`);
    return "published";
  }

  throw new Error(
    `El documento ${document.title} está en estado ${document.status} y no se puede publicar.`,
  );
}

async function resetForReprocessing(service, document) {
  const { data: version, error: versionError } = await service
    .from("document_versions")
    .select("id")
    .eq("document_id", document.id)
    .eq("version", document.version)
    .maybeSingle();

  if (versionError) {
    throw new Error(`No se pudo leer la versión de ${document.title}: ${versionError.message}`);
  }

  if (version) {
    const { error: chunkError } = await service
      .from("document_chunks")
      .delete()
      .eq("version_id", version.id);
    if (chunkError) {
      throw new Error(`No se pudieron limpiar fragmentos de ${document.title}: ${chunkError.message}`);
    }

    const { error: updateVersionError } = await service
      .from("document_versions")
      .update({
        status: "uploaded",
        chunk_count: 0,
        processed_at: null,
        extracted_bucket: null,
        extracted_path: null,
        processing_error: null,
      })
      .eq("id", version.id);
    if (updateVersionError) {
      throw new Error(`No se pudo reiniciar la versión de ${document.title}: ${updateVersionError.message}`);
    }
  }

  const { error: updateDocumentError } = await service
    .from("documents")
    .update({ status: "uploaded", processing_error: null })
    .eq("id", document.id);
  if (updateDocumentError) {
    throw new Error(`No se pudo reiniciar ${document.title}: ${updateDocumentError.message}`);
  }

  log(`Reprocesando: ${document.title}`);
}

async function processDocument(client, token, document) {
  const workerUrl = `${process.env.DEMO_WORKER_URL?.replace(/\/+$/, "") || DEFAULT_WORKER_URL}/documents/${document.id}/process`;
  const response = await fetch(workerUrl, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      `No se pudo procesar ${document.title}: ${payload?.error?.message ?? `HTTP ${response.status}`}`,
    );
  }
  return payload;
}

async function handleExistingDocument(service, client, token, groupId, document) {
  let current = document;
  if (current.status === "published" || current.published_version_id) {
    log(`Documento ya publicado: ${current.title}`);
    return { skipped: true, documentId: current.id };
  }

  if (current.status === "processing") {
    await sleep(3000);
    current = await existingDocument(service, groupId, current.title) ?? current;
  }

  if (current.status === "processing" || current.status === "uploaded" || current.status === "error" || current.status === "rejected") {
    await resetForReprocessing(service, current);
    const processed = await processDocument(client, token, current);
    log(
      `Documento reprocesado: ${current.title} (${processed?.chunk_count ?? 0} fragmentos)`,
    );
    current = await existingDocument(service, groupId, current.title) ?? current;
  }

  if (current.status === "pending_review" || current.status === "approved") {
    await publishExisting(client, current);
    log(`Documento publicado: ${current.title}`);
    return { skipped: true, documentId: current.id };
  }

  if (current.status === "published") {
    log(`Documento ya publicado: ${current.title}`);
    return { skipped: true, documentId: current.id };
  }

  throw new Error(`Estado inesperado para ${current.title}: ${current.status}`);
}

function buildIngestForm(groupId, document, bytes) {
  const form = new FormData();
  form.append("group_id", groupId);
  form.append("document_type", document.documentType);
  form.append("title", document.title);
  form.append("norm_number", document.normNumber);
  form.append("version_label", document.versionLabel);
  form.append(
    "file",
    new Blob([bytes], { type: "application/pdf" }),
    `${document.normNumber.replace(/[^a-z0-9-]+/gi, "-")}.pdf`,
  );
  return form;
}

async function ingestDocument(service, client, token, groupId, document) {
  let existing = await existingDocument(service, groupId, document.title);
  if (existing) {
    return handleExistingDocument(service, client, token, groupId, existing);
  }

  const bytes = await fetchPdf(document);
  const workerUrl = `${process.env.DEMO_WORKER_URL?.replace(/\/+$/, "") || DEFAULT_WORKER_URL}/ingest`;
  let lastMessage = "sin respuesta";

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const response = await fetch(workerUrl, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: buildIngestForm(groupId, document, bytes),
    });

    const payload = await response.json().catch(() => null);
    if (response.ok) {
      const documentId = payload?.document?.id;
      if (!documentId) {
        throw new Error(`La ingesta de ${document.title} no devolvió document id.`);
      }

      if (payload?.processing?.state === "error") {
        throw new Error(
          `Procesamiento falló para ${document.title}: ${payload.processing.message}`,
        );
      }

      log(
        `Documento ingerido: ${document.title} (${payload?.processing?.chunk_count ?? 0} fragmentos)`,
      );

      existing = await existingDocument(service, groupId, document.title);
      if (existing) {
        await publishExisting(client, existing);
        log(`Documento publicado: ${document.title}`);
      }
      return { skipped: false, documentId };
    }

    lastMessage = payload?.error?.message ?? `HTTP ${response.status}`;
    if (response.status === 409) {
      existing = await waitForDocument(service, groupId, document.title);
      if (existing) {
        log(`Documento ya registrado; continuando: ${document.title}`);
        return handleExistingDocument(service, client, token, groupId, existing);
      }
    }

    if (response.status === 503) {
      await sleep(5000);
      existing = await waitForDocument(service, groupId, document.title, 10);
      if (existing) {
        log(`El Worker cortó la respuesta; recuperando: ${document.title}`);
        return handleExistingDocument(service, client, token, groupId, existing);
      }
    }
  }

  throw new Error(`No se pudo ingerir ${document.title}: ${lastMessage}`);
}

async function listGroupDocuments(service, groupId) {
  const { data, error } = await service
    .from("documents")
    .select(
      "id,title,norm_number,status,published_version_id,source_bucket,source_path",
    )
    .eq("group_id", groupId);

  if (error) throw new Error(`No se pudieron listar los documentos demo: ${error.message}`);
  return data ?? [];
}

async function verifyCorpusPublished(service, groupId) {
  const documents = await listGroupDocuments(service, groupId);
  const missing = DOCUMENTS.filter((expected) => {
    const current = documents.find((document) => document.title === expected.title);
    return !current || (!current.published_version_id && current.status !== "published");
  });

  if (missing.length) {
    throw new Error(
      `Faltan documentos publicados antes de reemplazar:\n- ${missing
        .map((document) => document.title)
        .join("\n- ")}`,
    );
  }

  return documents;
}

async function deleteObsoleteDocuments(service, groupId, groupDocuments) {
  const keep = new Set(DOCUMENTS.map((document) => document.title));
  const obsolete = groupDocuments.filter((document) => !keep.has(document.title));
  if (!obsolete.length) {
    log("No hay documentos antiguos por eliminar.");
    return [];
  }

  const ids = obsolete.map((document) => document.id);
  const { data: versions, error: versionError } = await service
    .from("document_versions")
    .select("document_id,extracted_bucket,extracted_path")
    .in("document_id", ids);

  if (versionError) {
    throw new Error(`No se pudieron leer las versiones antiguas: ${versionError.message}`);
  }

  const removals = new Map();
  const addRemoval = (bucket, path) => {
    if (!bucket || !path) return;
    if (!removals.has(bucket)) removals.set(bucket, new Set());
    removals.get(bucket).add(path);
  };

  for (const document of obsolete) {
    addRemoval(document.source_bucket, document.source_path);
  }
  for (const version of versions ?? []) {
    addRemoval(version.extracted_bucket, version.extracted_path);
  }

  const { error: deleteError } = await service
    .from("documents")
    .delete()
    .in("id", ids);

  if (deleteError) {
    throw new Error(`No se pudieron eliminar los documentos antiguos: ${deleteError.message}`);
  }

  for (const [bucket, paths] of removals) {
    const { error } = await service.storage.from(bucket).remove([...paths]);
    if (error) {
      log(`Advertencia: no se pudieron borrar ${paths.size} archivo(s) de ${bucket}: ${error.message}`);
    }
  }

  log(`Documentos antiguos eliminados: ${obsolete.map((document) => document.title).join(", ")}`);
  return obsolete;
}

async function seedGroupQuestions(service, group, slug) {
  const questions = questionSuggestions[slug];
  if (!Array.isArray(questions) || !questions.length) return;

  try {
    const count = await seedQuestionSuggestions(service, group, questions);
    log(`Preguntas sugeridas de ${slug}: ${count}.`);
  } catch (error) {
    log(
      `Advertencia: no se sembraron preguntas de ${slug}. ` +
        `Aplica la migración 202611120005 si falta: ${error instanceof Error ? error.message : error}`,
    );
  }
}

async function ensureSimulatorCases(service, groupId) {
  const cases = Array.isArray(manifest.evaluationCases) ? manifest.evaluationCases : [];
  if (!cases.length) return;

  const documents = await listGroupDocuments(service, groupId);
  const documentByTitle = new Map(
    documents.map((document) => [document.title, document.id]),
  );
  const { data: existing, error } = await service
    .from("simulator_cases")
    .select("id,title")
    .eq("group_id", groupId);
  if (error) {
    throw new Error(`No se pudieron leer los casos del simulador: ${error.message}`);
  }
  const existingByTitle = new Map((existing ?? []).map((item) => [item.title, item.id]));

  let created = 0;
  let updated = 0;
  for (const item of cases) {
    const expectedDocumentId = item.expectedDocumentTitle
      ? documentByTitle.get(item.expectedDocumentTitle) ?? null
      : null;
    const row = {
      group_id: groupId,
      title: item.title,
      question: item.question,
      expected_outcome: item.expectedOutcome,
      expected_document_id: expectedDocumentId,
      expected_terms: Array.isArray(item.expectedTerms) ? item.expectedTerms : [],
      notes: item.notes ?? null,
      is_active: true,
    };
    const id = existingByTitle.get(item.title);
    if (id) {
      const { error: updateError } = await service
        .from("simulator_cases")
        .update(row)
        .eq("id", id);
      if (updateError) {
        throw new Error(`No se pudo actualizar el caso ${item.title}: ${updateError.message}`);
      }
      updated += 1;
    } else {
      const { error: insertError } = await service
        .from("simulator_cases")
        .insert(row);
      if (insertError) {
        throw new Error(`No se pudo crear el caso ${item.title}: ${insertError.message}`);
      }
      created += 1;
    }
  }

  log(`Casos del simulador: ${created} creados, ${updated} actualizados.`);
}

async function loadLatestCredentials() {
  let files = [];
  try {
    files = (await readdir(TEMP_DIR))
      .filter((file) => /^demo-credentials-.*\.json$/.test(file))
      .sort()
      .reverse();
  } catch {
    return new Map();
  }

  if (!files.length) return new Map();

  try {
    const payload = JSON.parse(
      await readFile(join(TEMP_DIR, files[0]), "utf8"),
    );
    return new Map(
      (payload.users ?? []).map((user) => [user.email.toLowerCase(), user.password]),
    );
  } catch {
    return new Map();
  }
}

async function writeCredentialsFile(credentials, groupId) {
  await mkdir(TEMP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = join(TEMP_DIR, `demo-credentials-${stamp}.json`);
  const payload = {
    generatedAt: new Date().toISOString(),
    group: { name: GROUP.name, slug: GROUP.slug, id: groupId },
    app: "https://kpo-agent-ai.vercel.app/login",
    users: credentials.map((user) => ({
      role: user.role,
      email: user.email,
      password: user.password,
      group: user.groupSlug ?? GROUP.slug,
      public: user.role === "analyst",
    })),
  };

  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await chmod(path, 0o600);
  return { path, payload };
}

async function main() {
  const supabaseUrl = required("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = required("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = required(
    "SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  );

  const service = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  log(`Grupo demo: ${GROUP.name} [${GROUP.slug}]`);
  log(`Worker: ${process.env.DEMO_WORKER_URL?.replace(/\/+$/, "") || DEFAULT_WORKER_URL}`);
  log(
    `Usuarios demo: ${[...USERS, KPO_DEMO_USER]
      .map((user) => `${user.email} (${user.role})`)
      .join(", ")}`,
  );
  log(`Documentos demo: ${DOCUMENTS.length}`);
  log(`Caché PDF: ${CACHE_DIR}`);
  log(`Reemplazo de documentos: ${REPLACE ? "sí" : "no"}`);

  for (const document of DOCUMENTS) {
    const info = await inspectPdf(document);
    log(
      `  PDF OK ${(info.length / 1024).toFixed(0).padStart(6)} KB · ${document.title}`,
    );
  }

  const group = await ensureGroup(service);
  const kpoGroup = await findGroup(service, "slug", KPO_GROUP_SLUG);
  if (!kpoGroup) {
    throw new Error(`No se encontró el grupo KPO con slug ${KPO_GROUP_SLUG}.`);
  }
  log(`Grupo KPO: ${kpoGroup.name} [${kpoGroup.slug}]`);
  const existingPasswords = await loadLatestCredentials();

  if (!APPLY) {
    for (const user of USERS) {
      await ensureUser(service, user, null, null, [], existingPasswords);
    }
    await ensureUser(
      service,
      KPO_DEMO_USER,
      null,
      null,
      [],
      existingPasswords,
      KPO_GROUP_SLUG,
    );
    log("Dry-run completado. Ejecuta con --apply para crear grupo, usuarios y documentos.");
    return;
  }

  const groupId = group.id;
  const superadminId = await findSuperadminId(service);
  if (!superadminId) {
    throw new Error("No se encontró un superadministrador activo para crear invitaciones.");
  }

  const credentials = [];
  for (const user of USERS) {
    await ensureUser(
      service,
      user,
      groupId,
      superadminId,
      credentials,
      existingPasswords,
    );
  }

  await ensureUser(
    service,
    KPO_DEMO_USER,
    kpoGroup.id,
    superadminId,
    credentials,
    existingPasswords,
    KPO_GROUP_SLUG,
  );

  const saved = await writeCredentialsFile(credentials, groupId);

  if (!SKIP_DOCUMENTS) {
    const admin = credentials.find((user) => user.role === "group_admin");
    if (!admin?.password) {
      throw new Error(
        "No hay contraseña disponible para el administrador demo. Usa --rotate para generarla.",
      );
    }

    const { client, token } = await signInDemoAdmin(
      supabaseUrl,
      anonKey,
      admin.email,
      admin.password,
    );

    const failures = [];
    for (const document of DOCUMENTS) {
      try {
        await ingestDocument(service, client, token, groupId, document);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push(`${document.title}: ${message}`);
        console.error(`[error] ${document.title}: ${message}`);
      }
    }

    if (failures.length) {
      throw new Error(
        `Fallaron ${failures.length} documento(s):\n- ${failures.join("\n- ")}`,
      );
    }

    if (REPLACE) {
      const groupDocuments = await verifyCorpusPublished(service, groupId);
      await deleteObsoleteDocuments(service, groupId, groupDocuments);
      const remaining = await listGroupDocuments(service, groupId);
      if (remaining.length !== DOCUMENTS.length) {
        throw new Error(
          `El grupo quedó con ${remaining.length} documentos; se esperaban ${DOCUMENTS.length}.`,
        );
      }
      log(`Grupo reemplazado: ${remaining.length} documentos vigentes.`);
    } else {
      const groupDocuments = await listGroupDocuments(service, groupId);
      const keep = new Set(DOCUMENTS.map((document) => document.title));
      const extra = groupDocuments.filter((document) => !keep.has(document.title));
      if (extra.length) {
        log(
          `Advertencia: hay ${extra.length} documento(s) fuera del manifiesto. ` +
            "Ejecuta con --replace para eliminarlos.",
        );
      }
    }
  } else {
    log("Documentos omitidos por --skip-documents.");
  }

  await ensureSimulatorCases(service, groupId);
  await seedGroupQuestions(service, group, GROUP.slug);
  await seedGroupQuestions(service, kpoGroup, KPO_GROUP_SLUG);

  console.log("\nCuentas demo:");
  for (const user of saved.payload.users) {
    console.log(
      `  ${user.public ? "pública " : "privada "} ${user.role.padEnd(12)} ${user.email} (${user.group})`,
    );
  }
  console.log(`\nContraseñas: ${saved.path}`);
  console.log("No confirmes este archivo en Git. Rota las contraseñas antes de una demo pública.");
}

main().catch((error) => {
  console.error(`\nError: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
