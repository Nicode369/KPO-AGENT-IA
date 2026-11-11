import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { getKnowledgeBaseDocumentCount } from "./retrieval";

type QueryResult = {
  count: number | null;
  error: { message: string } | null;
};

function createSupabase(result: QueryResult) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const query = {
    select(...args: unknown[]) {
      calls.push({ method: "select", args });
      return query;
    },
    eq(...args: unknown[]) {
      calls.push({ method: "eq", args });
      return query;
    },
    in(...args: unknown[]) {
      calls.push({ method: "in", args });
      return query;
    },
    then<TResult1, TResult2>(
      onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): Promise<TResult1 | TResult2> {
      return Promise.resolve(result).then(onfulfilled, onrejected);
    },
  };

  const supabase = {
    from(table: string) {
      calls.push({ method: "from", args: [table] });
      return query;
    },
  } as unknown as SupabaseClient;

  return { supabase, calls };
}

describe("getKnowledgeBaseDocumentCount", () => {
  it("counts published documents only for the provided groups", async () => {
    const { supabase, calls } = createSupabase({ count: 7, error: null });

    await expect(
      getKnowledgeBaseDocumentCount(supabase, ["group-a", "group-b"]),
    ).resolves.toEqual({ ok: true, count: 7 });

    expect(calls).toContainEqual({ method: "from", args: ["documents"] });
    expect(calls).toContainEqual({
      method: "select",
      args: ["id", { count: "exact", head: true }],
    });
    expect(calls).toContainEqual({ method: "eq", args: ["status", "published"] });
    expect(calls).toContainEqual({
      method: "in",
      args: ["group_id", ["group-a", "group-b"]],
    });
  });

  it("counts all published documents globally for superadmin", async () => {
    const { supabase, calls } = createSupabase({ count: 38, error: null });

    await expect(
      getKnowledgeBaseDocumentCount(supabase, [], { global: true }),
    ).resolves.toEqual({ ok: true, count: 38 });

    expect(calls.some((call) => call.method === "in")).toBe(false);
  });

  it("returns zero without querying when the user has no groups", async () => {
    const { supabase, calls } = createSupabase({ count: 9, error: null });

    await expect(getKnowledgeBaseDocumentCount(supabase, [])).resolves.toEqual({
      ok: true,
      count: 0,
    });

    expect(calls).toHaveLength(0);
  });

  it("returns an error result when the query fails", async () => {
    const { supabase } = createSupabase({
      count: null,
      error: { message: "denied" },
    });

    await expect(
      getKnowledgeBaseDocumentCount(supabase, ["group-a"]),
    ).resolves.toEqual({ ok: false });
  });
});
