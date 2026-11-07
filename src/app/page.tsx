import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";
import {
  DocumentIcon,
  GroupsIcon,
  InfoIcon,
  LibraryIcon,
  ShieldIcon,
} from "@/components/icons";

const collections = [
  {
    title: "Auditoría y aseguramiento",
    description: "Procedimientos, guías prácticas y marco de aseguramiento.",
    detail: "4 archivos de referencia",
    icon: ShieldIcon,
  },
  {
    title: "Control interno",
    description: "COSO, documentación de hallazgos y criterios de revisión.",
    detail: "Material de formación",
    icon: GroupsIcon,
  },
  {
    title: "Cumplimiento y normativa",
    description: "Circulares y documentos de referencia para Colombia.",
    detail: "Requiere validar vigencia",
    icon: DocumentIcon,
  },
];

export default function Home() {
  return (
    <div className="site-shell">
      <header className="site-header">
        <div className="site-header-inner">
          <a className="site-brand" href="#inicio" aria-label="KPO Agent AI, inicio">
            <BrandMark />
            <span className="site-wordmark">KPO <i>/</i> AGENT</span>
          </a>
          <nav className="site-nav" aria-label="Navegación principal">
            <a href="#biblioteca">Biblioteca</a>
            <span aria-disabled="true">Consultas <small>Pronto</small></span>
            <span aria-disabled="true">Historial</span>
          </nav>
          <div className="site-actions">
            <Link className="button button-primary" href="/login">Acceder</Link>
          </div>
        </div>
      </header>

      <main className="site-main" id="inicio">
        <section className="hero">
          <div className="hero-copy">
            <h1>Documentos que responden con <span className="hero-mark">evidencia.</span></h1>
            <p className="hero-lede">
              KPO Agent AI reúne fuentes de auditoría, contabilidad y cumplimiento para
              construir un espacio de consulta trazable, con permisos por grupo y citas
              verificables.
            </p>
            <div className="hero-actions">
              <Link className="button button-primary" href="/login">Acceder al espacio</Link>
              <a className="button button-secondary" href="#biblioteca">Ver biblioteca</a>
            </div>
            <p className="hero-meta">
              <span className="status-dot" />
              Entorno local · 18 archivos aún sin publicar
            </p>
          </div>

          <aside className="library-panel" aria-label="Estado de la biblioteca">
            <div className="library-panel-head">
              <div>
                <span className="panel-label">Biblioteca</span>
                <h2>En preparación</h2>
              </div>
              <span className="status-pill">Borrador</span>
            </div>
            <div className="panel-rule" />
            <ul className="library-list">
              {collections.map(({ title, detail, icon: Icon }) => (
                <li className="library-item" key={title}>
                  <span className="library-icon-wrap"><Icon size={16} /></span>
                  <span className="library-copy">
                    <strong>{title}</strong>
                    <span>{detail}</span>
                  </span>
                  <span className="library-meta">En revisión</span>
                </li>
              ))}
            </ul>
            <div className="library-panel-foot">
              <span>18 archivos locales</span>
              <span>Sin publicar</span>
            </div>
          </aside>
        </section>

        <div className="site-notice" role="note">
          <span className="site-notice-icon"><InfoIcon size={15} /></span>
          <p>
            <strong>La biblioteca todavía no está publicada.</strong> Los archivos están en
            el entorno del proyecto; aún no se han procesado ni aprobado para consultas del
            agente.
          </p>
          <span className="notice-state">Configuración inicial</span>
        </div>

        <section className="site-section" id="biblioteca">
          <div className="section-head">
            <div>
              <h2>Grupos de fuentes</h2>
              <p>Organización preliminar según el material disponible.</p>
            </div>
            <span className="section-count">03 grupos</span>
          </div>
          <div className="source-list">
            {collections.map(({ title, description, detail, icon: Icon }) => (
              <article className="source-row" key={title}>
                <span className="source-icon"><Icon size={19} /></span>
                <div className="source-copy">
                  <h3>{title}</h3>
                  <p>{description}</p>
                </div>
                <span className="source-detail">{detail}</span>
              </article>
            ))}
          </div>
        </section>

        <section className="site-section">
          <div className="lower-grid">
            <section className="milestone-panel">
              <h2>Preparar el terreno para las fuentes.</h2>
              <p>
                La siguiente etapa define los grupos, permisos y estados documentales antes
                de incorporar archivos al sistema.
              </p>
              <div className="progress" aria-hidden="true">
                <span /><span /><span /><span />
              </div>
              <div className="progress-caption">
                <span>Base de aplicación</span>
                <span>Gestión documental</span>
              </div>
            </section>
            <aside className="note-panel">
              <div className="note-panel-head">
                <LibraryIcon size={17} />
                <h3>Una nota sobre vigencia</h3>
              </div>
              <p>
                El índice de fuentes señala referencias que requieren confirmar vigencia,
                modificaciones o aplicabilidad antes de usarlas como evidencia.
              </p>
              <span className="source-path">
                Índice local: base_drive/05_Indice_fuentes_y_metadatos.csv
              </span>
            </aside>
          </div>
        </section>

        <footer className="site-footer">
          <span className="footer-brand"><BrandMark /> <strong>KPO Agent AI</strong></span>
          <span>La evidencia guía cada respuesta.</span>
          <span>Reto 3 · Bootcamp CCB</span>
        </footer>
      </main>
    </div>
  );
}
