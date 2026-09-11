import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  hasDrawnSignature,
  todayInputDate,
  undoSignatureStroke,
  validateAttendancePdfSignature,
} from "./attendancePdfSignature";

describe("attendance PDF signature helpers", () => {
  it("undoes the last stroke and detects a drawn signature", () => {
    const strokes = [
      { points: [{ x: 1, y: 1 }, { x: 2, y: 2 }] },
      { points: [{ x: 3, y: 3 }] },
    ];
    assert.equal(hasDrawnSignature(strokes), true);
    const undone = undoSignatureStroke(strokes);
    assert.equal(undone.length, 1);
    assert.equal(hasDrawnSignature([{ points: [{ x: 1, y: 1 }] }]), false);
  });

  it("formats today's date as YYYY-MM-DD", () => {
    assert.equal(todayInputDate(new Date(2026, 7, 15)), "2026-08-15");
  });

  it("requires image, name, and date when the company setting is on", () => {
    assert.equal(
      validateAttendancePdfSignature({ requireSignature: true, hasImage: false, name: "A", date: "2026-08-01" }),
      "Add a signature before downloading the PDF."
    );
    assert.equal(
      validateAttendancePdfSignature({ requireSignature: true, hasImage: true, name: "", date: "2026-08-01" }),
      "Enter the signer name."
    );
    assert.equal(
      validateAttendancePdfSignature({ requireSignature: true, hasImage: true, name: "A", date: "" }),
      "Enter the signature date."
    );
    assert.equal(
      validateAttendancePdfSignature({ requireSignature: true, hasImage: true, name: "A", date: "2026-08-01" }),
      null
    );
  });

  it("allows PDF download without a signature when the setting is off", () => {
    assert.equal(
      validateAttendancePdfSignature({ requireSignature: false, hasImage: false, name: "", date: "" }),
      null
    );
  });
});
