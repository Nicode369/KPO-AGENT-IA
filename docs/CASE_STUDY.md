# Caso de estudio: riesgo climático y datos abiertos

## Resumen

La demo pública de RAG Agent AI responde preguntas sobre riesgo climático, planeación territorial y datos abiertos usando **23 PDFs públicos** de entidades colombianas. El caso se presenta con un cliente ficticio, **Alcaldía de Villa del Río**, para mostrar cómo un gobierno local podría convertir un corpus normativo disperso en respuestas trazables.

- Página pública: `/caso-de-estudio` (CLIMA) y `/caso-de-estudio/kpo` (KPO)
- Entrada: botón **DEMO CLIMA** y **DEMO KPO** en `/`, `/login`, `/caso-de-estudio` y `/caso-de-estudio/kpo`
- Cuenta compartida clima: `demo.analista@example.com`
- Cuenta compartida KPO: `demo.kpo@example.com` (grupo `kpo`)
- Grupo: `riesgo-climatico` (`restricted`)
- Límite: 60 consultas por minuto por cuenta demo
- Corpus: 23 documentos, 5 categorías, 1.393 páginas, ~65 MB
- Biblioteca total: 38 documentos publicados y 4.574 fragmentos (15 KPO + 23 CLIMA)

## Corpus

| Categoría | Documentos |
| --- | ---: |
| Marco normativo | 6 |
| Planeación y gestión del riesgo | 5 |
| Amenaza y clima | 3 |
| Adaptación y territorio | 4 |
| Datos abiertos e interoperabilidad | 5 |

Los PDFs se validan con firma `%PDF-`, tamaño máximo, páginas, capa de texto mínima y detección de duplicados antes de publicarse. La caché local vive en `data/demo-pdfs/` y no se versiona.

## Recorrido de la demo

1. El visitante llega a `/`, `/login` o `/caso-de-estudio` y pulsa **DEMO CLIMA** o **DEMO KPO**.
2. `startDemo` cierra cualquier sesión previa, inicia sesión con la cuenta de la variante y valida perfil, grupo y membresía.
3. La sesión se marca como demo por el correo del perfil, no por un parámetro de URL.
4. `/app` muestra el banner de demo, un panel de preguntas por grupo y un historial compartido filtrado por grupo, con filtros por categoría y etiquetas de color para todos los resultados; limita las consultas a 60/minuto.
5. Cada respuesta conserva fuentes numeradas, citas versionadas, abstención sin evidencia, RLS y auditoría.
6. `/caso-de-estudio` explica el caso CLIMA y `/caso-de-estudio/kpo` el caso de auditoría y cumplimiento.

## Arquitectura

```text
PDF oficial -> Worker de ingesta -> texto/OCR -> fragmentos
             -> embeddings BGE-M3 -> Postgres + pgvector
             -> recuperación con RLS -> respuesta citada -> auditoría
```

La aplicación Next.js y el Worker de Cloudflare están separados. El Worker procesa documentos y modelos; la app resuelve sesión, permisos, consulta y presentación.

## Seguridad

- Contraseña demo solo en el servidor.
- Modo demo derivado del perfil, no de `?demo=1`.
- Historial compartido por demo, filtrado por grupo y sin `blocked`/`rejected`/`error`; administración bloqueada en el servidor.
- RLS por grupo y funciones `security definer` para operaciones controladas.
- Auditoría encadenada por hash.
- Filtro de prompt injection, extracción masiva y acciones destructivas.
- Abstención cuando el corpus no sostiene una respuesta.

## Evaluación

El simulador climático define 10 casos: 8 respondibles, 1 ambiguo que exige abstención y 1 fuera de alcance. El simulador KPO incorpora un banco de 50 consultas del CCB: 30 estándar, 10 fuera de alcance y 10 intentos de jailbreak; 16 deben responderse con fuentes, 14 abstenerse y 10 bloquearse. Se revisan fuentes recuperadas, citas válidas, términos esperados, latencia y resultado esperado. Los resultados no se presentan como precisión clínica ni como asesoría legal.

### Resultado de la corrida inicial

La primera corrida completa (10 de noviembre de 2026) terminó 10/10 casos, sin errores:

| Métrica | Resultado |
| --- | ---: |
| Resultado esperado | 8/10 |
| Coincidencia estricta (resultado + fuente + términos) | 5/10 |
| Respuestas respondidas con citas | 100% |
| Latencia media | 12,0 s |
| Latencia p95 | 18,2 s |

Los desacuerdos fueron útiles: la pregunta sobre mapas de inundación recuperó la guía correcta pero el modelo se abstuvo; la pregunta fuera de alcance se clasificó como evidencia insuficiente porque el umbral de similitud todavía recupera fragmentos genéricos; el caso de la Ley 1523 citó un decreto relacionado en lugar del documento principal; y el caso del CONPES 3920 no repitió la frase “datos abiertos”. También se corrigió un término de evaluación mal definido (`clima` no puede coincidir con `climático`).

### Resultado del banco KPO

La primera corrida completa del banco KPO (50/50 casos, 11 de noviembre de 2026) terminó sin errores técnicos:

| Métrica | Resultado |
| --- | ---: |
| Resultado esperado | 33/50 |
| Coincidencia estricta (resultado + fuente + términos) | 28/50 |
| Jailbreaks bloqueados | 10/10 |
| Respuestas `answered` con citas | 100% |
| Latencia media | 3,4 s |
| Latencia p95 | 13,0 s |

Los diez casos fuera de alcance se clasificaron como `insufficient_evidence`: el umbral de recuperación (0,2) todavía devuelve fragmentos genéricos para preguntas no relacionadas. Seis casos respondibles se abstuvieron y un caso esperado como abstención respondió. El banco se conserva con los resultados esperados originales para no maquillar la métrica; los desacuerdos quedan como trabajo de calibración del agente.

## Reproducir

```bash
npm run setup:demo           # dry-run
npm run setup:demo -- --apply --replace
npm run setup:demo -- --apply --replace --rotate
```

Si el Worker gratuito supera su límite de CPU con PDFs grandes:

```bash
cd workers/kpo-ingest
npm run dev
```

En otra terminal:

```bash
DEMO_WORKER_URL=http://localhost:8787 npm run setup:demo -- --apply --replace
```

## Límites

- El cliente y el piloto son un escenario de portafolio; no representan un contrato real.
- La demo es compartida y no debe usarse para datos sensibles.
- El Worker gratuito tiene límite de CPU; los documentos grandes requieren ingesta local o un plan pago.
- La evaluación es una muestra explícita, no un benchmark exhaustivo.
