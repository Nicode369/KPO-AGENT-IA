import { expect, test, type Page } from "@playwright/test";

test.use({ trace: "off" });

const email = process.env.E2E_EMAIL ?? process.env.INGEST_EMAIL;
const password = process.env.E2E_PASSWORD ?? process.env.INGEST_PASSWORD;

async function expectNoNextRuntimeError(page: Page) {
  const portal = page.locator("nextjs-portal");
  if (!(await portal.count())) return;
  const text = await portal.first().evaluate(
    (element) => element.shadowRoot?.textContent ?? "",
  );
  expect(text).not.toContain("Blocking Route");
  expect(text).not.toContain("unstable value");
}

test.describe("authenticated workspace", () => {
  test.skip(
    !email || !password,
    "E2E_EMAIL/E2E_PASSWORD or INGEST_EMAIL/INGEST_PASSWORD not configured",
  );

  test("superadmin signs in and opens the published library", async ({ page }) => {
    test.setTimeout(60_000);

    await page.goto("/login");
    await page.getByLabel("Correo electrónico").fill(email!);
    await page.getByLabel("Contraseña").fill(password!);
    await page.getByRole("button", { name: "Iniciar sesión" }).click();

    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectNoNextRuntimeError(page);

    await page.goto("/app/history");
    await expect(
      page.getByRole("heading", { level: 1, name: "Historial de consultas" }),
    ).toBeVisible();
    await expectNoNextRuntimeError(page);

    await page.goto("/admin");
    await expect(
      page.getByRole("heading", { level: 1, name: "Control de acceso" }),
    ).toBeVisible();
    await expectNoNextRuntimeError(page);

    await page.goto("/admin/invitations");
    await expect(
      page.getByRole("heading", { level: 1, name: "Acceso por código" }),
    ).toBeVisible();
    await expectNoNextRuntimeError(page);

    await page.goto("/admin/documents");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText(/Decreto 2420/).first()).toBeVisible();
    await expect(page.getByText(/Circular Externa 100-000015/).first()).toBeVisible();
    await expect(
      page.locator(".admin-stat", { hasText: "Fragmentos indexados" }),
    ).toContainText("1185");
    await expectNoNextRuntimeError(page);

    await page.goto("/admin/users");
    await expect(
      page.getByRole("heading", { level: 1, name: "Miembros y roles" }),
    ).toBeVisible();
    await expectNoNextRuntimeError(page);

    await page.goto("/admin/groups");
    await expect(
      page.getByRole("heading", { level: 1, name: "Fronteras de acceso" }),
    ).toBeVisible();
    await expectNoNextRuntimeError(page);

    await page.goto("/admin/audit");
    await expect(
      page.getByRole("heading", { level: 1, name: "Historial de consultas" }),
    ).toBeVisible();
    await expect(page.getByText("Consultas en 24 h")).toBeVisible();
    await expectNoNextRuntimeError(page);

    await page.goto("/admin/security");
    await expect(
      page.getByRole("heading", { level: 1, name: "Intentos bloqueados y rechazados" }),
    ).toBeVisible();
    await expect(page.getByText("Eventos en 24 h")).toBeVisible();
    await expect(page.getByText("Alertas de seguridad no configuradas")).toHaveCount(0);
    await expectNoNextRuntimeError(page);
  });
});
