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
      await expect(page.getByText("Bloqueada", { exact: true })).toHaveCount(0);
      await expect(page.getByText("Rechazada", { exact: true })).toHaveCount(0);
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
      await expect(page.getByRole("button", { name: /100-000015/ })).toBeVisible();

      await page.goto("/app/history");
      await expect(page).toHaveURL(/\/app\/history/);
      await expect(page.getByRole("heading", { name: "Historial compartido" })).toBeVisible();
      await expect(page.getByText(/No escribas datos personales/).first()).toBeVisible();
      await expect(page.getByText(/POT municipal/)).toHaveCount(0);
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
