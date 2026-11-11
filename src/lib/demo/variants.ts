import type { DemoVariant } from "@/lib/auth/demo";

import { DEMO_INTRO, DEMO_SUGGESTIONS } from "./corpus";

export const KPO_DEMO_INTRO =
  "Explora la biblioteca KPO de circulares, guías y marco contable. Pregunta en lenguaje natural y revisa cada fuente citada.";

export const KPO_DEMO_SUGGESTIONS = [
  "¿Qué requisitos establece la Circular Externa 100-000015 de 2021?",
  "¿Qué cambios introduce la Circular Externa 100-000002 de 2025?",
  "¿Cómo se aplica el Decreto 2420 de 2015 a los estados financieros?",
  "¿Qué obligaciones implica el SARLAFT para una entidad?",
  "¿Qué son las NIAs y cómo se usan en la auditoría?",
  "¿Qué lineamientos trae la Circular de Cumplimiento 2023-01-734390?",
];

export type DemoCopy = {
  label: string;
  library: string;
  intro: string;
  suggestions: string[];
};

export function demoCopy(variant: DemoVariant | null): DemoCopy | null {
  if (variant === "kpo") {
    return {
      label: "Demo KPO",
      library: "la biblioteca KPO",
      intro: KPO_DEMO_INTRO,
      suggestions: KPO_DEMO_SUGGESTIONS,
    };
  }

  if (variant === "clima") {
    return {
      label: "Demo CLIMA",
      library: "la biblioteca de riesgo climático y datos abiertos",
      intro: DEMO_INTRO,
      suggestions: DEMO_SUGGESTIONS,
    };
  }

  return null;
}
