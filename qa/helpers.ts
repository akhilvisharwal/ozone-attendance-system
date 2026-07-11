import { expect, test as base, type BrowserContext, type Download, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

export type QaRole = "admin" | "juniorAdmin" | "employee";

type RoleCredentials = {
  employeeId: string;
  password: string;
};

const roleKeys: Record<QaRole, [string, string]> = {
  admin: ["QA_ADMIN_EMPLOYEE_ID", "QA_ADMIN_PASSWORD"],
  juniorAdmin: ["QA_JUNIOR_ADMIN_EMPLOYEE_ID", "QA_JUNIOR_ADMIN_PASSWORD"],
  employee: ["QA_EMPLOYEE_ID", "QA_EMPLOYEE_PASSWORD"],
};

export function credentialsFor(role: QaRole): RoleCredentials | null {
  const [idKey, passwordKey] = roleKeys[role];
  const employeeId = process.env[idKey]?.trim();
  const password = process.env[passwordKey]?.trim();
  return employeeId && password ? { employeeId, password } : null;
}

export function skipWithoutCredentials(role: QaRole): RoleCredentials {
  const credentials = credentialsFor(role);
  base.skip(
    !credentials,
    `Missing ${roleKeys[role].join(" and ")}; role smoke requires disposable QA credentials.`
  );
  return credentials!;
}

export async function loginAs(page: Page, role: QaRole): Promise<void> {
  const credentials = skipWithoutCredentials(role);
  await page.goto("/login");
  await page.getByLabel("Employee ID").fill(credentials.employeeId);
  await page.getByLabel("Password").fill(credentials.password);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).not.toHaveURL(/\/login(?:\?|$)/);
}

export async function assertLoggedOut(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
  await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
}

export async function assertReloadEndsSession(page: Page): Promise<void> {
  await page.reload();
  await assertLoggedOut(page);
}

export async function assertOfflineEndsSession(page: Page): Promise<void> {
  await page.context().setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
  await page.context().setOffline(false);
}

export async function assertReopenEndsSession(context: BrowserContext, page: Page): Promise<Page> {
  await page.close({ runBeforeUnload: true });
  const reopened = await context.newPage();
  await reopened.goto("/");
  await assertLoggedOut(reopened);
  return reopened;
}

export async function fillOtp(page: Page, code: string): Promise<void> {
  const singleInput = page.getByLabel(/verification code|otp/i);
  if (await singleInput.count()) {
    await singleInput.fill(code);
    return;
  }
  const digits = page.locator('input[inputmode="numeric"]');
  await expect(digits).toHaveCount(code.length);
  for (let index = 0; index < code.length; index += 1) {
    await digits.nth(index).fill(code[index]);
  }
}

export async function uploadFixture(
  page: Page,
  selector: string,
  relativePath = "fixtures/sample-upload.txt"
): Promise<void> {
  await page.locator(selector).setInputFiles(path.resolve("qa", relativePath));
}

export async function captureDownload(
  page: Page,
  trigger: () => Promise<unknown>,
  expectedExtension?: string
): Promise<{ download: Download; savedPath: string }> {
  const pending = page.waitForEvent("download");
  await trigger();
  const download = await pending;
  const suggested = download.suggestedFilename();
  if (expectedExtension) expect(suggested.toLowerCase()).toEndWith(expectedExtension.toLowerCase());
  const savedPath = base.info().outputPath(suggested);
  await download.saveAs(savedPath);
  expect((await fs.stat(savedPath)).size).toBeGreaterThan(0);
  return { download, savedPath };
}

export async function assertNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body?.scrollWidth ?? 0,
  }));
  expect(
    Math.max(overflow.document, overflow.body),
    `Page overflows horizontally: ${JSON.stringify(overflow)}`
  ).toBeLessThanOrEqual(overflow.viewport + 1);
}

export async function captureEvidence(page: Page, name: string): Promise<void> {
  await page.screenshot({
    path: base.info().outputPath(`${name.replace(/[^a-z0-9_-]+/gi, "-")}.png`),
    fullPage: true,
  });
}

type RuntimeIssue = {
  kind: "console" | "pageerror" | "requestfailed" | "http";
  detail: string;
};

export const test = base.extend<{ runtimeIssues: RuntimeIssue[] }>({
  runtimeIssues: async ({ page }, use, testInfo) => {
    const issues: RuntimeIssue[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") issues.push({ kind: "console", detail: message.text() });
    });
    page.on("pageerror", (error) => issues.push({ kind: "pageerror", detail: error.message }));
    page.on("requestfailed", (request) => {
      const detail = `${request.method()} ${request.url()} ${request.failure()?.errorText ?? ""}`;
      if (!detail.includes("net::ERR_ABORTED")) issues.push({ kind: "requestfailed", detail });
    });
    page.on("response", (response) => {
      if (response.status() >= 400) {
        issues.push({
          kind: "http",
          detail: `${response.status()} ${response.request().method()} ${response.url()}`,
        });
      }
    });

    await use(issues);

    if (issues.length) {
      await testInfo.attach("runtime-issues", {
        body: Buffer.from(JSON.stringify(issues, null, 2)),
        contentType: "application/json",
      });
    }
    const fatal = issues.filter(
      (issue) => issue.kind !== "http" || /^5\d\d /.test(issue.detail)
    );
    expect(fatal, `Unexpected browser/runtime errors:\n${JSON.stringify(fatal, null, 2)}`).toEqual([]);
  },
});

export { expect };
