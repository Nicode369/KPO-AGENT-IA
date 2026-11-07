import { describe, expect, it } from "vitest";

import { validateDocumentFile } from "./files";

const encoder = new TextEncoder();

function file(name: string, type: string, bytes: Uint8Array): File {
  return new File([bytes], name, { type });
}

describe("validateDocumentFile", () => {
  it("accepts PDFs with leading whitespace", async () => {
    const pdf = encoder.encode("%PDF-1.4\ncontenido");
    const bytes = new Uint8Array(pdf.length + 2);
    bytes.set([0x09, 0x0a]);
    bytes.set(pdf, 2);

    const result = await validateDocumentFile(
      file("decreto.pdf", "application/pdf", bytes),
      1024
    );

    expect(result.kind).toBe("pdf");
    expect(new TextDecoder().decode(result.bytes.slice(0, 5))).toBe("%PDF-");
    expect(result.size).toBe(pdf.length);
  });

  it("rejects files without a PDF or DOCX signature", async () => {
    await expect(
      validateDocumentFile(
        file("decreto.pdf", "application/pdf", encoder.encode("no es un pdf")),
        1024
      )
    ).rejects.toMatchObject({ code: "invalid_file_signature" });
  });
});
