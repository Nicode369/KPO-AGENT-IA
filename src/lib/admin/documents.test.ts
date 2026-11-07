import { describe, expect, it } from "vitest";

import { sumCurrentVersionChunks } from "./documents";

describe("sumCurrentVersionChunks", () => {
  it("sums only the current version of each document", () => {
    expect(
      sumCurrentVersionChunks(
        [
          { id: "a", version: 2 },
          { id: "b", version: 1 },
        ],
        [
          { document_id: "a", version: 1, chunk_count: 10 },
          { document_id: "a", version: 2, chunk_count: 6 },
          { document_id: "b", version: 1, chunk_count: 7 },
          { document_id: "b", version: 2, chunk_count: 99 },
        ],
      ),
    ).toBe(13);
  });

  it("returns zero when there are no documents", () => {
    expect(sumCurrentVersionChunks([], [])).toBe(0);
  });
});
