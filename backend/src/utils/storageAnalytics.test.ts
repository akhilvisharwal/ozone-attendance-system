import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildApplicationModules,
  buildPostgresCategories,
  computeInternalDatabaseBytes,
  finalizeCategories,
  percentOf,
} from "./storageAnalytics";

describe("storage analytics helpers", () => {
  it("calculates percentages against application data and plan capacity", () => {
    assert.equal(percentOf(250, 1000), 25);
    assert.equal(percentOf(0, 1000), 0);
    assert.equal(percentOf(100, 0), 0);
  });

  it("groups only application PostgreSQL tables and excludes internal overhead", () => {
    const tables = [
      { name: "attendance", recordCount: 6, sizeBytes: 200_000 },
      { name: "employees", recordCount: 4, sizeBytes: 96_000 },
      { name: "refresh_tokens", recordCount: 2, sizeBytes: 32_000 },
    ];
    const categories = buildPostgresCategories(tables);
    assert.equal(categories.some((c) => c.id === "other_db"), false);
    assert.equal(categories.find((c) => c.id === "attendance")?.sizeBytes, 200_000);
    assert.equal(categories.find((c) => c.id === "employees")?.sizeBytes, 96_000);
    assert.equal(
      computeInternalDatabaseBytes(400_000, 296_000),
      104_000
    );
  });

  it("rolls raw categories into user-facing application modules", () => {
    const modules = buildApplicationModules(
      [
        {
          id: "employees",
          label: "Employees",
          recordCount: 4,
          sizeBytes: 96_000,
          postgresBytes: 96_000,
          fileBytes: 0,
          storageKind: "postgresql",
          description: "db",
        },
        {
          id: "selfies",
          label: "Selfies",
          recordCount: 2,
          sizeBytes: 300,
          postgresBytes: 0,
          fileBytes: 300,
          storageKind: "files",
          description: "files",
        },
      ],
      [
        {
          id: "selfies",
          label: "Selfies",
          recordCount: 2,
          sizeBytes: 300,
          postgresBytes: 0,
          fileBytes: 300,
          storageKind: "files",
          description: "files",
        },
      ]
    );
    assert.equal(modules.find((m) => m.id === "employees")?.sizeBytes, 96_000);
    assert.equal(modules.find((m) => m.id === "selfies")?.sizeBytes, 300);
  });

  it("finalizes category percentages against total database capacity", () => {
    const categories = finalizeCategories(
      [
        {
          id: "attendance",
          label: "Attendance",
          recordCount: 1,
          sizeBytes: 700,
          postgresBytes: 700,
          fileBytes: 0,
          storageKind: "postgresql",
          description: "db",
        },
        {
          id: "selfies",
          label: "Selfies",
          recordCount: 2,
          sizeBytes: 300,
          postgresBytes: 0,
          fileBytes: 300,
          storageKind: "files",
          description: "files",
        },
      ],
      5000
    );
    assert.equal(categories[0]?.percentOfTotalCapacity, 14);
    assert.equal(categories[1]?.percentOfTotalCapacity, 6);
  });
});
