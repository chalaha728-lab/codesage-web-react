import { test, expect } from "@playwright/test";

test("app renders heading", async ({ page }) => {
  await page.goto("./");
  await expect(page.locator("body")).not.toBeEmpty();
  // Take a screenshot for the artifacts
  await page.screenshot({ path: "screenshots/home.png", fullPage: true });
});

test("no console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  await page.goto("./");
  await page.waitForTimeout(500);
  expect(errors).toEqual([]);
});
