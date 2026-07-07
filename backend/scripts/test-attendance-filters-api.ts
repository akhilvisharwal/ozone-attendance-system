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

async function getAttendance(token: string, params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${BASE}/attendance?${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  return { status: res.status, data };
}

async function main() {
  const token = await login();
  console.log("Login: OK");

  const all = await getAttendance(token, { page: "1", limit: "200" });
  console.log(`GET /attendance (all): ${all.status}, total=${all.data.total}`);

  if (all.data.items?.length) {
    const row = all.data.items[0];
    const byEmp = await getAttendance(token, {
      employeeId: row.employee_id,
      page: "1",
      limit: "200",
    });
    const okEmp = byEmp.data.items.every((r: { employee_id: string }) => r.employee_id === row.employee_id);
    console.log(`Employee filter via API: ${okEmp ? "OK" : "FAIL"} (${byEmp.data.total})`);

    const date = String(row.attendance_date).slice(0, 10);
    const byDate = await getAttendance(token, { from: date, to: date, page: "1", limit: "200" });
    const okDate = byDate.data.items.every((r: { attendance_date: string }) =>
      String(r.attendance_date).startsWith(date)
    );
    console.log(`Date filter via API: ${okDate ? "OK" : "FAIL"} (${byDate.data.total})`);

    for (const st of ["present", "half_day", "absent", "pending", "checked_in", "checked_out"]) {
      const res = await getAttendance(token, { status: st, page: "1", limit: "200" });
      console.log(`Status ${st} via API: ${res.status}, total=${res.data.total}`);
    }
  }

  const invalid = await getAttendance(token, { from: "2026-07-10", to: "2026-07-01", page: "1", limit: "20" });
  console.log(
    `Invalid date range: ${invalid.status === 400 ? "OK (400)" : "FAIL"}`,
    invalid.data.error?.message ?? invalid.data
  );

  const empty = await getAttendance(token, { from: "2099-01-01", to: "2099-01-31", page: "1", limit: "20" });
  console.log(
    `Empty filter result: ${empty.data.total === 0 && empty.data.items.length === 0 ? "OK" : "FAIL"}`,
    `total=${empty.data.total}`
  );

  const page1 = await getAttendance(token, { page: "1", limit: "2" });
  const page2 = await getAttendance(token, { page: "2", limit: "2" });
  console.log(
    `Pagination totals match: ${page1.data.total === page2.data.total ? "OK" : "FAIL"}`,
    `total=${page1.data.total}`
  );

  console.log("\nAPI filter tests completed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
