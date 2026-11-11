import type { Metadata } from "next";
import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";
import { DemoButtons } from "@/components/demo-buttons";
import { CheckIcon, DocumentIcon, LockIcon, SearchIcon } from "@/components/icons";
import {
  DEMO_CATEGORIES,
  DEMO_CLIENT,
  DEMO_DOCUMENTS,
  DEMO_EVALUATION_CASES,
  DEMO_HEADLINE,
  DEMO_INTRO,
  DEMO_SUGGESTIONS,
} from "@/lib/demo/corpus";

export const metadata: Metadata = {
  title: "Caso de estudio · Riesgo climático y datos abiertos",
  description:
    "Cómo convertir 23 fuentes públicas de riesgo climático en respuestas trazables para un gobierno local.",
};

const stats = [
  { value: "23", label: "fuentes oficiales" },
  { value: "1.393", label: "páginas indexadas" },
  { value: "5", label: "categorías documentales" },
  { value: "10", label: "casos de evaluación" },
];

const layers = [
  {
    title: "Corpus con criterio",
    copy: "Normativa, planeación territorial, amenaza, adaptación y datos abiertos. Cada documento tiene entidad, año, tipo y licencia.",
    icon: DocumentIcon,
  },
  {
    title: "Recuperación con permisos",
    copy: "Postgres con pgvector y RLS. El agente solo ve fragmentos publicados del grupo activo y deja fuera lo que no está autorizado.",
    icon: LockIcon,
  },
  {
    title: "Respuesta con evidencia",
    copy: "Cada afirmación se valida contra fuentes numeradas. Si la evidencia no alcanza, el agente se abstiene en lugar de inventar.",
    icon: SearchIcon,
  },
];

const controls = [
  "Aislamiento por grupo con políticas RLS y funciones security definer.",
  "Filtro de entrada contra prompt injection, extracción masiva y acciones destructivas.",
  "Validación de citas y abstención cuando el corpus no sostiene la respuesta.",
  "Auditoría encadenada por hash para consultas, fuentes, modelo y latencia.",
  "Límite de 60 consultas por minuto para la cuenta demo compartida.",
  "Historial y administración deshabilitados para la sesión pública.",
];

const architecture = [
  "Documento oficial",
  "Texto y OCR",
  "Fragmentos",
  "Embeddings",
  "Recuperación RLS",
  "Respuesta citada",
  "Auditoría",
];

const documentsByCategory = DEMO_CATEGORIES.map((category) => ({
  ...category,
  documents: DEMO_DOCUMENTS.filter(
    (document) => document.category === category.key,
  ),
}));

export default function CaseStudyPage() {
  return (
    <div className="site-shell case-shell">
      <header className="site-header case-header">
        <div className="site-header-inner">
          <Link className="site-brand" href="/" aria-label="RAG Agent AI, inicio">
            <BrandMark />
            <span className="site-wordmark">RAG <i>/</i> AGENT</span>
          </Link>
          <nav className="site-nav" aria-label="Navegación del caso de estudio">
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
            <p className="case-kicker">Caso de estudio · Gobierno local</p>
            <h1>{DEMO_HEADLINE}</h1>
            <p className="case-lede">
              {DEMO_CLIENT} necesitaba responder preguntas técnicas sobre riesgo
              climático sin perder la fuente. Diseñamos un asistente documental que
              convierte normas y guías públicas en respuestas revisables, con permisos
              por grupo y trazabilidad completa.
            </p>
            <div className="case-actions">
              <DemoButtons />
              <a className="button button-secondary" href="#fuentes">
                Ver el corpus
              </a>
            </div>
            <p className="case-disclaimer">
              {DEMO_CLIENT} es un cliente ficticio. El corpus, la arquitectura y las
              cifras provienen de una implementación real sobre fuentes públicas
              colombianas.
            </p>
          </div>

          <figure className="case-map" aria-labelledby="case-map-caption">
            <div className="case-map-frame">
              <svg
                className="case-map-svg"
                viewBox="0 0 520 520"
                role="img"
                aria-label="Mapa abstracto de capas de riesgo, clima y datos abiertos"
              >
                <path className="case-contour case-contour-a" d="M40 350c70-110 150-170 250-155s140 75 185 160" />
                <path className="case-contour case-contour-b" d="M20 385c80-135 180-205 300-180s165 90 195 180" />
                <path className="case-contour case-contour-c" d="M5 425c90-165 215-245 355-205s175 110 175 205" />
                <path className="case-contour case-contour-d" d="M70 300c45-80 120-120 195-105s120 55 150 125" />
                <path className="case-contour case-contour-e" d="M120 255c30-45 75-65 120-55s75 30 95 70" />
                <circle className="case-map-ring" cx="255" cy="250" r="148" />
                <circle className="case-map-ring case-map-ring-small" cx="255" cy="250" r="92" />
                <line className="case-map-cross" x1="70" y1="250" x2="440" y2="250" />
                <line className="case-map-cross" x1="255" y1="65" x2="255" y2="435" />
                <circle className="case-map-pin pin-climate" cx="196" cy="184" r="7" />
                <circle className="case-map-pin pin-data" cx="342" cy="214" r="7" />
                <circle className="case-map-pin pin-risk" cx="286" cy="330" r="7" />
                <circle className="case-map-pin pin-territory" cx="154" cy="300" r="7" />
                <text className="case-map-label" x="208" y="176">Clima</text>
                <text className="case-map-label" x="352" y="208">Datos</text>
                <text className="case-map-label" x="296" y="346">Riesgo</text>
                <text className="case-map-label" x="78" y="296">Territorio</text>
              </svg>
              <span className="case-map-coordinate">04° 36′ N · 74° 05′ O</span>
            </div>
            <figcaption id="case-map-caption">
              Cinco capas documentales, una sola pregunta. El mapa no es geográfico:
              es la relación entre riesgo, clima, territorio y datos.
            </figcaption>
          </figure>
        </section>

        <section className="case-stats" aria-label="Cifras del proyecto">
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
            <h2>La información existe. Lo difícil es encontrarla y defenderla.</h2>
          </div>
          <div className="case-brief-grid">
            <div className="case-prose">
              <p>
                Un equipo territorial recibe preguntas concretas: qué debe contener un
                PIGCCT, cómo se incorpora la gestión del riesgo en un POT, qué pasos
                exige el IDEAM para un mapa de inundación o qué criterios hacen útil un
                dato abierto.
              </p>
              <p>
                Las respuestas están repartidas entre leyes, decretos, CONPES, guías
                metodológicas y manuales de datos. Buscar en PDFs consume tiempo y,
                sobre todo, deja una pregunta abierta: ¿en qué parte del documento está
                eso?
              </p>
              <p>
                El piloto debía responder en lenguaje natural, citar la fuente exacta y
                no convertir la ausencia de evidencia en una respuesta inventada.
              </p>
            </div>
            <aside className="case-brief-card">
              <p className="case-kicker">Cliente ficticio</p>
              <h3>{DEMO_CLIENT}</h3>
              <p>
                Municipio intermedio con equipo de planeación pequeño, alta exposición a
                inundaciones y una obligación clara: tomar decisiones con evidencia
                pública.
              </p>
              <dl>
                <div>
                  <dt>Perfil</dt>
                  <dd>Gobierno local</dd>
                </div>
                <div>
                  <dt>Necesidad</dt>
                  <dd>Consulta técnica trazable</dd>
                </div>
                <div>
                  <dt>Restricción</dt>
                  <dd>Fuentes oficiales y permisos</dd>
                </div>
              </dl>
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
                <span className="case-layer-index">{String(index + 1).padStart(2, "0")}</span>
                <span className="case-layer-icon"><Icon size={19} /></span>
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
            <h2>Del PDF publicado a una respuesta con fuente verificable.</h2>
          </div>
          <div className="case-flow" aria-label="Flujo de una consulta documental">
            {architecture.map((step, index) => (
              <div className="case-flow-step" key={step}>
                <span className="case-flow-number">{String(index + 1).padStart(2, "0")}</span>
                <strong>{step}</strong>
                {index < architecture.length - 1 ? (
                  <span className="case-flow-arrow" aria-hidden="true">→</span>
                ) : null}
              </div>
            ))}
          </div>
          <div className="case-stack">
            <div>
              <h3>Aplicación</h3>
              <p>Next.js 16, React 19, server actions y una consola de consulta con citas navegables.</p>
            </div>
            <div>
              <h3>Datos</h3>
              <p>Supabase Auth, Postgres, pgvector, RLS por grupo y auditoría encadenada.</p>
            </div>
            <div>
              <h3>Ingesta e IA</h3>
              <p>Cloudflare Worker, extracción de texto, OCR de respaldo, BGE-M3 y Gemma.</p>
            </div>
          </div>
        </section>

        <section className="case-section" id="fuentes">
          <div className="case-section-head">
            <p className="case-kicker">El corpus</p>
            <h2>23 fuentes oficiales, cinco capas de decisión.</h2>
          </div>
          <p className="case-section-lede">{DEMO_INTRO}</p>
          <div className="case-corpus-grid">
            {documentsByCategory.map((category) => (
              <article className="case-corpus-card" key={category.key}>
                <div className="case-corpus-head">
                  <h3>{category.name}</h3>
                  <span>{category.documents.length}</span>
                </div>
                <p>{category.description}</p>
                <ul>
                  {category.documents.slice(0, 3).map((document) => (
                    <li key={document.normNumber}>{document.shortTitle}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
          <details className="case-source-details">
            <summary>Ver las 23 fuentes y sus entidades</summary>
            <div className="case-source-table-wrap">
              <table className="case-source-table">
                <thead>
                  <tr>
                    <th scope="col">Documento</th>
                    <th scope="col">Entidad</th>
                    <th scope="col">Año</th>
                  </tr>
                </thead>
                <tbody>
                  {DEMO_DOCUMENTS.map((document) => (
                    <tr key={document.normNumber}>
                      <td>{document.title}</td>
                      <td>{document.entity}</td>
                      <td>{document.year}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <p className="case-footnote">
            El corpus se validó con firma PDF, tamaño máximo, número de páginas, capa de
            texto mínima y detección de duplicados. Pesa 65 MB y suma 1.393 páginas.
          </p>
        </section>

        <section className="case-section case-security-section" id="seguridad">
          <div className="case-section-head">
            <p className="case-kicker">Control</p>
            <h2>La demo es pública. El acceso a los datos no.</h2>
          </div>
          <div className="case-security-grid">
            <div className="case-security-copy">
              <p>
                La cuenta demo es compartida para que cualquier visitante pueda probar el
                producto sin registro. Esa comodidad exige límites explícitos.
              </p>
              <p>
                La aplicación deriva el modo demo del correo del perfil, no de un
                parámetro de URL. El historial y la administración se bloquean en el
                servidor; la consulta conserva permisos RLS y auditoría.
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
          </div>
        </section>

        <section className="case-section case-results-section" id="resultados">
          <div className="case-section-head">
            <p className="case-kicker">Resultados</p>
            <h2>Un corpus pequeño, una evaluación explícita.</h2>
          </div>
          <div className="case-results-grid">
            <div className="case-result-main">
              <strong>23 / 23</strong>
              <span>documentos validados y publicados</span>
              <p>
                La biblioteca total queda en 39 documentos: 15 de KPO, 1 de BPO y 23 de
                riesgo climático y datos abiertos.
              </p>
            </div>
            <div className="case-result-list">
              <div>
                <strong>1.393</strong>
                <span>páginas procesadas</span>
              </div>
              <div>
                <strong>65 MB</strong>
                <span>de fuentes oficiales</span>
              </div>
              <div>
                <strong>{DEMO_EVALUATION_CASES.length}</strong>
                <span>casos de evaluación</span>
              </div>
              <div>
                <strong>60</strong>
                <span>consultas por minuto en demo</span>
              </div>
            </div>
          </div>
          <div className="case-eval">
            <h3>Qué se evalúa</h3>
            <p>
              Ocho preguntas respondibles, una pregunta que exige abstención por falta de
              evidencia y una pregunta fuera de alcance. Se revisan fuentes recuperadas,
              citas válidas, latencia y resultado esperado.
            </p>
            <p className="case-footnote">
              La evaluación vive en el simulador del proyecto y se ejecuta contra el
              corpus publicado. Los resultados no se presentan como precisión clínica ni
              como asesoría legal.
            </p>
          </div>
        </section>

        <section className="case-cta" id="demo">
          <div>
            <p className="case-kicker">Demo pública</p>
            <h2>Haz una pregunta. Revisa la fuente.</h2>
            <p>
              Entra con la cuenta compartida, prueba las preguntas sugeridas y abre las
              citas. No necesitas registro.
            </p>
            <p className="case-suggestions">
              {DEMO_SUGGESTIONS.slice(0, 3).map((suggestion) => (
                <span key={suggestion}>{suggestion}</span>
              ))}
            </p>
          </div>
          <DemoButtons />
        </section>

        <footer className="site-footer">
          <span className="footer-brand"><BrandMark /> <strong>RAG Agent AI</strong></span>
          <span>La evidencia guía cada respuesta.</span>
          <span>Reto 3 · Bootcamp CCB</span>
        </footer>
      </main>
    </div>
  );
}
