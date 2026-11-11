import type { Metadata } from "next";
import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";
import { DemoButtons } from "@/components/demo-buttons";
import {
  CheckIcon,
  DocumentIcon,
  LockIcon,
  SearchIcon,
} from "@/components/icons";
import { questionsForSlug } from "@/lib/demo/question-suggestions";

export const metadata: Metadata = {
  title: "Caso de estudio KPO · Auditoría y cumplimiento",
  description:
    "Cómo convertir 15 circulares, normas contables y guías de auditoría en respuestas trazables con fuente y versión.",
};

const stats = [
  { value: "15", label: "documentos publicados" },
  { value: "1.185", label: "fragmentos indexados" },
  { value: "10", label: "circulares externas" },
  { value: "8,4 MB", label: "de fuentes normativas" },
];

const layers = [
  {
    title: "Corpus normativo",
    copy: "Circulares, Decreto 2420, NIAs, SARLAFT y guías internas. Cada documento conserva versión, fecha y estado de publicación.",
    icon: DocumentIcon,
  },
  {
    title: "Recuperación con permisos",
    copy: "pgvector y RLS limitan cada consulta a los fragmentos publicados del grupo autorizado. El agente no ve documentos en revisión.",
    icon: LockIcon,
  },
  {
    title: "Respuesta con evidencia",
    copy: "La respuesta cita documento, versión y fragmento. Si la evidencia no alcanza, el agente se abstiene y registra el motivo.",
    icon: SearchIcon,
  },
];

const controls = [
  "Aislamiento por grupo con políticas RLS y funciones security definer.",
  "Solo documentos aprobados y publicados entran en la recuperación.",
  "Validación de citas y abstención cuando el corpus no sostiene la respuesta.",
  "Auditoría de consulta, fuentes, modelo, latencia y resultado.",
  "Historial compartido de la demo sin exponer solicitudes bloqueadas.",
  "Límite de 60 consultas por minuto en la cuenta pública.",
];

const corpus = [
  {
    title: "Circulares externas",
    count: 10,
    copy: "Circulares de cumplimiento y circulares externas 100-000002, 100-000003, 100-000004, 100-000008, 100-000015, 100-000016, 100-000020 y 100-300000.",
    items: [
      "Circular Externa 100-000002 de 2025",
      "Circular Externa 100-000015 de 2021",
      "Circular de Cumplimiento 2023-01-734390",
      "Circular Externa 100-300000 de 2024",
    ],
  },
  {
    title: "Marco contable",
    count: 1,
    copy: "Normas de contabilidad, información financiera y aseguramiento aplicables a los estados financieros.",
    items: [
      "Decreto 2420 de 2015",
      "Normas de contabilidad e información financiera",
      "Marco técnico normativo",
    ],
  },
  {
    title: "Auditoría y cumplimiento",
    count: 4,
    copy: "Material de apoyo para procedimientos, hallazgos, NIAs y gestión de riesgos de lavado de activos.",
    items: [
      "Guía práctica de NIAs",
      "Procedimientos de auditoría",
      "COSO y hallazgos",
      "SARLAFT, SAGRILAFT y ROS",
    ],
  },
];

const corpusTotal = corpus.reduce((total, card) => total + card.count, 0);

const questions = questionsForSlug("kpo");

const architecture = [
  "Documento oficial",
  "Texto y OCR",
  "Fragmentos",
  "Embeddings",
  "Recuperación RLS",
  "Respuesta citada",
  "Auditoría",
];

export default function KpoCaseStudyPage() {
  return (
    <div className="site-shell case-shell">
      <header className="site-header case-header">
        <div className="site-header-inner">
          <Link className="site-brand" href="/" aria-label="RAG Agent AI, inicio">
            <BrandMark />
            <span className="site-wordmark">RAG <i>/</i> AGENT</span>
          </Link>
          <nav className="site-nav" aria-label="Navegación del caso KPO">
            <a href="#reto">Reto</a>
            <a href="#arquitectura">Arquitectura</a>
            <a href="#fuentes">Fuentes</a>
            <a href="#resultados">Resultados</a>
          </nav>
          <div className="site-actions">
            <DemoButtons className="demo-actions-header" />
          </div>
        </div>
      </header>

      <main className="case-main" id="inicio">
        <section className="case-hero">
          <div className="case-hero-copy">
            <p className="case-kicker">Caso de estudio · Auditoría y cumplimiento</p>
            <h1>Cuando la norma cambia, la respuesta debe citar la versión vigente.</h1>
            <p className="case-lede">
              KPO reúne circulares, normas contables y guías de auditoría que se
              actualizan con frecuencia. El asistente convierte ese corpus en respuestas
              revisables, con documento, versión y fragmento para cada afirmación.
            </p>
            <div className="case-actions">
              <DemoButtons />
              <Link className="button button-secondary" href="/caso-de-estudio">
                Ver caso CLIMA
              </Link>
            </div>
            <p className="case-disclaimer">
              KPO es un caso de auditoría y cumplimiento. El corpus, la arquitectura y
              las cifras provienen de la implementación real del proyecto.
            </p>
          </div>

          <aside className="case-brief-card" aria-label="Ficha del caso KPO">
            <p className="case-kicker">Ficha del caso</p>
            <h2>KPO</h2>
            <p>
              Biblioteca normativa para consultas de auditoría, contabilidad y
              cumplimiento. El objetivo no es resumir normas: es sostener cada respuesta
              con evidencia publicada.
            </p>
            <dl>
              <div>
                <dt>Perfil</dt>
                <dd>Auditoría y cumplimiento</dd>
              </div>
              <div>
                <dt>Necesidad</dt>
                <dd>Consulta normativa trazable</dd>
              </div>
              <div>
                <dt>Restricción</dt>
                <dd>Versiones y permisos por grupo</dd>
              </div>
            </dl>
          </aside>
        </section>

        <section className="case-stats" aria-label="Cifras del caso KPO">
          {stats.map((stat) => (
            <div className="case-stat" key={stat.label}>
              <strong>{stat.value}</strong>
              <span>{stat.label}</span>
            </div>
          ))}
        </section>

        <section className="case-section case-brief" id="reto">
          <div className="case-section-head">
            <p className="case-kicker">El reto</p>
            <h2>La respuesta correcta depende de la versión correcta.</h2>
          </div>
          <div className="case-brief-grid">
            <div className="case-prose">
              <p>
                Las consultas de auditoría no se resuelven con una búsqueda por palabra
                clave. Una circular puede modificar otra, una guía puede remitir a una
                NIA y un decreto puede cambiar la forma de presentar los estados
                financieros.
              </p>
              <p>
                El equipo necesitaba responder preguntas concretas sin perder la fuente:
                qué exige una circular, qué cambió en la versión más reciente, cómo se
                aplica el marco contable o qué obligaciones trae SARLAFT.
              </p>
              <p>
                La restricción era doble: cada respuesta debía citar evidencia publicada
                y el agente no podía mezclar documentos de otros grupos ni versiones en
                revisión.
              </p>
            </div>
            <aside className="case-brief-card">
              <p className="case-kicker">Preguntas que resuelve</p>
              <h3>Del documento a la respuesta</h3>
              <ul className="case-control-list">
                {questions.slice(0, 4).map((question) => (
                  <li key={question}>
                    <CheckIcon size={16} />
                    <span>{question}</span>
                  </li>
                ))}
              </ul>
            </aside>
          </div>
        </section>

        <section className="case-section" id="solucion">
          <div className="case-section-head">
            <p className="case-kicker">La solución</p>
            <h2>Tres capas para que una respuesta sea útil y defendible.</h2>
          </div>
          <div className="case-layers">
            {layers.map(({ title, copy, icon: Icon }, index) => (
              <article className="case-layer" key={title}>
                <span className="case-layer-index">0{index + 1}</span>
                <span className="case-layer-icon">
                  <Icon size={20} />
                </span>
                <div>
                  <h3>{title}</h3>
                  <p>{copy}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="case-section case-architecture-section" id="arquitectura">
          <div className="case-section-head">
            <p className="case-kicker">Arquitectura</p>
            <h2>Un recorrido auditable desde el PDF hasta la cita.</h2>
          </div>
          <div className="case-flow" aria-label="Flujo de una consulta">
            {architecture.map((step, index) => (
              <div className="case-flow-step" key={step}>
                <span className="case-flow-number">{String(index + 1).padStart(2, "0")}</span>
                <strong>{step}</strong>
                {index < architecture.length - 1 ? (
                  <span className="case-flow-arrow" aria-hidden="true">
                    →
                  </span>
                ) : null}
              </div>
            ))}
          </div>
          <div className="case-stack">
            <div>
              <h3>Ingesta</h3>
              <p>
                Carga, OCR cuando el PDF es escaneado, extracción de texto, fragmentación
                y embeddings. Cada versión conserva su propio estado y trazabilidad.
              </p>
            </div>
            <div>
              <h3>Consulta</h3>
              <p>
                La pregunta se convierte en embedding y se recuperan fragmentos
                publicados del grupo activo. La respuesta se valida contra las citas
                recuperadas.
              </p>
            </div>
            <div>
              <h3>Control</h3>
              <p>
                Si no hay evidencia suficiente, el agente se abstiene. La consulta queda
                registrada con resultado, fuentes, modelo y latencia.
              </p>
            </div>
          </div>
        </section>

        <section className="case-section" id="fuentes">
          <div className="case-section-head">
            <p className="case-kicker">El corpus</p>
            <h2>Quince documentos, tres frentes de consulta.</h2>
            <p className="case-section-lede">
              El corpus KPO se publica como <code>restricted</code> y no se versiona en
              Git. La demo usa la misma recuperación con permisos que el espacio de
              trabajo.
            </p>
          </div>
          <div className="case-corpus-summary">
            <div className="case-corpus-summary-copy">
              <strong>{corpusTotal}</strong>
              <span>documentos publicados en el corpus KPO</span>
            </div>
            <div className="case-corpus-summary-visual">
              <div className="case-corpus-bar" aria-hidden="true">
                {corpus.map((card) => (
                  <span
                    key={card.title}
                    style={{ flexGrow: card.count }}
                  />
                ))}
              </div>
              <ul className="case-corpus-legend">
                {corpus.map((card, index) => (
                  <li key={card.title}>
                    <span
                      className={`case-corpus-dot case-corpus-dot-${index + 1}`}
                      aria-hidden="true"
                    />
                    {card.title}
                    <b>{card.count}</b>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="case-corpus-grid case-corpus-grid-kpo">
            {corpus.map((card, index) => (
              <article
                className={`case-corpus-card${index === 0 ? " case-corpus-card-featured" : ""}`}
                key={card.title}
              >
                <div className="case-corpus-head">
                  <h3>{card.title}</h3>
                  <span>
                    {card.count} {card.count === 1 ? "documento" : "documentos"}
                  </span>
                </div>
                <p>{card.copy}</p>
                <ul>
                  {card.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section className="case-section case-security-grid" id="seguridad">
          <div className="case-security-copy">
            <p className="case-kicker">Controles</p>
            <h2>La demo no es un buscador abierto.</h2>
            <p>
              El asistente solo usa fragmentos publicados del grupo activo. La sesión
              pública comparte historial dentro de la misma demo, pero no mezcla KPO con
              riesgo climático ni expone la administración.
            </p>
          </div>
          <ul className="case-control-list">
            {controls.map((control) => (
              <li key={control}>
                <CheckIcon size={16} />
                <span>{control}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="case-section case-results-section" id="resultados">
          <div className="case-section-head">
            <p className="case-kicker">Resultados</p>
            <h2>Un corpus normativo pequeño, una evaluación explícita.</h2>
          </div>
          <div className="case-results-grid">
            <div className="case-result-main">
              <strong>15 / 15</strong>
              <span>documentos validados y publicados</span>
              <p>
                La biblioteca total del proyecto queda en 38 documentos: 15 de KPO y 23
                de riesgo climático y datos abiertos.
              </p>
            </div>
            <div className="case-result-list">
              <div>
                <strong>1.185</strong>
                <span>fragmentos indexados</span>
              </div>
              <div>
                <strong>8,4 MB</strong>
                <span>de fuentes normativas</span>
              </div>
              <div>
                <strong>6</strong>
                <span>preguntas sugeridas</span>
              </div>
              <div>
                <strong>60</strong>
                <span>consultas por minuto en demo</span>
              </div>
            </div>
          </div>
          <div className="case-eval">
            <p>
              La demo permite probar preguntas respondibles y preguntas sin evidencia.
              El historial compartido muestra todas las categorías de la comunidad,
              incluidas solicitudes bloqueadas, rechazadas y errores; cada categoría
              tiene un color y puede filtrarse desde el propio historial.
            </p>
            <p className="case-footnote">
              Los resultados no se presentan como asesoría legal ni como una auditoría
              automática. La revisión profesional sigue siendo necesaria.
            </p>
          </div>
        </section>

        <section className="case-section case-cta">
          <div>
            <p className="case-kicker">Prueba la demo</p>
            <h2>Pregunta sobre circulares, NIAs o SARLAFT.</h2>
            <p>
              Abre la demo KPO y revisa cómo cada respuesta se apoya en documentos
              publicados del grupo.
            </p>
          </div>
          <DemoButtons />
        </section>
      </main>
    </div>
  );
}
