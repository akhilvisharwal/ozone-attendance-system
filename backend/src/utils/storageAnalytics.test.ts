import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildPostgresCategories,
  finalizeCategories,
  percentOf,
} from "./storageAnalytics";

describe("storage analytics helpers", () => {
  it("calculates percentages against total storage used", () => {
    assert.equal(percentOf(250, 1000), 25);
    assert.equal(percentOf(0, 1000), 0);
    assert.equal(percentOf(100, 0), 0);
  });

  it("groups PostgreSQL tables into categories and accounts for overhead", () => {
    const tables = [
      { name: "attendance", recordCount: 6, sizeBytes: 200_000 },
      { name: "employees", recordCount: 4, sizeBytes: 96_000 },
      { name: "refresh_tokens", recordCount: 2, sizeBytes: 32_000 },
    ];
    const categories = buildPostgresCategories(tables, 400_000);
    const attendance = categories.find((c) => c.id === "attendance");
    const other = categories.find((c) => c.id === "other_db");
    assert.equal(attendance?.sizeBytes, 200_000);
    assert.equal(other?.sizeBytes, 104_000);
    assert.equal(
      categories.reduce((sum, c) => sum + c.sizeBytes, 0),
      400_000
    );
  });

  it("finalizes category percentages that sum to approximately 100%", () => {
    const categories = finalizeCategories(
      [
        {
          id: "attendance",
          label: "Attendance",
          recordCount: 1,
          sizeBytes: 700,
          storageKind: "postgresql",
          description: "db",
        },
        {
          id: "selfies",
          label: "Selfies",
          recordCount: 2,
          sizeBytes: 300,
          storageKind: "files",
          description: "files",
        },
      ],
      1000
    );
    const percentSum = categories.reduce((sum, c) => sum + c.percentOfTotal, 0);
    assert.equal(categories[0]?.percentOfTotal, 70);
    assert.equal(categories[1]?.percentOfTotal, 30);
    assert.equal(percentSum, 100);
  });
});
