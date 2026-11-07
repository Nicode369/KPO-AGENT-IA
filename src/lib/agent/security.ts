export type SecurityBlock = {
  code:
    | "system_prompt_request"
    | "secret_request"
    | "cross_group_request"
    | "bulk_extraction";
  message: string;
};

const MESSAGE =
  "No puedo atender solicitudes que intenten acceder a instrucciones internas, secretos o documentos de otros grupos.";

const RULES: { code: SecurityBlock["code"]; pattern: RegExp }[] = [
  {
    code: "system_prompt_request",
    pattern:
      /\b(ignora|olvida|descarta|omite)\b.*\b(instrucciones|reglas|restricciones|indicaciones|prompt|sistema)\b/,
  },
  {
    code: "system_prompt_request",
    pattern:
      /\b(revela|muestra|imprime|dime|escribe|repite|entrega|exporta)\b.*\b(prompt|instrucciones internas|instrucciones del sistema|mensaje del sistema|configuraci[oó]n interna|reglas internas)\b/,
  },
  {
    code: "system_prompt_request",
    pattern:
      /\b(ignore|disregard|forget)\b.*\b(previous|prior|above|system)\b.*\b(instructions|rules|prompt)\b/,
  },
  {
    code: "secret_request",
    pattern:
      /\b(revela|muestra|imprime|dime|entrega|dame|comparte|exporta)\b.*\b(secreto|contrase[nñ]a|token|credencial|api.?key|service.?role|clave privada|variable de entorno)\b/,
  },
  {
    code: "secret_request",
    pattern:
      /\b(api.?key|service.?role|clave privada|variables? de entorno|contrase[nñ]a|credenciales? (de|del) (sistema|servidor|base de datos))\b/,
  },
  {
    code: "secret_request",
    pattern: /\b(system prompt|developer message|jailbreak|dan mode)\b/,
  },
  {
    code: "cross_group_request",
    pattern:
      /\b(documentos?|informaci[oó]n|fragmentos?|datos)\b.*\b(de|del|sobre)\b.*\b(otro|otros|otra|otras)\b.*\b(grupo|grupos|organizaci[oó]n)\b/,
  },
  {
    code: "bulk_extraction",
    pattern:
      /\b(exporta|lista|muestra|dame|entrega|descarga)\b.*\b(todos|todas|el cat[aá]logo|la biblioteca completa)\b.*\b(documentos?|fragmentos?|chunks?|fuentes?)\b/,
  },
];

export function classifyQuestion(question: string): SecurityBlock | null {
  const normalized = question
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  for (const rule of RULES) {
    if (rule.pattern.test(normalized)) {
      return { code: rule.code, message: MESSAGE };
    }
  }

  return null;
}
