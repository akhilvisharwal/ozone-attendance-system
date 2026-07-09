import { formatDatabaseSize } from "../../utils/backupHelpers";
import { buildStorageCapacity } from "../../utils/storageCapacity";
import { resolveDatabaseCapacity } from "../../utils/providerCapacity";
import {
  buildApplicationModules,
  buildFileCategories,
  buildPostgresCategories,
  collectReferencedFilePaths,
  computeInternalDatabaseBytes,
  finalizeCategories,
  finalizeTables,
  measureUploadDirectoryBytes,
  queryAllTableStats,
  queryDatabaseSizeBytes,
} from "../../utils/storageAnalytics";

export type StorageKind = "postgresql" | "files";

export interface StorageCategory {
  id: string;
  label: string;
  recordCount: number;
  sizeBytes: number;
  sizeLabel: string;
  percentOfApplicationData: number;
  percentOfPlanCapacity: number | null;
  storageKind: StorageKind;
  description: string;
}

export interface StorageBreakdown {
  databaseSizeBytes: number;
  databaseSizeLabel: string;
  uploadedFilesBytes: number;
  uploadedFilesLabel: string;
  totalStorageUsedBytes: number;
  totalStorageUsedLabel: string;
  applicationDataBytes: number;
  applicationDataLabel: string;
  applicationPostgresBytes: number;
  applicationPostgresLabel: string;
  internalDatabaseBytes: number;
  internalDatabaseLabel: string;
  internalDatabasePercent: number;
  capacity: import("../../utils/storageCapacity").StorageCapacity;
  categories: StorageCategory[];
  tables: Array<{
    name: string;
    recordCount: number;
    sizeBytes: number;
    sizeLabel: string;
    percentOfApplicationData: number;
    percentOfPlanCapacity: number | null;
    storageKind: StorageKind;
    moduleId: string;
  }>;
}

export async function getStorageBreakdown(): Promise<StorageBreakdown> {
  const [databaseSizeBytes, tables, referenced] = await Promise.all([
    queryDatabaseSizeBytes(),
    queryAllTableStats(),
    collectReferencedFilePaths(),
  ]);

  const [postgresCategories, fileCategories, disk] = await Promise.all([
    Promise.resolve(buildPostgresCategories(tables)),
    buildFileCategories(referenced),
    measureUploadDirectoryBytes(referenced.allReferenced),
  ]);

  const modules = buildApplicationModules(postgresCategories, fileCategories);
  const applicationPostgresBytes = postgresCategories.reduce((sum, c) => sum + c.sizeBytes, 0);
  const applicationFilesBytes = fileCategories.reduce((sum, c) => sum + c.sizeBytes, 0);
  const applicationDataBytes = applicationPostgresBytes + applicationFilesBytes;
  const uploadedFilesBytes = disk.totalBytes;
  const totalStorageUsedBytes = databaseSizeBytes + uploadedFilesBytes;
  const internalDatabaseBytes = computeInternalDatabaseBytes(
    databaseSizeBytes,
    applicationPostgresBytes
  );

  const resolvedCapacity = await resolveDatabaseCapacity();
  const capacity = buildStorageCapacity({
    usedBytes: databaseSizeBytes,
    resolved: resolvedCapacity,
  });
  const planCapacityBytes = capacity.maxBytes;

  const categories = finalizeCategories(modules, applicationDataBytes, planCapacityBytes);
  const tableRows = finalizeTables(tables, applicationDataBytes, planCapacityBytes);

  return {
    databaseSizeBytes,
    databaseSizeLabel: formatDatabaseSize(databaseSizeBytes),
    uploadedFilesBytes,
    uploadedFilesLabel: formatDatabaseSize(uploadedFilesBytes),
    totalStorageUsedBytes,
    totalStorageUsedLabel: formatDatabaseSize(totalStorageUsedBytes),
    applicationDataBytes,
    applicationDataLabel: formatDatabaseSize(applicationDataBytes),
    applicationPostgresBytes,
    applicationPostgresLabel: formatDatabaseSize(applicationPostgresBytes),
    internalDatabaseBytes,
    internalDatabaseLabel: formatDatabaseSize(internalDatabaseBytes),
    internalDatabasePercent:
      databaseSizeBytes > 0
        ? Math.round((internalDatabaseBytes / databaseSizeBytes) * 1000) / 10
        : 0,
    capacity,
    categories,
    tables: tableRows,
  };
}
