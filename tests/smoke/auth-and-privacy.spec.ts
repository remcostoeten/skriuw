import { expect, test, type Page } from "@playwright/test";

const AUTH_PREFERENCES_KEY = "haptic:auth:preferences:v1";

async function seedPrivacyMode(page: Page) {
  await page.addInitScript(([storageKey, value]) => {
    window.localStorage.setItem(storageKey, JSON.stringify(value));
  }, [AUTH_PREFERENCES_KEY, { mode: "privacy", rememberMe: true }] as const);
}

async function seedAccountMode(page: Page) {
  await page.addInitScript(([storageKey, value]) => {
    window.localStorage.setItem(storageKey, JSON.stringify(value));
  }, [AUTH_PREFERENCES_KEY, { mode: "account", rememberMe: true }] as const);
}

test("opens in privacy mode on a fresh visit", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveURL("/");
  await expect(page.getByLabel("Notes")).toBeVisible();
  await expect(page.getByLabel("Journal")).toBeVisible();
  await expect(page.getByLabel("Settings")).toBeVisible();
  await expect(page.getByLabel("Private")).toBeVisible();
});

test("shows the account sign-in gate when account mode is preferred", async ({ page }) => {
  await seedAccountMode(page);
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue in privacy mode" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
});

test("can leave the account gate and enter privacy mode", async ({ page }) => {
  await seedAccountMode(page);
  await page.goto("/");

  await page.getByRole("button", { name: "Continue in privacy mode" }).click();

  await expect(page).toHaveURL("/");
  await expect(page.getByLabel("Notes")).toBeVisible();
  await expect(page.getByLabel("Journal")).toBeVisible();
  await expect(page.getByLabel("Settings")).toBeVisible();
  await expect(page.getByLabel("Private")).toBeVisible();
  await expect(page.getByLabel("Resize sidebar")).toBeVisible();
});

test("loads the journal workspace in privacy mode", async ({ page }) => {
  await seedPrivacyMode(page);

  await page.goto("/journal");

  await expect(page).toHaveURL("/journal");
  await expect(page.locator("h1").filter({ hasText: "Journal" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Today" })).toBeVisible();
  await expect(page.getByLabel("Private")).toBeVisible();
});

test("can switch from privacy mode back to the signed-out account gate", async ({ page }) => {
  await seedPrivacyMode(page);

  await page.goto("/");
  await page.getByLabel("Private").click();
  await page.getByRole("button", { name: "Account mode" }).click();

  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue in privacy mode" })).toBeVisible();
});
