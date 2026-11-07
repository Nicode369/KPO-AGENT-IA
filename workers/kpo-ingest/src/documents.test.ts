import { describe, expect, it } from "vitest";

import { chunkMarkdown } from "./documents";

describe("chunkMarkdown", () => {
  it("detects English and Spanish page headings", () => {
    const chunks = chunkMarkdown(
      "## Page 1\n\nContenido de la primera página.\n\n## Página 2\n\nContenido de la segunda página.",
      500,
      0
    );

    expect(chunks).toHaveLength(2);
    expect(chunks[0].page).toBe(1);
    expect(chunks[1].page).toBe(2);
  });

  it("captures article and numeral context", () => {
    const chunks = chunkMarkdown(
      "## Page 1\n\nArtículo 5. Numeral 2. Las entidades deben reportar.",
      500,
      0
    );

    expect(chunks[0].article).toBe("5.");
    expect(chunks[0].numeral).toBe("2.");
    expect(chunks[0].content).toContain("reportar");
  });

  it("splits long text into multiple chunks", () => {
    const line = "Obligación de reporte. ".repeat(40);
    const chunks = chunkMarkdown(`## Page 1\n\n${line}`, 300, 40);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.content.length > 0)).toBe(true);
  });
});
