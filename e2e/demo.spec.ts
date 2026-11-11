import { expect, test } from "@playwright/test";

test.use({ trace: "off" });

const climaReady = Boolean(
  process.env.DEMO_CLIMA_EMAIL ?? process.env.DEMO_ANALYST_EMAIL,
);
const climaPassword = Boolean(
  process.env.DEMO_CLIMA_PASSWORD ?? process.env.DEMO_ANALYST_PASSWORD,
);
const kpoReady = Boolean(
  process.env.DEMO_KPO_EMAIL && process.env.DEMO_KPO_PASSWORD,
);

test.describe("public demo", () => {
  test("shows both demo buttons on the landing, login and case study", async ({
    page,
  }) => {
    for (const path of ["/", "/login", "/caso-de-estudio"]) {
      await page.goto(path);
      await expect(
        page.getByRole("button", { name: "DEMO KPO" }).first(),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "DEMO CLIMA" }).first(),
      ).toBeVisible();
      await expect(page.getByText("Reto 3 · Bootcamp CCB")).toHaveCount(0);
    }
  });

  test.describe("climate demo", () => {
    test.skip(
      !(climaReady && climaPassword),
      "DEMO_CLIMA_* / DEMO_ANALYST_* not configured",
    );

    test("DEMO CLIMA opens the workspace with shared history", async ({ page }) => {
      test.setTimeout(60_000);

      await page.goto("/");
      await page.getByRole("button", { name: "DEMO CLIMA" }).click();

      await expect(page).toHaveURL(/\/app\?demo=1/, { timeout: 30_000 });
      await expect(page.getByText("Demo CLIMA").first()).toBeVisible();
      await expect(page.getByRole("link", { name: "Historial" })).toBeVisible();
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByText("Preguntas sugeridas")).toBeVisible();
      await expect(page.getByRole("button", { name: /POT municipal/ })).toBeVisible();

      await page.goto("/app/history");
      await expect(page).toHaveURL(/\/app\/history/);
      await expect(page.getByRole("heading", { name: "Historial compartido" })).toBeVisible();
      await expect(page.getByText(/No escribas datos personales/).first()).toBeVisible();
      const filters = page.getByRole("navigation", { name: "Filtrar por categoría" });
      await expect(filters).toBeVisible();
      await expect(filters.getByRole("link")).toHaveCount(7);
      await expect(filters.getByRole("link", { name: "Todas" })).toHaveAttribute(
        "aria-current",
        "page",
      );
      await expect(filters.getByRole("link", { name: "Bloqueada" })).toBeVisible();
      await expect(filters.getByRole("link", { name: "Rechazada" })).toBeVisible();
      await filters.getByRole("link", { name: "Bloqueada" }).click();
      await expect(page).toHaveURL(/outcome=blocked/);
      await expect(filters.getByRole("link", { name: "Bloqueada" })).toHaveAttribute(
        "aria-current",
        "page",
      );
      await expect(page.getByText(/100-000015/)).toHaveCount(0);
    });
  });

  test.describe("KPO demo", () => {
    test.skip(!kpoReady, "DEMO_KPO_* not configured");

    test("DEMO KPO opens the KPO workspace with shared history", async ({ page }) => {
      test.setTimeout(60_000);

      await page.goto("/login");
      await page.getByRole("button", { name: "DEMO KPO" }).click();

      await expect(page).toHaveURL(/\/app\?demo=1/, { timeout: 30_000 });
      await expect(page.getByText("Demo KPO").first()).toBeVisible();
      await expect(page.getByText(/biblioteca KPO/i).first()).toBeVisible();
      await expect(page.getByRole("link", { name: "Historial" })).toBeVisible();
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByText("Preguntas sugeridas")).toBeVisible();
      await expect(page.getByRole("button", { name: /Qué NIA aplica/ })).toBeVisible();
      const groupDocuments = page.locator(".workspace-status > div", {
        hasText: "Documentos del grupo",
      });
      await expect(groupDocuments).toBeVisible();
      await expect(groupDocuments.locator("strong")).toHaveText(/^\d+$/);

      await page.goto("/app/history");
      await expect(page).toHaveURL(/\/app\/history/);
      await expect(page.getByRole("heading", { name: "Historial compartido" })).toBeVisible();
      await expect(page.getByText(/No escribas datos personales/).first()).toBeVisible();
      await expect(
        page.getByRole("navigation", { name: "Filtrar por categoría" }),
      ).toBeVisible();
      await expect(page.getByText(/POT municipal/)).toHaveCount(0);
    });

    test("logout returns to the public landing", async ({ page }) => {
      test.setTimeout(60_000);

      await page.goto("/login");
      await page.getByRole("button", { name: "DEMO KPO" }).click();
      await expect(page).toHaveURL(/\/app\?demo=1/, { timeout: 30_000 });

      await page.getByRole("button", { name: "Cerrar sesión" }).click();
      await expect(page).toHaveURL(/\/$/, { timeout: 30_000 });
      await expect(
        page.getByRole("heading", { level: 1, name: /Documentos que responden/ }),
      ).toBeVisible();
    });

    test("suggestions stay visible after an answer", async ({ page }) => {
      test.setTimeout(60_000);

      await page.route("**/api/agent/query", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            answer:
              "**Obligación:** validar la vigencia antes de aplicar [1].\n\n- Documentar la evidencia.\n- Escalar al responsable.",
            abstained: false,
            outcome: "answered",
            outcomeReason: null,
            sources: [
              {
                rank: 1,
                chunk_id: "chunk-1",
                document_id: "document-1",
                version_id: "version-1",
                version: 1,
                title: "Documento de prueba",
                page: 1,
                section: null,
                article: null,
                numeral: null,
                similarity: 0.9,
                excerpt: "Extracto de prueba.",
              },
            ],
            model: "test-model",
            latencyMs: 120,
            auditSaved: true,
          }),
        });
      });

      await page.goto("/login");
      await page.getByRole("button", { name: "DEMO KPO" }).click();
      await expect(page).toHaveURL(/\/app\?demo=1/, { timeout: 30_000 });

      const suggestion = page.getByRole("button", { name: /Qué NIA aplica/ });
      await suggestion.click();
      await expect(page.getByText("Base KPO", { exact: true })).toBeVisible();
      await expect(page.locator(".rich-answer strong")).toHaveText("Obligación:");
      await expect(page.getByText("Documentar la evidencia.")).toBeVisible();
      await expect(page.getByLabel("Ir a la fuente 1")).toBeVisible();
      await expect(page.getByText(/\*\*Obligación/)).toHaveCount(0);
      await expect(page.getByText("Preguntas sugeridas")).toBeVisible();
      await expect(suggestion).toBeVisible();
    });
  });

  test("KPO case study exposes the KPO demo", async ({ page }) => {
    await page.goto("/caso-de-estudio/kpo");
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: /Cuando la norma cambia/,
      }),
    ).toBeVisible();
    await expect(page.getByText("15", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("documentos publicados").first()).toBeVisible();
    await expect(page.getByText("1.185").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "DEMO KPO" }).first()).toBeVisible();
    await expect(page.locator(".case-corpus-grid-kpo .case-corpus-card")).toHaveCount(3);
    await expect(page.locator(".case-corpus-summary")).toContainText("15");
  });

  test("case study links back to the climate demo", async ({ page }) => {
    test.setTimeout(60_000);
    test.skip(
      !(climaReady && climaPassword),
      "DEMO_CLIMA_* / DEMO_ANALYST_* not configured",
    );

    await page.goto("/caso-de-estudio");
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: /Cuando el riesgo climático/,
      }),
    ).toBeVisible();
    await expect(page.getByText(/23 fuentes oficiales/).first()).toBeVisible();
    await expect(page.getByText(/1\.393/).first()).toBeVisible();

    await page.getByRole("button", { name: "DEMO CLIMA" }).last().click();
    await expect(page).toHaveURL(/\/app\?demo=1/, { timeout: 30_000 });
  });
});
