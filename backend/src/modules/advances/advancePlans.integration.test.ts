import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { pool } from "../../config/db";
import * as repo from "./advancePlans.repository";

/**
 * Regression coverage for two bugs caught only by testing against a real database
 * with real numbers (not by reading the code):
 *  1. RETURNING clauses qualified with the "p." alias fail outside a FROM/JOIN
 *     context — createPlan/updatePlan/cancelPlan's INSERT/UPDATE statements.
 *  2. Deleting an unpaid plan (ON DELETE SET NULL on employee_advances.plan_id,
 *     by design, to protect real payment history in general) left its 'taken'
 *     ledger row behind as an invisible orphan that still counted toward Balance.
 */
describe(
  "advance plans integration",
  { skip: process.env.SKIP_DB_TESTS === "1" },
  () => {
    let employeeId: string;
    let createdBy: string;

    before(async () => {
      // Pick an employee with zero existing advance plans — not just "the first
      // employee" — so this suite's "same-day due date" assertion can never be
      // thrown off by real plans a developer created against local dev data in an
      // unrelated session (this bit us once: a manually-created plan with an
      // earlier due date silently won the MIN(due_date) this test asserts on).
      const emp = await pool.query<{ id: string }>(
        `SELECT e.id FROM employees e
          WHERE e.role = 'employee' AND e.deleted_at IS NULL
            AND NOT EXISTS (
              SELECT 1 FROM employee_advance_plans p WHERE p.employee_id = e.id
            )
          LIMIT 1`
      );
      const admin = await pool.query<{ id: string }>(
        `SELECT id FROM employees WHERE role = 'admin' LIMIT 1`
      );
      if (!emp.rows[0] || !admin.rows[0]) {
        throw new Error("Fixture data missing: need a plan-free employee and one admin");
      }
      employeeId = emp.rows[0].id;
      createdBy = admin.rows[0].id;
    });

    it("createPlan returns a fully-populated plan (RETURNING clause works)", async () => {
      const plan = await repo.createPlan({
        employeeId,
        principalAmount: 1200,
        startDate: "2030-01-01",
        planType: "equal_installments",
        installmentCount: 4,
        createdBy,
      });
      assert.equal(plan.principalAmount, 1200);
      assert.equal(plan.status, "active");
      assert.equal(plan.installments.length, 4);
      assert.deepEqual(
        plan.installments.map((i) => i.scheduledAmount),
        [300, 300, 300, 300]
      );
      await repo.deletePlanIfUnpaid(plan.id);
    });

    it("deleting an unpaid plan removes its ledger row too — no orphaned debt survives", async () => {
      const plan = await repo.createPlan({
        employeeId,
        principalAmount: 777,
        startDate: "2030-02-01",
        planType: "equal_installments",
        installmentCount: 1,
        createdBy,
      });

      const before = await pool.query(
        `SELECT COUNT(*)::int AS n FROM employee_advances WHERE plan_id = $1`,
        [plan.id]
      );
      assert.equal(before.rows[0].n, 1, "plan should own exactly one 'taken' ledger row");

      await repo.deletePlanIfUnpaid(plan.id);

      const afterByPlan = await pool.query(
        `SELECT COUNT(*)::int AS n FROM employee_advances WHERE plan_id = $1`,
        [plan.id]
      );
      assert.equal(afterByPlan.rows[0].n, 0, "no rows should remain linked to the deleted plan");

      // The real regression: without the fix, the row survives with plan_id set to
      // NULL (ON DELETE SET NULL) instead of being removed, becoming invisible in
      // the UI while still counting toward the employee's balance forever.
      const orphan = await pool.query(
        `SELECT COUNT(*)::int AS n FROM employee_advances
          WHERE employee_id = $1 AND plan_id IS NULL AND amount::numeric = 777`,
        [employeeId]
      );
      assert.equal(orphan.rows[0].n, 0, "deleting an unpaid plan must not leave an orphaned ledger row");
    });

    it("updatePlan preserves paid installments and rejects a principal below what's already paid", async () => {
      const plan = await repo.createPlan({
        employeeId,
        principalAmount: 1000,
        startDate: "2030-03-01",
        planType: "equal_installments",
        installmentCount: 2,
        createdBy,
      });

      await repo.recordRepayment({
        installmentId: plan.installments[0].id,
        amount: 500,
        entryDate: "2030-03-05",
        createdBy,
      });

      await assert.rejects(
        () => repo.updatePlan(plan.id, { principalAmount: 400, updatedBy: createdBy }),
        repo.PlanPrincipalTooLowError
      );

      const updated = await repo.updatePlan(plan.id, {
        principalAmount: 1500,
        planType: "equal_installments",
        installmentCount: 2,
        updatedBy: createdBy,
      });

      assert.equal(updated.principalAmount, 1500);
      assert.equal(updated.totalPaid, 500, "already-paid amount must be untouched");
      const kept = updated.installments.filter((i) => i.paidAmount > 0);
      assert.equal(kept.length, 1);
      assert.equal(kept[0].scheduledAmount, 500, "the paid installment's own schedule is not rewritten");

      const fresh = updated.installments.filter((i) => i.paidAmount === 0);
      const freshSum = Math.round(fresh.reduce((s, i) => s + i.scheduledAmount, 0) * 100) / 100;
      assert.equal(freshSum, 1000, "remaining balance (1500 - 500) is re-split across the new installments");

      const ledgerTaken = await pool.query<{ amount: string }>(
        `SELECT amount FROM employee_advances WHERE plan_id = $1 AND entry_type = 'taken'`,
        [plan.id]
      );
      assert.equal(Number(ledgerTaken.rows[0].amount), 1500, "the linked 'taken' row is updated to match");

      // Has a payment, so it can't be deletePlanIfUnpaid'd — cancel instead so this
      // fixture's still-unpaid installments don't leak into the next test's aggregation.
      await repo.cancelPlan(plan.id);
    });

    it("aggregates same-day installments across multiple plans instead of dropping one", async () => {
      // A far-future, dedicated date so no other test/fixture in this suite can collide.
      const startDate = "2031-11-01";
      const planA = await repo.createPlan({
        employeeId,
        principalAmount: 200,
        startDate,
        planType: "equal_installments",
        installmentCount: 1,
        createdBy,
      });
      const planB = await repo.createPlan({
        employeeId,
        principalAmount: 300,
        startDate,
        planType: "equal_installments",
        installmentCount: 1,
        createdBy,
      });

      try {
        const summaries = await repo.listEmployeeAdvanceSummaries();
        const mine = summaries.find((s) => s.employeeId === employeeId);
        assert.ok(mine);
        assert.equal(mine!.nextDueDate, startDate);
        assert.equal(mine!.nextDueAmount, 500, "both plans' installments due the same day must be summed");
      } finally {
        // Cleanup runs even on assertion failure, so a broken assertion doesn't leave
        // fixture data behind to pollute a re-run.
        await repo.deletePlanIfUnpaid(planA.id);
        await repo.deletePlanIfUnpaid(planB.id);
      }
    });
  }
);
