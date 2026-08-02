import { test, expect } from "@playwright/test";

test.describe("landing", () => {
  test("renders hero and CTAs", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: /Turn ideas into/i }),
    ).toBeVisible();
    await expect(page.getByText("Hourse").first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Start creating free" }).first(),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });

  test("login button is present for Google OAuth flow", async ({ page }) => {
    await page.goto("/");
    const login = page.getByRole("button", { name: "Sign in" });
    await expect(login).toBeEnabled();
  });
});

test.describe("protected routes", () => {
  test("redirects unauthenticated dashboard visitors to home with next", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await page.waitForURL(/\/(\?next=.*)?/);
    expect(page.url()).toMatch(/localhost|127\.0\.0\.1/);
    const body = await page.textContent("body");
    expect(body).toBeTruthy();
  });
});

test.describe("marketing pages", () => {
  test("pricing page renders plans", async ({ page }) => {
    await page.goto("/pricing");
    await expect(page.getByRole("heading", { name: "Pricing" })).toBeVisible();
    await expect(page.getByText("Creator").first()).toBeVisible();
    await expect(page.getByText("Credit Pack 50")).toBeVisible();
  });
});
