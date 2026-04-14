import { expect, test, type Page } from "@playwright/test";

const AUTH_PREFERENCES_KEY = "skriuw:auth:preferences:v1";

async function seedGuestMode(page: Page) {
  await page.addInitScript(([storageKey, value]) => {
    window.localStorage.setItem(storageKey, JSON.stringify(value));
  }, [AUTH_PREFERENCES_KEY, { mode: "guest", rememberMe: true }] as const);
}

async function seedCloudMode(page: Page) {
  await page.addInitScript(([storageKey, value]) => {
    window.localStorage.setItem(storageKey, JSON.stringify(value));
  }, [AUTH_PREFERENCES_KEY, { mode: "cloud", rememberMe: true }] as const);
}

test("opens in guest mode on a fresh visit", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveURL("/");
  await expect(page.getByRole("link", { name: "Notes" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Journal" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open settings" })).toBeVisible();
  await expect(page.getByLabel("Guest")).toBeVisible();
});

test("still opens the app when cloud mode is preferred", async ({ page }) => {
  await seedCloudMode(page);
  await page.goto("/");

  await expect(page.getByRole("link", { name: "Notes" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Journal" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open settings" })).toBeVisible();
  await expect(page.getByLabel("Sign in")).toBeVisible();
});

test("can open the auth modal from the app chrome", async ({ page }) => {
  await seedCloudMode(page);
  await page.goto("/");

  await page.getByLabel("Sign in").click();

  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await expect(page.getByRole("button", { name: "Cloud workspace" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Guest workspace" })).toBeVisible();
});

test("loads the journal workspace in guest mode", async ({ page }) => {
  await seedGuestMode(page);

  await page.goto("/journal");

  await expect(page).toHaveURL("/journal");
  await expect(page.getByRole("button", { name: "Go to today" })).toBeVisible();
  await expect(page.getByLabel("Guest")).toBeVisible();
});

test("can still switch the app into guest mode from the modal", async ({ page }) => {
  await seedGuestMode(page);

  await page.goto("/");
  await page.getByLabel("Guest").click();

  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByRole("button", { name: "Cloud workspace" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Guest workspace" })).toBeVisible();
});
