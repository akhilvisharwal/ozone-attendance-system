import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "path";
import PDFDocument from "pdfkit";
import { buildMonthlyCalendarPdf } from "./attendance.monthlyPdf";
import { buildMonthlyCalendarPdfSimple } from "./attendance.monthlyPdfSimple";
import {
  attendancePdfFooterHeight,
  drawAttendancePdfSignature,
  type AttendancePdfSignature,
} from "./attendance.monthlyPdfSignature";
import type { MonthlyGrid } from "./attendance.monthly";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

function mockGrid(): MonthlyGrid {
  return {
    year: 2026,
    month: 8,
    label: "August 2026",
    daysInMonth: 31,
    defaultWeeklyOffDays: [0],
    holidays: [],
    employees: [
      {
        employeeId: "emp-1",
        employeeCode: "OZN001",
        name: "Test Employee",
        department: null,
        designation: "Technician",
        weeklyOffDays: [0],
        days: Array.from({ length: 31 }, (_, i) => ({
          day: i + 1,
          date: `2026-08-${String(i + 1).padStart(2, "0")}`,
          status: "present" as const,
          totalMinutes: 480,
          late: false,
          holidayName: null,
        })),
        summary: {
          present: 22,
          halfDay: 0,
          absent: 0,
          leave: 0,
          weeklyOff: 4,
          holidays: 0,
          holidayWorked: 0,
          weeklyOffWorked: 0,
          presentEquivalent: 22,
          totalMinutes: 10560,
          workingDays: 22,
          attendancePercentage: 100,
          lateCheckIns: 0,
        },
      },
    ],
  };
}

function decodePdfHexText(content: string): string {
  return [...content.matchAll(/<([0-9a-fA-F]+)>/g)]
    .map((match) => Buffer.from(match[1], "hex").toString("latin1"))
    .join("");
}

function inflatePdfContent(buffer: Buffer): string {
  const latin1 = buffer.toString("latin1");
  const parts: string[] = [];
  const re = /\/Length\s+(\d+)[\s\S]*?>>\s*stream\r?\n/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(latin1))) {
    const length = Number(match[1]);
    const start = Buffer.byteLength(latin1.slice(0, match.index + match[0].length), "latin1");
    const data = buffer.subarray(start, start + length);
    try {
      parts.push(inflateSync(data).toString("latin1"));
    } catch {
      parts.push(data.toString("latin1"));
    }
  }
  return parts.join("\n");
}

async function renderSignatureBlock(signature: AttendancePdfSignature): Promise<string> {
  const doc = new PDFDocument({ compress: false, size: "A4", layout: "landscape", margin: 20 });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));
  drawAttendancePdfSignature(doc, {
    pageW: doc.page.width,
    pageH: doc.page.height,
    margin: 20,
    signature,
  });
  doc.end();
  return (await done).toString("latin1");
}

describe("monthly attendance PDF signature output", () => {
  const signature: AttendancePdfSignature = {
    image: PNG,
    name: "Usman Khan",
    designation: "Supervisor",
    date: "2026-09-11",
  };

  it("reserves extra footer space so the signature does not overlap the grid", () => {
    assert.equal(attendancePdfFooterHeight(false), 22);
    assert.ok(attendancePdfFooterHeight(true) > 90);
  });

  it("draws Authorized Signature, name, designation, and date labels", async () => {
    const text = decodePdfHexText(await renderSignatureBlock(signature));
    assert.match(text, /Authorized Signature/);
    assert.match(text, /Name {2}Usman Khan/);
    assert.match(text, /Designation {2}Supervisor/);
    assert.match(text, /Date {2}11\/09\/2026/);
  });

  it("embeds a 1x1 signature image in both detailed and simple PDFs", async () => {
    const detailed = await buildMonthlyCalendarPdf(mockGrid(), {
      generatedBy: "Admin",
      generatedAt: new Date("2026-09-11T05:00:00Z"),
      signature,
    });
    const simple = await buildMonthlyCalendarPdfSimple(mockGrid(), {
      generatedBy: "Admin",
      generatedAt: new Date("2026-09-11T05:00:00Z"),
      signature,
    });
    for (const buffer of [detailed, simple]) {
      assert.match(buffer.toString("latin1"), /\/Subtype \/Image[\s\S]*?\/Width 1[\s\S]*?\/Height 1/);
      const text = decodePdfHexText(inflatePdfContent(buffer));
      assert.match(text, /Authorized Signature/);
      assert.match(text, /Usman Khan/);
      assert.match(text, /Supervisor/);
      assert.match(text, /11\/09\/2026/);
    }
  });

  it("omits the authorized-signature block when no signature is supplied", async () => {
    const buffer = await buildMonthlyCalendarPdf(mockGrid(), {
      generatedBy: "Admin",
      generatedAt: new Date("2026-09-11T05:00:00Z"),
    });
    assert.doesNotMatch(decodePdfHexText(inflatePdfContent(buffer)), /Authorized Signature/);
  });

  it("uses the shared signature footer in both PDF builders", () => {
    const detailed = readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), "attendance.monthlyPdf.ts"),
      "utf8"
    );
    const simple = readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), "attendance.monthlyPdfSimple.ts"),
      "utf8"
    );
    for (const source of [detailed, simple]) {
      assert.match(source, /attendancePdfFooterHeight\(Boolean\(meta\.signature\)\)/);
      assert.match(source, /drawAttendancePdfSignature\(doc,/);
    }
  });
});
