export type RetrievedChunk = {
  chunk_id: string;
  document_id: string;
  version_id: string;
  version: number;
  title: string;
  content: string;
  page: number | null;
  section: string | null;
  article: string | null;
  numeral: string | null;
  similarity: number;
};

export type AgentSource = {
  rank: number;
  chunk_id: string;
  document_id: string;
  version_id: string;
  version: number;
  title: string;
  page: number | null;
  section: string | null;
  article: string | null;
  numeral: string | null;
  similarity: number;
  excerpt: string;
};

export type AgentOutcome =
  | "answered"
  | "rejected"
  | "blocked"
  | "insufficient_evidence"
  | "out_of_scope"
  | "error";

export type AgentQueryResponse = {
  answer: string;
  abstained: boolean;
  outcome: AgentOutcome;
  outcomeReason: string | null;
  sources: AgentSource[];
  model: string;
  latencyMs: number;
  auditSaved: boolean;
};
