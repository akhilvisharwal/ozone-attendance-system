/**
 * Smoke-test monthly PDF layout for months with 28–31 days and varying employee counts.
 * Run: npx tsx src/scripts/test-monthly-pdf.ts
 */
import fs from "fs";
import path from "path";
import { buildMonthlyCalendarPdf } from "../modules/attendance/attendance.monthlyPdf";
import type { MonthlyGrid, MonthlyCellStatus } from "../modules/attendance/attendance.monthly";

function makeDayStatus(d: number): MonthlyCellStatus {
  const statuses: MonthlyCellStatus[] = ["present", "absent", "leave", "weekly_off", "holiday", "half_day"];
  return statuses[d % statuses.length];
}

function buildMockGrid(year: number, month: number, employeeCount: number): MonthlyGrid {
  const daysInMonth = new Date(year, month, 0).getDate();
  const label = new Date(year, month - 1, 1).toLocaleString("en-IN", { month: "long", year: "numeric" });

  const employees = Array.from({ length: employeeCount }, (_, i) => ({
    employeeId: `id-${i}`,
    employeeCode: `OZN${String(i + 1).padStart(3, "0")}`,
    name: `Employee ${i + 1}`,
    department: i % 2 === 0 ? "Operations" : "Projects",
    weeklyOffDays: [0],
    days: Array.from({ length: daysInMonth }, (_, d) => ({
      date: `${year}-${String(month).padStart(2, "0")}-${String(d + 1).padStart(2, "0")}`,
      status: makeDayStatus(d + i),
      holidayName: null as string | null,
    })),
    summary: {
      present: 20,
      halfDay: 1,
      absent: 2,
      leave: 1,
      weeklyOff: 4,
      holidays: 1,
      holidayWorked: 0,
      weeklyOffWorked: 0,
      workingDays: 22,
      totalMinutes: 9600,
      attendancePercentage: 91,
    },
  }));

  return {
    year,
    month,
    label,
    daysInMonth,
    defaultWeeklyOffDays: [0],
    holidays: [{ date: `${year}-${String(month).padStart(2, "0")}-15`, name: "Test Holiday", description: null }],
    employees,
  };
}

async function main() {
  const outDir = path.join(process.cwd(), "test-output");
  fs.mkdirSync(outDir, { recursive: true });

  const cases = [
    { year: 2026, month: 2, employees: 5, note: "28-day Feb" },
    { year: 2024, month: 2, employees: 5, note: "29-day leap Feb" },
    { year: 2026, month: 4, employees: 15, note: "30-day April" },
    { year: 2026, month: 7, employees: 40, note: "31-day July many employees" },
  ];

  for (const c of cases) {
    const grid = buildMockGrid(c.year, c.month, c.employees);
    const pdf = await buildMonthlyCalendarPdf(grid, { generatedBy: "Test Admin" });
    const file = path.join(outDir, `monthly-${c.year}-${String(c.month).padStart(2, "0")}-${c.employees}emp.pdf`);
    fs.writeFileSync(file, pdf);
    console.log(`OK ${c.note}: ${file} (${pdf.length} bytes, ${grid.daysInMonth} days, ${c.employees} employees)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
