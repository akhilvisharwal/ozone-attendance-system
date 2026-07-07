import { pool } from "../src/config/db";
import { listAllAttendance } from "../src/modules/attendance/attendance.repository";

type StatusFilter =
  | "present"
  | "half_day"
  | "absent"
  | "pending"
  | "checked_in"
  | "checked_out";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`FAIL: ${message}`);
}

function dateOnly(value: unknown): string {
  return String(value).slice(0, 10);
}

async function verifyRowsMatchFilters(
  filters: Parameters<typeof listAllAttendance>[0],
  rows: Awaited<ReturnType<typeof listAllAttendance>>["items"]
): Promise<void> {
  for (const row of rows) {
    if (filters.employeeId) {
      assert(row.employee_id === filters.employeeId, `employeeId mismatch for ${row.id}`);
    }
    if (filters.from) {
      assert(dateOnly(row.attendance_date) >= filters.from, `from date mismatch for ${row.id}`);
    }
    if (filters.to) {
      assert(dateOnly(row.attendance_date) <= filters.to, `to date mismatch for ${row.id}`);
    }
    if (filters.status) {
      switch (filters.status) {
        case "present":
          assert(row.day_status === "present", `present status mismatch for ${row.id}`);
          break;
        case "half_day":
          assert(row.day_status === "half_day", `half_day status mismatch for ${row.id}`);
          break;
        case "absent":
          assert(row.status === "absent" || row.day_status === "absent", `absent status mismatch for ${row.id}`);
          break;
        case "pending":
          assert(row.status === "checked_in" && row.day_status == null, `pending status mismatch for ${row.id}`);
          break;
        case "checked_in":
          assert(row.status === "checked_in", `checked_in status mismatch for ${row.id}`);
          break;
        case "checked_out":
          assert(row.status === "checked_out", `checked_out status mismatch for ${row.id}`);
          break;
      }
    }
  }
}

async function countDirect(filters: Parameters<typeof listAllAttendance>[0]): Promise<number> {
  const res = await listAllAttendance({ ...filters, page: 1, limit: 200 });
  return res.total;
}

async function main() {
  const all = await listAllAttendance({ page: 1, limit: 200 });
  console.log(`All records: ${all.total}`);

  if (all.total === 0) {
    console.log("No attendance rows to validate filters against.");
    return;
  }

  const sample = all.items[0];
  const empId = sample.employee_id;
  const date = dateOnly(sample.attendance_date);

  // Employee filter
  const byEmp = await listAllAttendance({ employeeId: empId, page: 1, limit: 200 });
  await verifyRowsMatchFilters({ employeeId: empId, page: 1, limit: 200 }, byEmp.items);
  console.log(`Employee filter: OK (${byEmp.total})`);

  // Date range (single day)
  const byDate = await listAllAttendance({ from: date, to: date, page: 1, limit: 200 });
  await verifyRowsMatchFilters({ from: date, to: date, page: 1, limit: 200 }, byDate.items);
  console.log(`Date filter: OK (${byDate.total} on ${date})`);

  // Each status filter
  for (const st of [
    "present",
    "half_day",
    "absent",
    "pending",
    "checked_in",
    "checked_out",
  ] as StatusFilter[]) {
    const res = await listAllAttendance({ status: st, page: 1, limit: 200 });
    await verifyRowsMatchFilters({ status: st, page: 1, limit: 200 }, res.items);
    console.log(`Status ${st}: OK (${res.total})`);
  }

  // Combo: employee + date
  const combo1 = await listAllAttendance({ employeeId: empId, from: date, to: date, page: 1, limit: 200 });
  await verifyRowsMatchFilters({ employeeId: empId, from: date, to: date, page: 1, limit: 200 }, combo1.items);
  console.log(`Combo employee+date: OK (${combo1.total})`);

  // Combo: employee + date + status (use sample's effective status)
  let sampleStatus: StatusFilter = "checked_out";
  if (sample.status === "absent" || sample.day_status === "absent") sampleStatus = "absent";
  else if (sample.day_status === "present") sampleStatus = "present";
  else if (sample.day_status === "half_day") sampleStatus = "half_day";
  else if (sample.status === "checked_in" && sample.day_status == null) sampleStatus = "pending";
  else if (sample.status === "checked_in") sampleStatus = "checked_in";

  const combo2 = await listAllAttendance({
    employeeId: empId,
    from: date,
    to: date,
    status: sampleStatus,
    page: 1,
    limit: 200,
  });
  await verifyRowsMatchFilters(
    { employeeId: empId, from: date, to: date, status: sampleStatus, page: 1, limit: 200 },
    combo2.items
  );
  console.log(`Combo employee+date+status(${sampleStatus}): OK (${combo2.total})`);

  // Pagination: total should be stable
  const page1 = await listAllAttendance({ page: 1, limit: 2 });
  const page2 = await listAllAttendance({ page: 2, limit: 2 });
  assert(page1.total === page2.total, "pagination total mismatch");
  assert(page1.items.length <= 2, "page1 limit exceeded");
  console.log(`Pagination: OK (total=${page1.total})`);

  // Impossible filter should return 0
  const none = await listAllAttendance({
    from: "2099-01-01",
    to: "2099-01-31",
    page: 1,
    limit: 200,
  });
  assert(none.total === 0 && none.items.length === 0, "future date filter should be empty");
  console.log("Empty result filter: OK (0)");

  // Cross-check count consistency
  const directTotal = await countDirect({});
  assert(directTotal === all.total, "count drift on unfiltered list");
  console.log("Count consistency: OK");

  console.log("\nAll filter tests passed.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
