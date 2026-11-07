import { extractImages, extractText, getDocumentProxy } from "unpdf";

import { ocrMinTextChars, ocrModel, type Env } from "./env";
import { HttpError } from "./http";

export interface RasterImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  channels: number;
}

export const OCR_MAX_DIMENSION = 1400;
export const OCR_MAX_HEIGHT = 2400;
export const OCR_STRIP_THRESHOLD = 2200;
export const OCR_STRIP_HEIGHT = 850;
export const OCR_STRIP_OVERLAP = 80;
export const OCR_RETRY_DIMENSION = 900;
export const OCR_MAX_IMAGES_PER_PAGE = 4;
export const OCR_MAX_TOKENS = 4096;

export async function extractPdfMarkdown(
  env: Env,
  bytes: ArrayBuffer
): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const extracted = await extractText(pdf, { mergePages: false });

  if (!Array.isArray(extracted.text) || !extracted.text.length) {
    throw new HttpError(
      422,
      "empty_document",
      "El PDF no contiene páginas legibles."
    );
  }

  const minChars = ocrMinTextChars(env);
  const pages: string[] = [];
  let ocrPages = 0;

  for (let index = 0; index < extracted.text.length; index += 1) {
    const pageNumber = index + 1;
    const text = normalizePageText(extracted.text[index]);
    let pageText = text;

    if (text.length < minChars) {
      const images = (await extractImages(pdf, pageNumber)).slice(
        0,
        OCR_MAX_IMAGES_PER_PAGE
      );
      const ocrText: string[] = [];

      for (const image of images) {
        for (const strip of splitForOcr(image)) {
          const transcribed = await transcribeImage(env, strip);
          if (transcribed) ocrText.push(transcribed);
        }
      }

      if (ocrText.length) {
        pageText = mergeOcrText(ocrText);
        ocrPages += 1;
      }
    }

    if (pageText) {
      pages.push(`## Page ${pageNumber}\n\n${pageText}`);
    }
  }

  if (!pages.length) {
    throw new HttpError(
      422,
      "empty_document",
      "El PDF no contiene texto extraíble ni imágenes legibles."
    );
  }

  const markdown = pages.join("\n\n");
  return ocrPages > 0
    ? `${markdown}\n\n<!-- ocr_pages:${ocrPages} -->`
    : markdown;
}

async function transcribeImage(env: Env, image: RasterImage): Promise<string> {
  const model = ocrModel(env);

  try {
    return await transcribeAtSize(env, model, image);
  } catch (firstError) {
    const smaller = downscale(image, OCR_RETRY_DIMENSION);

    if (smaller.width === image.width && smaller.height === image.height) {
      logOcrFailure(model, image, firstError, null);
      throw new HttpError(
        502,
        "ocr_failed",
        "No fue posible transcribir una página escaneada."
      );
    }

    try {
      return await transcribeAtSize(env, model, smaller);
    } catch (secondError) {
      logOcrFailure(model, image, firstError, secondError);
      throw new HttpError(
        502,
        "ocr_failed",
        "No fue posible transcribir una página escaneada."
      );
    }
  }
}

async function transcribeAtSize(
  env: Env,
  model: string,
  image: RasterImage
): Promise<string> {
  const png = await encodePng(image);
  const dataUrl = `data:image/png;base64,${bytesToBase64(png)}`;
  const result = await runVision(env, model, dataUrl);
  return normalizeOcrText(responseText(result));
}

export async function runVision(
  env: Env,
  model: string,
  dataUrl: string
): Promise<unknown> {
  const system =
    "Eres un transcriptor OCR literal. Tu única tarea es convertir píxeles en texto. No eres un asistente conversacional. No saludes, no expliques, no pidas aclaraciones, no resumas y no uses Markdown. Devuelve únicamente el texto visible, empezando por la primera línea del documento.";
  const prompt =
    "Transcribe literalmente todo el texto visible en esta franja. No escribas introducciones como 'Aquí está el texto' ni comentarios. No uses negritas, viñetas ni bloques de código. Conserva el orden de lectura. Si no hay texto legible, responde con una cadena vacía.";

  const input = {
    messages: [
      { role: "system", content: system },
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      },
    ],
    max_tokens: OCR_MAX_TOKENS,
    temperature: 0,
  };

  try {
    return await env.AI.run(model, input as never);
  } catch (error) {
    if (!needsLicenseAcceptance(error)) throw error;
    await env.AI.run(model, { prompt: "agree" } as never);
    return env.AI.run(model, input as never);
  }
}

function needsLicenseAcceptance(error: unknown): boolean {
  const message = errorMessage(error).toLowerCase();
  return (
    message.includes("prior to using this model") &&
    message.includes("agree")
  );
}

function logOcrFailure(
  model: string,
  image: RasterImage,
  firstError: unknown,
  secondError: unknown | null
): void {
  console.error(
    JSON.stringify({
      service: "kpo-ingest",
      code: "ocr_failed",
      model,
      width: image.width,
      height: image.height,
      first_error: errorMessage(firstError),
      second_error: secondError === null ? null : errorMessage(secondError),
    })
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function responseText(result: unknown): string {
  if (typeof result === "string") return result;
  if (!result || typeof result !== "object") return "";

  const record = result as Record<string, unknown>;
  if (typeof record.response === "string") return record.response;
  if (typeof record.result === "string") return record.result;
  if (typeof record.text === "string") return record.text;

  const choices = record.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const choice = choices[0] as {
      message?: { content?: unknown };
      text?: unknown;
    };
    if (typeof choice?.message?.content === "string") {
      return choice.message.content;
    }
    if (typeof choice?.text === "string") return choice.text;
  }

  return "";
}

function normalizePageText(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeOcrText(value: string): string {
  const text = normalizePageText(value)
    .replace(/^```(?:text|markdown)?\s*/i, "")
    .replace(/\s*```$/, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/^\s*#{1,6}\s+/gm, "")
    .replace(/^\s*[*+-]\s+/gm, "");

  return stripAdministrativeStamp(stripAssistantPreamble(text)).trim();
}

function stripAdministrativeStamp(value: string): string {
  return value
    .split("\n")
    .filter((line) => {
      const text = line.trim();
      if (text === "Circular Externa") return false;
      return !/^(al contestar cite|a contestar a|fax externa|franja\s+\d|sociedad\s+\d|asunto\s+\d|sección\s+\d|anexos\s+\d|tipo documento|tipo documental|tipo:|familia:|remitente:|jesino:|folio:|fecha:|exp:|expediente:|consecutivo\s+\d|super\s*n[°º]?\s*tendencia|superintendencia de sociedades bogota$|en la superintendencia de sociedades trabajamos|www\.|webmaster@|línea (única|gratuita)|tel[:.]|pbx\b|calle\s+\d|carrera\s+\d|iso\s+\d|icontec\b|bogotá d\.c\. - colombia$)/i.test(
        text
      );
    })
    .join("\n");
}

function stripAssistantPreamble(value: string): string {
  const lines = value.split("\n");
  const markerIndex = lines.findIndex((line) =>
    /^(apreciados|estimados|señores|superintendencia|circular externa|circular básica|resolución|decreto|artículo|la superintendencia)/i.test(
      line.trim()
    )
  );

  if (markerIndex <= 0) return value;

  const preamble = lines.slice(0, markerIndex).join("\n").toLowerCase();
  const isAssistantPreamble =
    preamble.includes("aquí está el texto") ||
    preamble.includes("estoy aquí para ayudarte") ||
    preamble.includes("qué tipo de texto") ||
    preamble.includes("aquí está");

  return isAssistantPreamble ? lines.slice(markerIndex).join("\n") : value;
}

export function splitForOcr(image: RasterImage): RasterImage[] {
  const scaled = downscaleForOcr(image);
  if (scaled.height <= OCR_STRIP_THRESHOLD) return [scaled];

  const strips: RasterImage[] = [];
  let top = 0;

  while (top < scaled.height) {
    const bottom = Math.min(top + OCR_STRIP_HEIGHT, scaled.height);
    strips.push(cropImage(scaled, top, bottom));
    if (bottom >= scaled.height) break;
    top = bottom - OCR_STRIP_OVERLAP;
  }

  return strips;
}

function cropImage(
  source: RasterImage,
  top: number,
  bottom: number
): RasterImage {
  const stride = source.width * source.channels;
  return {
    data: source.data.slice(top * stride, bottom * stride),
    width: source.width,
    height: bottom - top,
    channels: source.channels,
  };
}

export function mergeOcrText(parts: string[]): string {
  const merged: string[] = [];

  for (const part of parts) {
    const lines = normalizeOcrText(part)
      .split("\n")
      .map((line) => line.trimEnd());

    if (!lines.length || (lines.length === 1 && !lines[0])) continue;

    let overlap = 0;
    const maxOverlap = Math.min(merged.length, lines.length, 8);

    for (let count = maxOverlap; count > 0; count -= 1) {
      const tail = merged.slice(merged.length - count).join("\n");
      const head = lines.slice(0, count).join("\n");
      if (tail === head) {
        overlap = count;
        break;
      }
    }

    merged.push(...lines.slice(overlap));
  }

  return normalizePageText(merged.join("\n"));
}

export async function encodePng(source: RasterImage): Promise<Uint8Array> {
  const image = downscaleForOcr(source);
  const channels =
    image.channels === 1 || image.channels === 2 ? 1 : image.channels;
  const colorType = channels === 1 ? 0 : channels === 4 ? 6 : 2;
  const width = image.width;
  const height = image.height;
  const stride = width * channels;
  const raw = new Uint8Array(height * (stride + 1));

  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0;
    const sourceStart = y * stride;
    raw.set(image.data.subarray(sourceStart, sourceStart + stride), rowStart + 1);
  }

  const compressed = await deflate(raw);
  const chunks: Uint8Array[] = [PNG_SIGNATURE];
  const ihdr = new Uint8Array(13);
  writeUint32(ihdr, 0, width);
  writeUint32(ihdr, 4, height);
  ihdr[8] = 8;
  ihdr[9] = colorType;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  chunks.push(pngChunk("IHDR", ihdr));
  chunks.push(pngChunk("IDAT", compressed));
  chunks.push(pngChunk("IEND", new Uint8Array(0)));

  return concatBytes(chunks);
}

function downscale(source: RasterImage, maxDimension: number): RasterImage {
  const longest = Math.max(source.width, source.height);
  if (longest <= maxDimension) return source;

  return resize(source, maxDimension / longest);
}

function downscaleForOcr(source: RasterImage): RasterImage {
  const scale = Math.min(
    1,
    OCR_MAX_DIMENSION / source.width,
    OCR_MAX_HEIGHT / source.height
  );
  return scale >= 1 ? source : resize(source, scale);
}

function resize(source: RasterImage, scale: number): RasterImage {
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const channels = source.channels;
  const output = new Uint8ClampedArray(width * height * channels);

  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.min(source.height - 1, Math.floor(y / scale));
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(source.width - 1, Math.floor(x / scale));
      const from = (sourceY * source.width + sourceX) * channels;
      const to = (y * width + x) * channels;
      for (let channel = 0; channel < channels; channel += 1) {
        output[to + channel] = source.data[from + channel];
      }
    }
  }

  return { data: output, width, height, channels };
}

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes]).stream().pipeThrough(
    new CompressionStream("deflate")
  );
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const chunk = new Uint8Array(12 + data.length);
  writeUint32(chunk, 0, data.length);
  chunk.set(typeBytes, 4);
  chunk.set(data, 8);
  const crc = crc32(chunk.subarray(4, 8 + data.length));
  writeUint32(chunk, 8 + data.length, crc);
  return chunk;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ bytes[index]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint32(target: Uint8Array, offset: number, value: number): void {
  target[offset] = (value >>> 24) & 0xff;
  target[offset + 1] = (value >>> 16) & 0xff;
  target[offset + 2] = (value >>> 8) & 0xff;
  target[offset + 3] = value & 0xff;
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((size, chunk) => size + chunk.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(index, index + chunkSize)
    );
  }
  return btoa(binary);
}

const PNG_SIGNATURE = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();
