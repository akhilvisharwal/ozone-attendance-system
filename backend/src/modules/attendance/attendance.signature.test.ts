import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isAuthorizedSignatureRole,
  resolveAttendancePdfSignature,
  signatureFieldsValid,
} from "./attendance.signature";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

describe("attendance PDF signature policy", () => {
  it("limits saved official signatures to admin and junior admin roles", () => {
    assert.equal(isAuthorizedSignatureRole("admin"), true);
    assert.equal(isAuthorizedSignatureRole("junior_admin"), true);
    assert.equal(isAuthorizedSignatureRole("employee"), false);
    assert.equal(isAuthorizedSignatureRole(undefined), false);
  });

  it("requires an image, name, and date for a valid signature", () => {
    assert.match(signatureFieldsValid({ hasImage: false, name: "A", date: "2026-08-01" }) ?? "", /signature/);
    assert.match(signatureFieldsValid({ hasImage: true, name: "", date: "2026-08-01" }) ?? "", /name/);
    assert.match(signatureFieldsValid({ hasImage: true, name: "A", date: "" }) ?? "", /date/);
    assert.equal(signatureFieldsValid({ hasImage: true, name: "A", date: "2026-08-01" }), null);
  });

  it("blocks PDF export when the company setting requires a signature and none is provided", async () => {
    await assert.rejects(
      () =>
        resolveAttendancePdfSignature({
          format: "pdf",
          requireSignature: true,
          source: { name: "Admin", designation: "HR", date: "2026-08-01", useSaved: false },
        }),
      /Add a signature/
    );
  });

  it("allows Excel export without a signature even when the setting is on", async () => {
    const result = await resolveAttendancePdfSignature({
      format: "excel",
      requireSignature: true,
      source: { name: "", designation: "", date: "", useSaved: false },
    });
    assert.equal(result, undefined);
  });

  it("embeds a drawn/uploaded PNG with name, designation, and date", async () => {
    const result = await resolveAttendancePdfSignature({
      format: "pdf",
      requireSignature: false,
      source: {
        file: { buffer: PNG } as Express.Multer.File,
        name: "System Administrator",
        designation: "HR Manager",
        date: "11/09/2026",
      },
    });
    assert.ok(result);
    assert.equal(result!.name, "System Administrator");
    assert.equal(result!.designation, "HR Manager");
    assert.equal(result!.date, "11/09/2026");
    assert.ok(result!.image.length > 32);
  });

  it("reuses a saved signature buffer when requested", async () => {
    const result = await resolveAttendancePdfSignature({
      format: "pdf",
      requireSignature: true,
      source: {
        useSaved: true,
        savedBuffer: PNG,
        name: "Saved Admin",
        designation: "Director",
        date: "2026-08-15",
      },
    });
    assert.equal(result?.name, "Saved Admin");
    assert.ok(result?.image.length);
  });
});
