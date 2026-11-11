#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const MAX_PDF_BYTES = 26214400;
const MIN_TEXT_CHARS = 1200;
const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131 Safari/537.36";
const JSON_ONLY = process.argv.includes("--json");
const REFRESH = process.argv.includes("--refresh");
const ONLY = process.argv.find((arg) => arg.startsWith("--only="))?.slice(7);
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const CACHE_DIR = resolve(process.env.DEMO_PDF_DIR ?? join(ROOT, "data/demo-pdfs"));
const REPORT_PATH = join(
  process.env.DEMO_VALIDATION_DIR ?? "/tmp/opencode",
  "demo-corpus-report.json",
);

const manifest = JSON.parse(
  await readFile(join(ROOT, "data/demo-corpus.json"), "utf8"),
);
const documents = ONLY
  ? manifest.documents.filter((document) => document.normNumber === ONLY)
  : manifest.documents;

if (!documents.length) {
  console.error(`No hay documentos para validar${ONLY ? ` con --only=${ONLY}` : ""}.`);
  process.exit(1);
}

async function commandAvailable(command, args = ["--version"]) {
  try {
    await execFileAsync(command, args, { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

const hasCurl = await commandAvailable("curl");
const hasPdfInfo = await commandAvailable("pdfinfo", ["-v"]);
const hasPdfToText = await commandAvailable("pdftotext", ["-v"]);
if (!hasPdfInfo || !hasPdfToText) {
  console.error("Faltan pdfinfo o pdftotext. Instala poppler-utils para validar el corpus.");
  process.exit(1);
}

await mkdir(CACHE_DIR, { recursive: true });
const seenHashes = new Map();
const results = [];

function log(message) {
  if (!JSON_ONLY) console.log(message);
}

function safeFileName(document) {
  return `${document.normNumber
    .normalize("NFKD")
    .replace(/[^\w-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80)}.pdf`;
}

function isPdf(bytes) {
  return bytes.subarray(0, 5).equals(Buffer.from("%PDF-"));
}

async function downloadWithCurl(document, filePath) {
  if (!hasCurl) throw new Error("curl no está disponible");

  const partPath = `${filePath}.part`;
  if (REFRESH) await rm(partPath, { force: true });

  const args = [
    "--location",
    "--silent",
    "--show-error",
    "--retry",
    "6",
    "--retry-delay",
    "3",
    "--retry-all-errors",
    "--continue-at",
    "-",
    "--http1.1",
    "--connect-timeout",
    "25",
    "--max-time",
    "300",
    "--user-agent",
    USER_AGENT,
    "--output",
    partPath,
    "--write-out",
    "%{http_code} %{content_type} %{size_download}",
    document.url,
  ];

  let stdout;
  try {
    ({ stdout } = await execFileAsync("curl", args, {
      maxBuffer: 1024 * 1024,
      timeout: 330000,
    }));
  } catch (error) {
    const detail = error.stderr || error.message;
    throw new Error(`curl: ${String(detail).trim()}`);
  }

  const [status, contentType = ""] = String(stdout).trim().split(/\s+/);
  if (status !== "200" && status !== "206") {
    throw new Error(`HTTP ${status || "desconocido"}`);
  }

  const info = await stat(partPath);
  if (info.size === 0) throw new Error("Descarga vacía");
  await rename(partPath, filePath);
  return { contentType, downloadedFrom: "curl" };
}

async function downloadWithFetch(document, filePath) {
  const response = await fetch(document.url, {
    redirect: "follow",
    headers: {
      "user-agent": USER_AGENT,
      accept: "application/pdf,*/*;q=0.8",
    },
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length) throw new Error("Descarga vacía");
  await writeFile(filePath, bytes);
  return { contentType, downloadedFrom: "fetch" };
}

async function ensurePdf(document, filePath) {
  if (!REFRESH) {
    try {
      const bytes = await readFile(filePath);
      if (bytes.length > 0 && isPdf(bytes)) {
        return { contentType: "application/pdf", downloadedFrom: "cache" };
      }
    } catch {
      log(`  Sin caché local para ${document.normNumber}`);
    }
  }

  await rm(filePath, { force: true });
  log(`  Descargando ${document.shortTitle ?? document.title}`);

  try {
    return await downloadWithCurl(document, filePath);
  } catch (curlError) {
    log(`  curl falló (${curlError.message}); probando fetch`);
    try {
      return await downloadWithFetch(document, filePath);
    } catch (fetchError) {
      throw new Error(`${curlError.message}; fetch: ${fetchError.message}`);
    }
  }
}

async function inspectPdf(bytes, filePath) {
  const sourceHash = createHash("sha256").update(bytes).digest("hex");
  const info = await execFileAsync("pdfinfo", [filePath], {
    maxBuffer: 1024 * 1024,
    timeout: 30000,
  });
  const pagesMatch = info.stdout.match(/^Pages:\s+(\d+)/m);
  const pages = pagesMatch ? Number(pagesMatch[1]) : 0;

  const text = await execFileAsync("pdftotext", ["-layout", filePath, "-"], {
    maxBuffer: 64 * 1024 * 1024,
    timeout: 120000,
  });
  const textChars = text.stdout.replace(/\s+/g, " ").trim().length;

  return { sourceHash, pages, textChars };
}

for (const [index, document] of documents.entries()) {
  const prefix = `[${String(index + 1).padStart(2, "0")}/${documents.length}]`;
  const filePath = join(CACHE_DIR, safeFileName(document));
  const result = {
    normNumber: document.normNumber,
    title: document.title,
    category: document.category,
    url: document.url,
    cachedPath: filePath,
    downloadedFrom: null,
    contentType: null,
    ok: false,
    sourceHash: null,
    pages: null,
    textChars: null,
    bytes: null,
    error: null,
  };

  try {
    const download = await ensurePdf(document, filePath);
    result.downloadedFrom = download.downloadedFrom;
    result.contentType = download.contentType;

    const bytes = await readFile(filePath);
    result.bytes = bytes.length;

    if (bytes.length > MAX_PDF_BYTES) {
      await rm(filePath, { force: true });
      throw new Error(`Supera 25 MB (${bytes.length} bytes)`);
    }
    if (!isPdf(bytes)) {
      await rm(filePath, { force: true });
      throw new Error(`No parece un PDF (${download.contentType || "sin content-type"})`);
    }
    if (document.expectedBytes) {
      const tolerance = Math.max(50000, document.expectedBytes * 0.1);
      if (Math.abs(bytes.length - document.expectedBytes) > tolerance) {
        throw new Error(
          `Tamaño inesperado: ${bytes.length} bytes (esperado ~${document.expectedBytes})`,
        );
      }
    }

    const inspection = await inspectPdf(bytes, filePath);
    result.sourceHash = inspection.sourceHash;
    result.pages = inspection.pages;
    result.textChars = inspection.textChars;

    if (inspection.pages < 2) {
      throw new Error(`Solo ${inspection.pages} página(s)`);
    }
    if (inspection.textChars < MIN_TEXT_CHARS) {
      throw new Error(`Capa de texto insuficiente (${inspection.textChars} caracteres)`);
    }

    const previous = seenHashes.get(inspection.sourceHash);
    if (previous) {
      throw new Error(`Duplicado de ${previous}`);
    }
    seenHashes.set(inspection.sourceHash, document.normNumber);

    result.ok = true;
    log(
      `${prefix} OK ${(bytes.length / 1024).toFixed(0).padStart(6)} KB · ` +
        `${String(inspection.pages).padStart(4)} pág. · ` +
        `${String(inspection.textChars).padStart(7)} caracteres · ` +
        `${document.shortTitle} (${download.downloadedFrom})`,
    );
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
    log(`${prefix} ERROR ${document.shortTitle}: ${result.error}`);
  }

  results.push(result);
}

const accepted = results.filter((result) => result.ok);
const rejected = results.filter((result) => !result.ok);
const totalBytes = accepted.reduce((sum, result) => sum + result.bytes, 0);
const totalPages = accepted.reduce((sum, result) => sum + result.pages, 0);
const byCategory = Object.fromEntries(
  manifest.categories.map((category) => [
    category.key,
    accepted.filter((result) => result.category === category.key).length,
  ]),
);

const report = {
  generatedAt: new Date().toISOString(),
  group: manifest.group,
  cacheDir: CACHE_DIR,
  total: results.length,
  accepted: accepted.length,
  rejected: rejected.length,
  totalBytes,
  totalPages,
  byCategory,
  results,
};

await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");

if (JSON_ONLY) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(
    `\nAceptados: ${accepted.length}/${results.length} · ` +
      `${(totalBytes / 1024 / 1024).toFixed(1)} MB · ${totalPages} páginas`,
  );
  console.log(
    `Categorías: ${Object.entries(byCategory)
      .map(([key, count]) => `${key}=${count}`)
      .join(", ")}`,
  );
  console.log(`Caché: ${CACHE_DIR}`);
  console.log(`Reporte: ${REPORT_PATH}`);
  if (rejected.length) {
    console.log("\nRechazados:");
    for (const result of rejected) {
      console.log(`- ${result.normNumber}: ${result.error}`);
    }
  }
}

if (rejected.length) process.exitCode = 1;
