import { describe, expect, it } from "vitest";

import {
  ABSTENTION_TEXT,
  buildContext,
  buildMessages,
  buildSources,
  isAbstention,
  parseCitations,
  validateCitations,
} from "./prompt";
import type { RetrievedChunk } from "./types";

function chunk(index: number, overrides: Partial<RetrievedChunk> = {}): RetrievedChunk {
  return {
    chunk_id: `chunk-${index}`,
    document_id: `doc-${index}`,
    version_id: `version-${index}`,
    version: index,
    title: `Documento ${index}`,
    content: `Contenido del fragmento ${index}.`,
    page: index,
    section: "Sección",
    article: null,
    numeral: null,
    similarity: 0.9 - index * 0.1,
    ...overrides,
  };
}

describe("buildSources", () => {
  it("assigns sequential ranks and keeps excerpts", () => {
    const sources = buildSources([chunk(1), chunk(2)]);
    expect(sources.map((source) => source.rank)).toEqual([1, 2]);
    expect(sources[0].excerpt).toContain("fragmento 1");
  });

  it("truncates very long content", () => {
    const sources = buildSources([
      chunk(1, { content: "x".repeat(10000) }),
    ]);
    expect(sources[0].excerpt.length).toBeLessThanOrEqual(2800);
  });
});

describe("buildContext", () => {
  it("includes title, location and citation marker", () => {
    const sources = buildSources([
      chunk(1, { title: "Ley 123", page: 7, article: "5" }),
    ]);
    const context = buildContext(sources);
    expect(context).toContain("[1] Ley 123");
    expect(context).toContain("página 7");
    expect(context).toContain("artículo 5");
  });
});

describe("buildMessages", () => {
  it("uses a system instruction and the authorized fragments", () => {
    const sources = buildSources([chunk(1)]);
    const messages = buildMessages("¿Qué dice la norma?", sources);
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toContain("exclusivamente");
    expect(messages[1].content).toContain("¿Qué dice la norma?");
    expect(messages[1].content).toContain("[1] Documento 1");
  });
});

describe("citations", () => {
  it("parses, deduplicates and sorts citations", () => {
    expect(parseCitations("A [2], B [1] y C [2].")).toEqual([1, 2]);
  });

  it("separates valid and invalid citations", () => {
    expect(validateCitations("A [1], B [7] y C [0]", 3)).toEqual({
      citations: [1],
      invalid: [0, 7],
    });
  });
});

describe("abstention", () => {
  it("detects the instructed abstention text", () => {
    expect(isAbstention(ABSTENTION_TEXT)).toBe(true);
    expect(isAbstention("La norma exige [1].")).toBe(false);
  });
});
