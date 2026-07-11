import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const pdfSourcePath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "attendance.monthlyPdf.ts"
);

describe("monthly attendance PDF print colors", () => {
  const source = readFileSync(pdfSourcePath, "utf8");

  it("uses white present cells and pastel status backgrounds with black text", () => {
    assert.match(source, /present:\s*\{\s*code:\s*"P",\s*bg:\s*"#ffffff",\s*fg:\s*"#000000"/);
    assert.match(source, /absent:\s*\{\s*code:\s*"A",\s*bg:\s*"#fecaca",\s*fg:\s*"#000000"/);
    assert.match(source, /half_day:\s*\{\s*code:\s*"H",\s*bg:\s*"#fef9c3",\s*fg:\s*"#000000"/);
    assert.match(source, /leave:\s*\{\s*code:\s*"L",\s*bg:\s*"#dbeafe",\s*fg:\s*"#000000"/);
    assert.match(source, /weekly_off:\s*\{\s*code:\s*"WO",\s*bg:\s*"#e5e7eb",\s*fg:\s*"#000000"/);
    assert.match(source, /holiday:\s*\{\s*code:\s*"HO",\s*bg:\s*"#ede9fe",\s*fg:\s*"#000000"/);
    assert.match(source, /holiday_worked:\s*\{\s*code:\s*"HW",\s*bg:\s*"#ccfbf1",\s*fg:\s*"#000000"/);
    assert.match(source, /weekly_off_worked:\s*\{\s*code:\s*"WW",\s*bg:\s*"#e0e7ff",\s*fg:\s*"#000000"/);
    assert.match(source, /not_applicable:\s*\{\s*code:\s*"",\s*bg:\s*"#f3f4f6",\s*fg:\s*"#000000"/);
  });

  it("uses light orange for late check-in cells and includes it in the legend", () => {
    assert.match(source, /LATE_STYLE:\s*StatusStyle\s*=\s*\{\s*code:\s*"",\s*bg:\s*"#ffedd5",\s*fg:\s*"#000000"/);
    assert.match(source, /label:\s*"Late Check-in",\s*bg:\s*"#ffedd5",\s*fg:\s*"#000000"/);
    assert.match(source, /day\.late\s*\?\s*LATE_STYLE\.bg/);
  });

  it("does not keep the old saturated status fills", () => {
    assert.doesNotMatch(source, /bg:\s*"#10b981"/);
    assert.doesNotMatch(source, /bg:\s*"#ef4444"/);
    assert.doesNotMatch(source, /bg:\s*"#0ea5e9"/);
    assert.doesNotMatch(source, /bg:\s*"#a855f7"/);
    assert.doesNotMatch(source, /bg:\s*"#0d9488"/);
    assert.doesNotMatch(source, /bg:\s*"#4f46e5"/);
  });
});
