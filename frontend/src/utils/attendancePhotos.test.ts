import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isSelfiePath, splitAttendancePhotos } from "./attendancePhotos";

describe("attendancePhotos", () => {
  it("detects selfie storage paths", () => {
    assert.equal(isSelfiePath("selfies/OZN001/abc.jpg"), true);
    assert.equal(isSelfiePath("site-photos/OZN001/abc.jpg"), false);
  });

  it("splits checkout selfie from site photos", () => {
    const result = splitAttendancePhotos({
      check_in_selfie_path: "selfies/OZN001/checkin.jpg",
      site_photo_paths: ["selfies/OZN001/checkout.jpg", "site-photos/OZN001/site1.jpg"],
    });
    assert.equal(result.checkInPhoto, "selfies/OZN001/checkin.jpg");
    assert.equal(result.checkOutPhoto, "selfies/OZN001/checkout.jpg");
    assert.deepEqual(result.sitePhotos, ["site-photos/OZN001/site1.jpg"]);
  });

  it("keeps all site paths when no checkout selfie is present", () => {
    const result = splitAttendancePhotos({
      check_in_selfie_path: null,
      site_photo_paths: ["site-photos/OZN001/site1.jpg"],
    });
    assert.equal(result.checkOutPhoto, null);
    assert.deepEqual(result.sitePhotos, ["site-photos/OZN001/site1.jpg"]);
  });
});
