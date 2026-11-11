import type { DemoVariant } from "@/lib/auth/demo";

import { DEMO_INTRO } from "./corpus";
import { questionsForSlug } from "./question-suggestions";

export const KPO_DEMO_INTRO =
  "Explora la biblioteca KPO de circulares, guías y marco contable. Pregunta en lenguaje natural y revisa cada fuente citada.";

export const KPO_DEMO_SUGGESTIONS = questionsForSlug("kpo");
export const CLIMA_DEMO_SUGGESTIONS = questionsForSlug("riesgo-climatico");

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
      suggestions: CLIMA_DEMO_SUGGESTIONS,
    };
  }

  return null;
}
