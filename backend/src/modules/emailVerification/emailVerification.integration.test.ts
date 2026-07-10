import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { pool } from "../../config/db";
import {
  consumeOtpChallenge,
  createOtpChallenge,
  findOtpChallengeById,
  generateOtpCode,
  hashSecret,
  incrementOtpAttempts,
} from "./emailVerification.repository";
import { verifyOtpChallenge } from "./emailVerification.service";
import type { Request } from "express";

describe("email OTP challenge lifecycle", { skip: process.env.SKIP_DB_TESTS === "1" }, () => {
  let actorId: string;
  const createdIds: string[] = [];

  before(async () => {
    const admin = await pool.query<{ id: string }>(
      `SELECT id FROM employees WHERE role = 'admin' AND deleted_at IS NULL ORDER BY created_at ASC LIMIT 1`
    );
    if (!admin.rows[0]) throw new Error("Need an admin employee for OTP tests");
    actorId = admin.rows[0].id;
  });

  after(async () => {
    if (createdIds.length > 0) {
      await pool.query(`DELETE FROM email_otp_challenges WHERE id = ANY($1::uuid[])`, [createdIds]);
    }
  });

  function fakeReq(): Request {
    return {
      user: { id: actorId, employeeCode: "OZNADMIN", role: "admin" },
      headers: { "user-agent": "otp-integration-test" },
      ip: "127.0.0.1",
      socket: { remoteAddress: "127.0.0.1" },
    } as unknown as Request;
  }

  it("accepts a valid unused OTP and rejects replay", async () => {
    const code = generateOtpCode();
    const challenge = await createOtpChallenge({
      purpose: "admin_password_change",
      code,
      recipientEmail: "info@ozoneairconhvac.com",
      actorId,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    });
    createdIds.push(challenge.id);

    await verifyOtpChallenge({
      req: fakeReq(),
      challengeId: challenge.id,
      code,
      purpose: "admin_password_change",
      actorId,
    });

    const consumed = await findOtpChallengeById(challenge.id);
    assert.ok(consumed?.consumed_at);

    await assert.rejects(
      () =>
        verifyOtpChallenge({
          req: fakeReq(),
          challengeId: challenge.id,
          code,
          purpose: "admin_password_change",
          actorId,
        }),
      /already been used/i
    );
  });

  it("rejects expired and incorrect codes", async () => {
    const code = generateOtpCode();
    const expired = await createOtpChallenge({
      purpose: "database_cleanup",
      code,
      recipientEmail: "info@ozoneairconhvac.com",
      actorId,
      expiresAt: new Date(Date.now() - 1000),
    });
    createdIds.push(expired.id);

    await assert.rejects(
      () =>
        verifyOtpChallenge({
          req: fakeReq(),
          challengeId: expired.id,
          code,
          purpose: "database_cleanup",
          actorId,
        }),
      /expired/i
    );

    const liveCode = generateOtpCode();
    const live = await createOtpChallenge({
      purpose: "company_email_change",
      code: liveCode,
      recipientEmail: "info@ozoneairconhvac.com",
      actorId,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    });
    createdIds.push(live.id);

    await assert.rejects(
      () =>
        verifyOtpChallenge({
          req: fakeReq(),
          challengeId: live.id,
          code: liveCode === "000000" ? "111111" : "000000",
          purpose: "company_email_change",
          actorId,
        }),
      /Incorrect verification code/i
    );

    const afterFail = await findOtpChallengeById(live.id);
    assert.equal(afterFail?.attempts, 1);
    assert.equal(afterFail?.code_hash, hashSecret(liveCode));
  });

  it("marks challenges consumed only once", async () => {
    const code = generateOtpCode();
    const challenge = await createOtpChallenge({
      purpose: "company_phone_change",
      code,
      recipientEmail: "info@ozoneairconhvac.com",
      actorId,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    });
    createdIds.push(challenge.id);
    await incrementOtpAttempts(challenge.id);
    await consumeOtpChallenge(challenge.id);
    await consumeOtpChallenge(challenge.id);
    const row = await findOtpChallengeById(challenge.id);
    assert.ok(row?.consumed_at);
    assert.equal(row?.attempts, 1);
  });
});
