import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { pool } from "../../config/db";
import * as repo from "./advancePlans.repository";
import * as ledger from "./advances.repository";

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
    const stamp = Date.now();

    before(async () => {
      // A dedicated employee, not "an employee with zero existing advance
      // plans" picked from whoever happens to already exist — that query
      // previously fell back to "the first employee" and got fixed once to
      // require zero plans instead, but a zero-plans employee is itself an
      // exhaustible shared resource: enough manual/local testing across
      // sessions eventually leaves every real employee with at least one
      // plan, and this suite's before() then throws "Fixture data missing"
      // with no real bug behind it. Creating our own employee here removes
      // the dependency on local dev data state entirely, same fix already
      // applied to dailyAttendance.integration.test.ts's employee fixture.
      const admin = await pool.query<{ id: string }>(
        `SELECT id FROM employees WHERE role = 'admin' AND is_active = true AND deleted_at IS NULL LIMIT 1`
      );
      if (!admin.rows[0]) throw new Error("Need an active admin for advance plan tests");
      createdBy = admin.rows[0].id;

      const created = await pool.query<{ id: string }>(
        `INSERT INTO employees (
           employee_code, name, email, password_hash, role, is_active,
           must_change_password, first_login_completed
         ) VALUES ($1, $2, $3, $4, 'employee', true, false, true)
         RETURNING id`,
        [
          `AP${String(stamp).slice(-6)}`,
          `Advance Plans Test ${stamp}`,
          `advance-plans-${stamp}@example.com`,
          await bcrypt.hash("TempPass1!", 10),
        ]
      );
      employeeId = created.rows[0].id;
    });

    after(async () => {
      if (employeeId) {
        await pool.query(`DELETE FROM employee_advances WHERE employee_id = $1`, [employeeId]);
        await pool.query(`DELETE FROM employee_advance_plans WHERE employee_id = $1`, [employeeId]);
        await pool.query(`DELETE FROM employees WHERE id = $1`, [employeeId]);
      }
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

    it("records a partial salary deduction without deleting the original advance", async () => {
      const plan = await repo.createPlan({
        employeeId,
        principalAmount: 1000,
        startDate: "2032-01-01",
        planType: "equal_installments",
        installmentCount: 2,
        createdBy,
      });

      const { plan: after, recovered } = await repo.recordPlanRecovery({
        planId: plan.id,
        amount: 250,
        entryDate: "2032-01-10",
        kind: "salary_deduction",
        paymentMethod: "salary",
        note: "January salary",
        createdBy,
      });

      assert.equal(recovered, 250);
      assert.equal(after.totalPaid, 250);
      assert.equal(after.remainingBalance, 750);
      assert.equal(after.status, "active");
      assert.equal(after.installments[0].paidAmount, 250);

      const statement = await ledger.getEmployeeAdvanceStatement(employeeId);
      const planTx = statement.transactions.filter((row) => row.planId === plan.id);
      assert.equal(planTx.filter((row) => row.entryType === "taken").length, 1);
      assert.equal(planTx.find((row) => row.entryType === "taken")!.amount, 1000);
      const deduction = planTx.find((row) => row.recoveryKind === "salary_deduction");
      assert.ok(deduction);
      assert.equal(deduction!.amount, 250);
      assert.equal(deduction!.paymentMethod, "salary");
      assert.equal(deduction!.note, "January salary");
      await repo.cancelPlan(plan.id);
    });

    it("records multiple repayments and keeps every ledger row", async () => {
      const plan = await repo.createPlan({
        employeeId,
        principalAmount: 900,
        startDate: "2032-02-01",
        planType: "equal_installments",
        installmentCount: 3,
        createdBy,
      });

      await repo.recordPlanRecovery({
        planId: plan.id,
        amount: 200,
        entryDate: "2032-02-05",
        kind: "repayment",
        paymentMethod: "upi",
        createdBy,
      });
      const second = await repo.recordPlanRecovery({
        planId: plan.id,
        amount: 150,
        entryDate: "2032-02-20",
        kind: "repayment",
        paymentMethod: "cash",
        note: "Cash at office",
        createdBy,
      });

      assert.equal(second.plan.totalPaid, 350);
      assert.equal(second.plan.remainingBalance, 550);
      assert.equal(second.plan.status, "active");

      const statement = await ledger.getEmployeeAdvanceStatement(employeeId);
      const planTx = statement.transactions.filter((row) => row.planId === plan.id);
      assert.equal(planTx.filter((row) => row.recoveryKind === "repayment").length, 2);
      const cash = planTx.find((row) => row.note === "Cash at office");
      assert.ok(cash);
      assert.equal(cash!.paymentMethod, "cash");
      assert.equal(cash!.amount, 150);

      const returned = await pool.query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM employee_advances
          WHERE plan_id = $1 AND entry_type = 'returned'`,
        [plan.id]
      );
      const taken = await pool.query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM employee_advances
          WHERE plan_id = $1 AND entry_type = 'taken'`,
        [plan.id]
      );
      assert.equal(Number(returned.rows[0].n), 2);
      assert.equal(Number(taken.rows[0].n), 1);
      await repo.cancelPlan(plan.id);
    });

    it("settles the remaining balance in full and rejects an over-recovery", async () => {
      const plan = await repo.createPlan({
        employeeId,
        principalAmount: 400,
        startDate: "2032-03-01",
        planType: "equal_installments",
        installmentCount: 2,
        createdBy,
      });

      await assert.rejects(
        () =>
          repo.recordPlanRecovery({
            planId: plan.id,
            amount: 401,
            entryDate: "2032-03-02",
            kind: "adjustment",
            paymentMethod: "other",
            createdBy,
          }),
        repo.RecoveryExceedsBalanceError
      );

      const settled = await repo.recordPlanRecovery({
        planId: plan.id,
        amount: 400,
        entryDate: "2032-03-15",
        kind: "adjustment",
        paymentMethod: "bank_transfer",
        note: "Settled in full",
        createdBy,
      });
      assert.equal(settled.plan.remainingBalance, 0);
      assert.equal(settled.plan.totalPaid, 400);
      assert.equal(settled.plan.status, "completed");

      const statement = await ledger.getEmployeeAdvanceStatement(employeeId);
      const planTx = statement.transactions.filter((row) => row.planId === plan.id);
      assert.equal(planTx.filter((row) => row.entryType === "taken").length, 1);
      assert.equal(planTx.filter((row) => row.entryType === "returned").length, 1);
      assert.equal(planTx.find((row) => row.entryType === "returned")!.recoveryKind, "adjustment");
      assert.equal(planTx.find((row) => row.entryType === "returned")!.note, "Settled in full");

      const history = await pool.query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM employee_advances WHERE plan_id = $1`,
        [plan.id]
      );
      assert.equal(Number(history.rows[0].n), 2, "original taken row plus one recovery must both remain");
    });

    it("builds a statement when two recoveries share the same date", async () => {
      const plan = await repo.createPlan({
        employeeId,
        principalAmount: 100,
        startDate: "2033-01-01",
        planType: "equal_installments",
        installmentCount: 1,
        createdBy,
      });

      await repo.recordPlanRecovery({
        planId: plan.id,
        amount: 40,
        entryDate: "2033-01-01",
        kind: "repayment",
        paymentMethod: "upi",
        createdBy,
      });
      await repo.recordPlanRecovery({
        planId: plan.id,
        amount: 60,
        entryDate: "2033-01-01",
        kind: "salary_deduction",
        paymentMethod: "salary",
        createdBy,
      });

      const statement = await ledger.getEmployeeAdvanceStatement(employeeId);
      const planTx = statement.transactions.filter((row) => row.planId === plan.id);
      assert.equal(planTx.length, 3);
      assert.equal(planTx.filter((row) => row.entryType === "returned").length, 2);
    });
  }
);
