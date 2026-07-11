import {
  assertLoggedOut,
  assertNoHorizontalOverflow,
  assertReloadEndsSession,
  loginAs,
  test,
  expect,
  type QaRole,
} from "./helpers";

test.describe("safe public smoke", () => {
  test("health and login page render without overflow", async ({ page, request }) => {
    const health = await request.get("/api/health");
    expect(health.ok()).toBeTruthy();
    expect(await health.json()).toMatchObject({ status: "ok" });

    await page.goto("/login");
    await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Forgot password" })).toBeVisible();
    await assertNoHorizontalOverflow(page);
  });

  test("protected routes redirect anonymous users", async ({ page }) => {
    await page.goto("/admin");
    await assertLoggedOut(page);
  });
});

const roleDestinations: Array<[QaRole, RegExp]> = [
  ["admin", /\/admin(?:\/|$)/],
  ["juniorAdmin", /\/admin(?:\/|$)/],
  ["employee", /\/$/],
];

for (const [role, destination] of roleDestinations) {
  test(`logs in as ${role} and revokes session on reload`, async ({ page }) => {
    await loginAs(page, role);
    await expect(page).toHaveURL(destination);
    await assertNoHorizontalOverflow(page);
    await assertReloadEndsSession(page);
  });
}
