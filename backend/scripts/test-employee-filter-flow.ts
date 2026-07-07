import { pool } from "../src/config/db";
import * as employeesRepo from "../src/modules/employees/employees.repository";
import { listAllAttendance } from "../src/modules/attendance/attendance.repository";
import bcrypt from "bcryptjs";

const BASE = "http://localhost:4000/api";

async function login(): Promise<string> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ employeeId: "OZNADMIN", password: "ChangeMe@123" }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Login failed: ${JSON.stringify(data)}`);
  return data.accessToken as string;
}

async function apiGet(token: string, path: string) {
  const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  return { status: res.status, data };
}

async function main() {
  console.log("=== DB: listActiveEmployees ===");
  const active = await employeesRepo.listActiveEmployees();
  console.log(`Active employees in DB: ${active.length}`);
  assert(active.length > 0, "Expected at least one active employee");
  for (const e of active) {
    assert(e.is_active === true, `${e.employee_code} should be active`);
    assert(e.deleted_at == null, `${e.employee_code} should not be deleted`);
  }
  console.log("DB active list: OK");

  const token = await login();
  console.log("\n=== API: GET /employees/active ===");
  const activeApi = await apiGet(token, "/employees/active");
  assert(activeApi.status === 200, `/employees/active returned ${activeApi.status}`);
  assert(activeApi.data.items.length === active.length, "API active count should match DB");
  console.log(`API active employees: ${activeApi.data.items.length}`);

  console.log("\n=== API: broken limit=200 should fail ===");
  const badLimit = await apiGet(token, "/employees?limit=200");
  assert(badLimit.status === 400, "limit=200 should return 400");
  console.log("Invalid limit rejected: OK");

  console.log("\n=== API: GET /employees?isActive=true&limit=100 ===");
  const paged = await apiGet(token, "/employees?isActive=true&limit=100");
  assert(paged.status === 200, "paged active list should succeed");
  console.log(`Paged active employees: ${paged.data.items.length}`);

  if (active.length === 0) {
    console.log("No employees to test filtering.");
    return;
  }

  const target = active[0];
  console.log(`\n=== Filter attendance by employee: ${target.name} ===`);
  const dbFiltered = await listAllAttendance({ employeeId: target.id, page: 1, limit: 200 });
  const apiFiltered = await apiGet(
    token,
    `/attendance?employeeId=${target.id}&page=1&limit=200`
  );
  assert(apiFiltered.status === 200, "attendance filter API failed");
  assert(
    apiFiltered.data.items.every((r: { employee_id: string }) => r.employee_id === target.id),
    "API attendance rows must match selected employee"
  );
  assert(apiFiltered.data.total === dbFiltered.total, "API total must match DB total");
  console.log(`Employee filter: OK (${apiFiltered.data.total} records)`);

  // Create temp employee, verify appears in active list, deactivate, verify removed, delete
  console.log("\n=== Lifecycle: create -> list -> deactivate -> delete ===");
  const code = `TST${Date.now().toString().slice(-6)}`;
  const hash = await bcrypt.hash("TempPass@123", 12);
  const created = await employeesRepo.createEmployee({
    employeeCode: code,
    name: "Filter Test Employee",
    email: null,
    phone: null,
    passwordHash: hash,
    role: "employee",
    createdBy: active[0].created_by ?? active[0].id,
  });
  console.log(`Created ${code}`);

  let afterCreate = await employeesRepo.listActiveEmployees();
  assert(afterCreate.some((e) => e.id === created.id), "New employee should appear in active list");
  console.log("After create: appears in active list");

  await employeesRepo.setEmployeeActive(created.id, false);
  afterCreate = await employeesRepo.listActiveEmployees();
  assert(!afterCreate.some((e) => e.id === created.id), "Deactivated employee should not be in active list");
  console.log("After deactivate: removed from active list");

  await employeesRepo.setEmployeeActive(created.id, true);
  afterCreate = await employeesRepo.listActiveEmployees();
  assert(afterCreate.some((e) => e.id === created.id), "Reactivated employee should reappear");
  console.log("After reactivate: back in active list");

  const deleted = await employeesRepo.softDeleteEmployee(created.id);
  assert(deleted?.deleted_at != null, "Soft delete should set deleted_at");
  afterCreate = await employeesRepo.listActiveEmployees();
  assert(!afterCreate.some((e) => e.id === created.id), "Deleted employee should not be in active list");
  console.log("After soft delete: removed from active list");

  const activeApiAfterDelete = await apiGet(token, "/employees/active");
  assert(
    !activeApiAfterDelete.data.items.some((e: { id: string }) => e.id === created.id),
    "Deleted employee should not appear in /employees/active"
  );
  console.log("API /employees/active after delete: OK");

  console.log("\nAll employee filter flow tests passed.");
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`FAIL: ${message}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
