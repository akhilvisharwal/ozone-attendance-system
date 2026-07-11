import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { Server } from "node:http";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { createApp } from "../app";
import { pool } from "../config/db";

const databaseUrl = process.env.DATABASE_URL ?? "";
const databaseName = (() => {
  try {
    return new URL(databaseUrl).pathname.slice(1).toLowerCase();
  } catch {
    return "";
  }
})();
const mutationAllowed =
  process.env.QA_ALLOW_DB_MUTATION === "1" && /(^|[_-])(qa|test)([_-]|$)/.test(databaseName);

describe("isolated HTTP integration", { skip: !mutationAllowed }, () => {
  let server: Server;
  let baseUrl: string;
  const suffix = randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase();
  const password = `Qa-${suffix}-Password!`;
  const createdEmployeeIds: string[] = [];

  async function createUser(role: "admin" | "junior_admin" | "employee") {
    const employeeCode = `QA${role[0].toUpperCase()}${suffix}`.slice(0, 20);
    const passwordHash = await bcrypt.hash(password, 4);
    const permissions = {};
    const result = await pool.query<{ id: string }>(
      `INSERT INTO employees (
         employee_code, name, email, password_hash, role, is_active,
         must_change_password, first_login_completed, admin_permissions
       )
       VALUES ($1, $2, $3, $4, $5, true, false, true, $6)
       RETURNING id`,
      [
        employeeCode,
        `QA ${role}`,
        `${employeeCode.toLowerCase()}@example.test`,
        passwordHash,
        role,
        permissions,
      ]
    );
    createdEmployeeIds.push(result.rows[0].id);
    return { id: result.rows[0].id, employeeCode };
  }

  async function request(
    path: string,
    init: RequestInit & { token?: string; cookie?: string } = {}
  ): Promise<Response> {
    const headers = new Headers(init.headers);
    if (init.token) headers.set("authorization", `Bearer ${init.token}`);
    if (init.cookie) headers.set("cookie", init.cookie);
    if (init.body && typeof init.body === "string") headers.set("content-type", "application/json");
    return fetch(`${baseUrl}${path}`, { ...init, headers });
  }

  async function login(employeeCode: string) {
    const response = await request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ employeeId: employeeCode, password }),
    });
    assert.equal(response.status, 200);
    const body = (await response.json()) as { accessToken: string };
    const setCookie = response.headers.get("set-cookie") ?? "";
    assert.match(setCookie, /refreshToken=/);
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=Lax/i);
    return {
      accessToken: body.accessToken,
      cookie: setCookie.split(";")[0],
    };
  }

  before(async () => {
    server = createApp().listen(0, "127.0.0.1");
    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("HTTP test server did not bind");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
    if (createdEmployeeIds.length) {
      await pool.query(`UPDATE audit_logs SET actor_id = NULL WHERE actor_id = ANY($1::uuid[])`, [
        createdEmployeeIds,
      ]);
      await pool.query(`DELETE FROM employees WHERE id = ANY($1::uuid[])`, [createdEmployeeIds]);
    }
  });

  it("covers auth, authorization, ACLs, and safe domain reads", async () => {
    const admin = await createUser("admin");
    const junior = await createUser("junior_admin");
    const employee = await createUser("employee");

    assert.equal((await request("/api/notifications")).status, 401);
    assert.equal((await request("/api/files/missing.txt")).status, 401);

    const employeeSession = await login(employee.employeeCode);
    const refreshed = await request("/api/auth/refresh", {
      method: "POST",
      cookie: employeeSession.cookie,
    });
    assert.equal(refreshed.status, 200);

    assert.equal(
      (await request("/api/auth/me", { token: employeeSession.accessToken })).status,
      200
    );
    assert.equal(
      (await request("/api/reports/view", { token: employeeSession.accessToken })).status,
      403
    );
    assert.equal(
      (
        await request(`/api/files/avatars/${employee.employeeCode}/does-not-exist.png`, {
          token: employeeSession.accessToken,
        })
      ).status,
      404
    );
    assert.equal(
      (
        await request("/api/attendance/check-in", {
          method: "POST",
          token: employeeSession.accessToken,
          body: JSON.stringify({ latitude: 0, longitude: 0 }),
        })
      ).status,
      400
    );

    for (const path of [
      "/api/leaves/mine",
      "/api/tasks/me",
      "/api/notifications",
      "/api/notifications/unread-count",
    ]) {
      assert.equal((await request(path, { token: employeeSession.accessToken })).status, 200, path);
    }

    const juniorSession = await login(junior.employeeCode);
    assert.equal(
      (await request("/api/reports/view", { token: juniorSession.accessToken })).status,
      403
    );
    assert.equal(
      (await request("/api/attendance", { token: juniorSession.accessToken })).status,
      403
    );

    const adminSession = await login(admin.employeeCode);
    const report = await request("/api/reports/view", { token: adminSession.accessToken });
    assert.equal(report.status, 200);
    assert.ok(Array.isArray(((await report.json()) as { rows: unknown[] }).rows));

    const logout = await request("/api/auth/logout", {
      method: "POST",
      cookie: employeeSession.cookie,
    });
    assert.equal(logout.status, 200);
    assert.match(logout.headers.get("set-cookie") ?? "", /refreshToken=;/);
    assert.equal(
      (
        await request("/api/auth/refresh", {
          method: "POST",
          cookie: employeeSession.cookie,
        })
      ).status,
      401
    );
  });
});
