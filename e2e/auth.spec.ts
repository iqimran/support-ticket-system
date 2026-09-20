import { expect, test, type Page } from "@playwright/test";
import { E2E_ADMIN, E2E_TEAM_MEMBER } from "./fixtures";

async function loginAs(page: Page, phone: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Phone").fill(phone);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  // Wait for the server action's redirect to land before the caller
  // navigates again, otherwise the next goto can race the cookie being set.
  await page.waitForURL(/\/dashboard/);
}

test.describe("route protection", () => {
  test("unauthenticated users cannot access the dashboard", async ({ page }) => {
    const response = await page.goto("/dashboard");

    await expect(page).toHaveURL(/\/login/);
    expect(response?.status()).toBeLessThan(400);
  });

  test("unauthenticated users cannot access ticket pages", async ({ page }) => {
    await page.goto("/tickets");
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("team member permissions", () => {
  test("team members can access normal ticket pages", async ({ page }) => {
    await loginAs(page, E2E_TEAM_MEMBER.phone, E2E_TEAM_MEMBER.password);

    await page.goto("/tickets");

    await expect(page).toHaveURL(/\/tickets/);
    await expect(page.getByRole("heading", { name: "Tickets" })).toBeVisible();
  });

  test("team members cannot access payment audit pages", async ({ page }) => {
    await loginAs(page, E2E_TEAM_MEMBER.phone, E2E_TEAM_MEMBER.password);

    // proxy.ts redirects the role mismatch away before the page ever
    // renders (its own requireAdmin() -> notFound() is the fallback for
    // when proxy is bypassed — see the direct requireAdmin() unit tests).
    await page.goto("/admin/payment-audit");

    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("heading", { name: "Payment Audit Log" })).toHaveCount(0);
  });

  test("team members do not see the Payment Audit nav link", async ({ page }) => {
    await loginAs(page, E2E_TEAM_MEMBER.phone, E2E_TEAM_MEMBER.password);

    await expect(page.getByRole("link", { name: "Payment Audit" })).toHaveCount(0);
  });
});

test.describe("admin permissions", () => {
  test("admin can access payment audit pages", async ({ page }) => {
    await loginAs(page, E2E_ADMIN.phone, E2E_ADMIN.password);

    const response = await page.goto("/admin/payment-audit");

    expect(response?.status()).toBeLessThan(400);
    await expect(page.getByRole("heading", { name: "Payment Audit Log" })).toBeVisible();
  });
});

test.describe("logout", () => {
  test("logging out invalidates the session server-side", async ({ page }) => {
    await loginAs(page, E2E_TEAM_MEMBER.phone, E2E_TEAM_MEMBER.password);
    await expect(page).toHaveURL(/\/dashboard/);

    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/login/);

    // The old session cookie (if replayed) must no longer grant access.
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });
});
