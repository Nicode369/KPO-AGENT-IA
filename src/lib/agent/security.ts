export type SecurityAction = "block" | "reject";
export type SecuritySeverity = "high" | "medium";

export type SecurityCode =
  | "system_prompt_request"
  | "secret_request"
  | "cross_group_request"
  | "bulk_extraction"
  | "role_play_override"
  | "destructive_action"
  | "evidence_tampering"
  | "citation_bypass"
  | "data_exfiltration"
  | "fabrication_request";

export type SecurityBlock = {
  code: SecurityCode;
  action: SecurityAction;
  severity: SecuritySeverity;
  message: string;
};

export type OutputGuardCode =
  | "system_prompt_leak"
  | "secret_leak"
  | "destructive_confirmation";

export type OutputGuardResult = {
  code: OutputGuardCode;
  message: string;
};

export const SECURITY_REFUSAL_TEXT =
  "No puedo atender esta solicitud porque intenta alterar las instrucciones, el rol o el alcance del asistente.";

const MESSAGES: Record<SecurityCode, string> = {
  system_prompt_request:
    "No puedo revelar instrucciones internas ni configuraciones del sistema.",
  secret_request:
    "No puedo revelar secretos, credenciales ni variables de entorno.",
  cross_group_request:
    "No puedo acceder a documentos ni información de otros grupos.",
  bulk_extraction:
    "No puedo exportar la biblioteca completa ni listar fragmentos de forma masiva.",
  role_play_override:
    "No puedo cambiar el rol del asistente ni simular identidades para alterar una respuesta.",
  destructive_action:
    "No puedo ejecutar ni explicar cómo borrar, alterar o destruir datos, registros o auditoría.",
  evidence_tampering:
    "No puedo ayudar a ocultar, ignorar o alterar hallazgos, incidentes o evidencia.",
  citation_bypass:
    "No puedo responder sin fuentes ni usar conocimiento externo a los documentos publicados.",
  data_exfiltration:
    "No puedo exportar datos masivamente ni acceder a información fuera de tu grupo.",
  fabrication_request:
    "No puedo inventar normas, fuentes, citas ni evidencia.",
};

type Rule = {
  code: SecurityCode;
  action: SecurityAction;
  severity: SecuritySeverity;
  pattern: RegExp;
};

const RULES: Rule[] = [
  {
    code: "system_prompt_request",
    action: "block",
    severity: "high",
    pattern:
      /\b(ignora|ignore|olvida|forget|descarta|disregard|omite)\b.*\b(instrucciones|reglas|restricciones|indicaciones|prompt|sistema|instructions|rules|restrictions)\b/,
  },
  {
    code: "system_prompt_request",
    action: "block",
    severity: "high",
    pattern:
      /\b(revela|muestra|imprime|dime|escribe|repite|entrega|exporta|show|print|reveal|repeat|tell)\b.*\b(prompt|instrucciones internas|instrucciones del sistema|mensaje del sistema|configuracion interna|reglas internas|system prompt|developer message)\b/,
  },
  {
    code: "system_prompt_request",
    action: "block",
    severity: "high",
    pattern:
      /\b(cual|que)\s+(es|son)\s+(tu|el)\s+(prompt|instrucciones|reglas|configuracion|system prompt)\b/,
  },
  {
    code: "system_prompt_request",
    action: "block",
    severity: "high",
    pattern:
      /\b(ignora|olvida|descarta|omite)\b.*\b(todo|lo anterior|lo previo|arriba)\b/,
  },
  {
    code: "system_prompt_request",
    action: "block",
    severity: "high",
    pattern:
      /\b(nuevas instrucciones|new instructions|system override|override del sistema)\b/,
  },
  {
    code: "secret_request",
    action: "block",
    severity: "high",
    pattern:
      /\b(revela|muestra|imprime|dime|entrega|dame|comparte|exporta|show|reveal|print|tell)\b.*\b(secreto|contrasena|token|credencial|api.?key|service.?role|clave privada|clave de cifrado|variable de entorno|password|secret)\b/,
  },
  {
    code: "secret_request",
    action: "block",
    severity: "high",
    pattern:
      /\b(api.?key|service.?role|clave privada|clave de cifrado|variables? de entorno|contrasena|credenciales? (de|del) (sistema|servidor|base de datos)|access token|refresh token)\b/,
  },
  {
    code: "secret_request",
    action: "block",
    severity: "high",
    pattern:
      /\b(system prompt|developer message|jailbreak|dan mode|do anything now|modo desarrollador|developer mode|modo dios|god mode)\b/,
  },
  {
    code: "role_play_override",
    action: "block",
    severity: "high",
    pattern:
      /\b(actua como|simula que eres|simula ser|pretende ser|haz de cuenta que eres|hazte pasar por|eres ahora|a partir de ahora eres|juega el papel de|act as|pretend to be|pretend you are|you are now|roleplay as|role play as|from now on you are)\b/,
  },
  {
    code: "role_play_override",
    action: "block",
    severity: "high",
    pattern:
      /\b(actua|responde|eres|comportate|act|answer|behave)\b.*\b(sin restricciones|sin filtros|sin reglas|sin censura|without restrictions|without rules|unfiltered)\b/,
  },
  {
    code: "cross_group_request",
    action: "block",
    severity: "high",
    pattern:
      /\b(documentos?|informacion|fragmentos?|datos)\b.*\b(de|del|sobre)\b.*\b(otro|otros|otra|otras)\b.*\b(grupo|grupos|organizacion)\b/,
  },
  {
    code: "bulk_extraction",
    action: "block",
    severity: "high",
    pattern:
      /\b(exporta|lista|muestra|dame|entrega|descarga|dump|vuelca|extrae)\b.*\b(todos|todas|el catalogo|la biblioteca completa|la base completa)\b.*\b(documentos?|fragmentos?|chunks?|fuentes?)\b/,
  },
  {
    code: "data_exfiltration",
    action: "block",
    severity: "high",
    pattern:
      /\b(exporta|exportar|descarga|descargar|dump|vuelca|volcar|extrae|extraer|lista|listar)\b.*\b(toda|todos|completa|completo|base de datos|tabla|tablas|historial|logs|registros|chunks|fragmentos)\b/,
  },
  {
    code: "destructive_action",
    action: "block",
    severity: "high",
    pattern:
      /^(borra|borrar|elimina|eliminar|destruye|destruir|altera|alterar|modifica|modificar|sobrescribe|sobrescribir|limpia|limpiar)\b.*\b(base de datos|tabla|tablas|logs|registros?|auditoria|historial|chunks?|fragmentos?|vectores?)\b/,
  },
  {
    code: "destructive_action",
    action: "block",
    severity: "high",
    pattern:
      /\b(quiero que|necesito que|ordename|haz|debes|vas a|por favor|ahora|sin dejar rastro|para ocultar|que no quede|y|luego|despues|entonces)\b.*\b(borra|elimina|destruye|altera|modifica|sobrescribe|limpia)\b.*\b(base de datos|tabla|tablas|logs|registros?|auditoria|historial|chunks?|fragmentos?|vectores?)\b/,
  },
  {
    code: "destructive_action",
    action: "block",
    severity: "high",
    pattern:
      /\b(como)\s+(borrar|eliminar|destruir|alterar|modificar|sobrescribir|limpiar)\b.*\b(base de datos|tabla|tablas|logs|registros?|auditoria|historial)\b/,
  },
  {
    code: "evidence_tampering",
    action: "block",
    severity: "high",
    pattern:
      /\b(oculta|ocultar|elimina|eliminar|borra|borrar|ignora|ignorar|descarta|descartar|minimiza|minimizar|manipula|manipular|falsifica|falsificar)\b.*\b(hallazgo|hallazgos|evidencia|fraude|lavado|incidente|riesgo|conclusion|informe|auditoria)\b/,
  },
  {
    code: "data_exfiltration",
    action: "block",
    severity: "high",
    pattern:
      /\b(lista|listado|muestra|revela|dame|entrega|comparte)\b.*\b(clientes?|contratos?|saldos?)\b.*\b(confidencial|secreta|privad|bancari)/,
  },
  {
    code: "evidence_tampering",
    action: "block",
    severity: "high",
    pattern:
      /\b(oculta|ocultar|esconde|esconder|encubre|encubrir|borra|borrar|elimina|eliminar|minimiza|minimizar)\b.*\b(inconsistencias?|impuestos?|tributari[oa]s?|dian)\b/,
  },
  {
    code: "fabrication_request",
    action: "block",
    severity: "high",
    pattern:
      /\b(escribe|redacta|crea|inventa|alucina|falsifica|fabrica)\b.*\b(norma|documento|fuente|cita|hallazgo|informe)\b.*\b(falsa?|falso|inexistente|que (apruebe|justifique|valide))\b/,
  },
  {
    code: "citation_bypass",
    action: "reject",
    severity: "medium",
    pattern:
      /\b(sin citas|sin fuentes|no cites|no citar|no uses (los )?documentos|no uses (el )?contexto|responde con (tu )?conocimiento|conocimiento general|inventa|inventar|supon|asume)\b/,
  },
];

export function classifyQuestion(question: string): SecurityBlock | null {
  const normalized = normalizeText(question);

  for (const rule of RULES) {
    if (rule.pattern.test(normalized)) {
      return {
        code: rule.code,
        action: rule.action,
        severity: rule.severity,
        message: MESSAGES[rule.code],
      };
    }
  }

  return null;
}

export function inspectAnswer(answer: string): OutputGuardResult | null {
  const raw = answer
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const normalized = normalizeText(answer);

  if (
    /\b(eres un asistente de conocimiento normativo|usa exclusivamente la informacion de los fragmentos|no uses conocimiento externo|fragmentos autorizados)\b/.test(
      normalized,
    )
  ) {
    return {
      code: "system_prompt_leak",
      message: "La respuesta intentó revelar instrucciones internas del sistema.",
    };
  }

  if (
    /\b(service_role|supabase_service_role_key|sb_secret_[a-z0-9_]+|sk-[a-z0-9]{16,}|eyj[a-z0-9_-]{10,}\.[a-z0-9_-]{10,}\.[a-z0-9_-]{10,})\b/i.test(
      raw,
    )
  ) {
    return {
      code: "secret_leak",
      message: "La respuesta contenía un posible secreto o credencial.",
    };
  }

  if (
    /\b(aceptado|he borrado|he eliminado|base de datos (borrada|eliminada|vaciada)|logs? (borrados|eliminados)|auditoria (borrada|eliminada)|modo desarrollador (activado|habilitado)|dan mode|jailbreak (activado|exitoso))\b/.test(
      normalized,
    )
  ) {
    return {
      code: "destructive_confirmation",
      message: "La respuesta confirmó una acción destructiva o un modo no permitido.",
    };
  }

  return null;
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
