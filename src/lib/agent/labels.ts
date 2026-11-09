export const OUTCOME_LABELS: Record<string, string> = {
  answered: "Respondida",
  rejected: "Rechazada",
  blocked: "Bloqueada",
  insufficient_evidence: "Evidencia insuficiente",
  out_of_scope: "Fuera de alcance",
  error: "Error",
};

export const OUTCOME_TONES: Record<string, string> = {
  answered: "admin-tag-ok",
  rejected: "admin-tag-error",
  blocked: "admin-tag-error",
  insufficient_evidence: "admin-tag-warn",
  out_of_scope: "admin-tag-warn",
  error: "admin-tag-error",
};

export const REASON_LABELS: Record<string, string> = {
  no_authorized_sources: "No se encontraron fuentes autorizadas suficientes.",
  no_relevant_sources: "No hay documentos publicados relacionados con la consulta.",
  model_abstained: "El modelo determinó que la evidencia era insuficiente.",
  citation_validation_failed: "La respuesta no incluyó citas válidas.",
  invalid_question: "La pregunta no cumplía el formato permitido.",
  worker_not_configured: "El servicio de consulta no estaba configurado.",
  embedding_failed: "Falló la generación del embedding.",
  retrieval_failed: "Falló la recuperación documental.",
  generation_failed: "Falló la generación de la respuesta.",
  system_prompt_request: "Intento de acceder a instrucciones internas.",
  secret_request: "Intento de acceder a secretos o credenciales.",
  cross_group_request: "Intento de acceder a información de otro grupo.",
  bulk_extraction: "Intento de extracción masiva de documentos.",
  role_play_override: "Intento de cambiar el rol o las reglas del asistente.",
  destructive_action: "Intento de borrar, alterar o destruir datos.",
  evidence_tampering: "Intento de ocultar o alterar hallazgos o evidencia.",
  citation_bypass: "Intento de responder sin fuentes o con conocimiento externo.",
  data_exfiltration: "Intento de extraer datos de forma masiva.",
  output_guard_system_prompt_leak: "La respuesta intentó revelar instrucciones internas.",
  output_guard_secret_leak: "La respuesta contenía un posible secreto.",
  output_guard_destructive_confirmation:
    "La respuesta confirmó una acción destructiva o un modo no permitido.",
  rate_limited: "Se superó el límite de consultas por minuto.",
};
