import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { addMonthsAsFirstOfMonth, splitEqualInstallments } from "./advancePlans.repository";

describe("splitEqualInstallments", () => {
  it("splits evenly when the principal divides cleanly", () => {
    assert.deepEqual(splitEqualInstallments(5000, 5), [1000, 1000, 1000, 1000, 1000]);
  });

  it("puts the rounding remainder on the last installment, never losing a cent", () => {
    const amounts = splitEqualInstallments(1000, 3);
    assert.deepEqual(amounts, [333.33, 333.33, 333.34]);
    const sum = Math.round(amounts.reduce((s, a) => s + a, 0) * 100) / 100;
    assert.equal(sum, 1000);
  });

  it("handles a single installment as the full principal", () => {
    assert.deepEqual(splitEqualInstallments(750.5, 1), [750.5]);
  });

  it("never loses a cent across a range of awkward splits", () => {
    for (const [principal, count] of [
      [300, 7],
      [999.99, 4],
      [10000, 12],
      [0.03, 3],
    ] as const) {
      const amounts = splitEqualInstallments(principal, count);
      assert.equal(amounts.length, count);
      const sum = Math.round(amounts.reduce((s, a) => s + a, 0) * 100) / 100;
      assert.equal(sum, principal, `principal=${principal} count=${count}`);
    }
  });
});

describe("addMonthsAsFirstOfMonth", () => {
  it("advances within the same year", () => {
    assert.equal(addMonthsAsFirstOfMonth("2026-07-10", 0), "2026-07-01");
    assert.equal(addMonthsAsFirstOfMonth("2026-07-10", 1), "2026-08-01");
    assert.equal(addMonthsAsFirstOfMonth("2026-07-10", 5), "2026-12-01");
  });

  it("rolls over into the next year", () => {
    assert.equal(addMonthsAsFirstOfMonth("2026-11-15", 2), "2027-01-01");
    assert.equal(addMonthsAsFirstOfMonth("2026-12-01", 1), "2027-01-01");
  });

  it("rolls over multiple years for a long schedule", () => {
    assert.equal(addMonthsAsFirstOfMonth("2026-01-01", 24), "2028-01-01");
  });

  it("always lands on the 1st regardless of the input day of month", () => {
    assert.equal(addMonthsAsFirstOfMonth("2026-01-31", 1), "2026-02-01");
  });
});
