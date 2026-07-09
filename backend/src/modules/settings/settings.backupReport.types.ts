export type ReadableReportFormat = "pdf" | "excel";

export type ReadableReportScope = "full" | "employees" | "attendance";

export interface ReportColumn {
  key: string;
  label: string;
  width: number;
}

export interface ReportSection {
  id: string;
  title: string;
  columns: ReportColumn[];
  rows: Record<string, string>[];
  recordCount: number;
}

export interface ReadableReportBundle {
  exportedAt: string;
  companyName: string;
  scope: ReadableReportScope;
  sections: ReportSection[];
  totals: Record<string, number>;
}

export const REPORT_SECTION_ORDER = [
  "employees",
  "attendance",
  "leave",
  "holidays",
  "settings",
  "audit",
] as const;

export type ReportSectionId = (typeof REPORT_SECTION_ORDER)[number];
