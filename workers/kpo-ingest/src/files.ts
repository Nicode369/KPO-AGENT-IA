import { HttpError } from "./http";

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d];
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

type DocumentKind = "pdf" | "docx";

interface KindDefinition {
  kind: DocumentKind;
  extension: string;
  contentType: string;
  magic: number[];
}

const KINDS: Record<string, KindDefinition> = {
  pdf: {
    kind: "pdf",
    extension: "pdf",
    contentType: "application/pdf",
    magic: PDF_MAGIC,
  },
  docx: {
    kind: "docx",
    extension: "docx",
    contentType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    magic: ZIP_MAGIC,
  },
};

export interface ValidatedFile {
  kind: DocumentKind;
  extension: string;
  contentType: string;
  bytes: ArrayBuffer;
  sha256: string;
  size: number;
  title: string;
}

export async function validateDocumentFile(
  file: File,
  maxBytes: number
): Promise<ValidatedFile> {
  if (file.size <= 0) {
    throw new HttpError(400, "empty_file", "El archivo está vacío.");
  }

  if (file.size > maxBytes) {
    throw new HttpError(
      413,
      "file_too_large",
      `El archivo supera el límite de ${maxBytes} bytes.`
    );
  }

  const extension = fileExtension(file.name);
  const definition = KINDS[extension];
  if (!definition) {
    throw new HttpError(
      415,
      "unsupported_file_type",
      "Solo se aceptan archivos PDF o DOCX."
    );
  }

  const providedType = (file.type || "").split(";")[0].trim().toLowerCase();
  const genericType =
    providedType === "" || providedType === "application/octet-stream";
  if (!genericType && providedType !== definition.contentType) {
    throw new HttpError(
      415,
      "mime_mismatch",
      "El tipo MIME no corresponde con la extensión del archivo."
    );
  }

  let bytes = await file.arrayBuffer();

  if (definition.kind === "pdf") {
    const offset = pdfHeaderOffset(bytes);
    if (offset > 0) {
      bytes = new Uint8Array(bytes).slice(offset).buffer;
    }
  }

  const header = new Uint8Array(bytes, 0, Math.min(8, bytes.byteLength));
  const signatureValid = definition.magic.every(
    (value, index) => header[index] === value
  );

  if (!signatureValid) {
    throw new HttpError(
      415,
      "invalid_file_signature",
      "La firma del archivo no corresponde con un PDF o DOCX válido."
    );
  }

  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const sha256 = [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");

  return {
    kind: definition.kind,
    extension: definition.extension,
    contentType: definition.contentType,
    bytes,
    sha256,
    size: bytes.byteLength,
    title: safeTitle(file.name),
  };
}

function pdfHeaderOffset(bytes: ArrayBuffer): number {
  const view = new Uint8Array(bytes);
  const limit = Math.min(view.length - PDF_MAGIC.length, 1024);

  for (let offset = 0; offset <= limit; offset += 1) {
    const matches = PDF_MAGIC.every(
      (value, index) => view[offset + index] === value
    );
    if (matches) return offset;
  }

  return -1;
}

function fileExtension(name: string): string {
  const trimmed = name.trim();
  const dot = trimmed.lastIndexOf(".");
  if (dot <= 0 || dot === trimmed.length - 1) {
    return "";
  }
  return trimmed.slice(dot + 1).toLowerCase();
}

function safeTitle(name: string): string {
  const base = name.split(/[\\/]/).pop()?.trim() || "documento";
  return base.slice(0, 200);
}
