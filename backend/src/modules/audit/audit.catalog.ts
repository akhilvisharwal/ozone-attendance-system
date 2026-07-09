/** Canonical action → display metadata for audit logs. */

export type AuditModule =
  | "Auth"
  | "Employees"
  | "Attendance"
  | "Leave"
  | "Sites"
  | "Holidays"
  | "Settings"
  | "Database"
  | "Security"
  | "Tasks"
  | "Reports"
  | "Other";

export type AuditActionType =
  | "Create"
  | "Update"
  | "Delete"
  | "Login"
  | "Logout"
  | "Attendance"
  | "Leave Approval"
  | "Settings Change"
  | "Manual Attendance"
  | "Task Update"
  | "Export"
  | "Backup"
  | "Restore"
  | "Cleanup"
  | "Password Change"
  | "Other";

export interface AuditActionMeta {
  label: string;
  module: AuditModule;
  actionType: AuditActionType;
}

const CATALOG: Record<string, AuditActionMeta> = {
  "auth.login": { label: "Login", module: "Auth", actionType: "Login" },
  "auth.login_failed": { label: "Login failed", module: "Auth", actionType: "Login" },
  "auth.logout": { label: "Logout", module: "Auth", actionType: "Logout" },
  "auth.change_password": {
    label: "Password changed",
    module: "Security",
    actionType: "Password Change",
  },
  "auth.password_change": {
    label: "Admin password changed",
    module: "Security",
    actionType: "Password Change",
  },

  "employee.create": { label: "Employee created", module: "Employees", actionType: "Create" },
  "employee.update": { label: "Employee updated", module: "Employees", actionType: "Update" },
  "employee.delete": { label: "Employee deleted", module: "Employees", actionType: "Delete" },
  "employee.activate": { label: "Employee activated", module: "Employees", actionType: "Update" },
  "employee.deactivate": {
    label: "Employee deactivated",
    module: "Employees",
    actionType: "Update",
  },
  "employee.reset_password": {
    label: "Employee password reset",
    module: "Security",
    actionType: "Password Change",
  },
  "employee.update_photo": {
    label: "Employee photo updated",
    module: "Employees",
    actionType: "Update",
  },
  "employee.delete_photo": {
    label: "Employee photo deleted",
    module: "Employees",
    actionType: "Delete",
  },
  "employee.update_weekly_off": {
    label: "Employee weekly off updated",
    module: "Holidays",
    actionType: "Update",
  },
  "employee.designation_create": {
    label: "Employee role created",
    module: "Employees",
    actionType: "Create",
  },
  "employee.designation_update": {
    label: "Employee role updated",
    module: "Employees",
    actionType: "Update",
  },
  "employee.designation_delete": {
    label: "Employee role deleted",
    module: "Employees",
    actionType: "Delete",
  },

  "attendance.check_in": {
    label: "Check-in",
    module: "Attendance",
    actionType: "Attendance",
  },
  "attendance.check_out": {
    label: "Check-out",
    module: "Attendance",
    actionType: "Attendance",
  },
  "attendance.admin_mark_present": {
    label: "Marked present",
    module: "Attendance",
    actionType: "Manual Attendance",
  },
  "attendance.admin_mark_half_day": {
    label: "Marked half day",
    module: "Attendance",
    actionType: "Manual Attendance",
  },
  "attendance.admin_mark_absent": {
    label: "Marked absent",
    module: "Attendance",
    actionType: "Manual Attendance",
  },
  "attendance.manual_save": {
    label: "Manual attendance saved",
    module: "Attendance",
    actionType: "Manual Attendance",
  },
  "attendance.manual_delete": {
    label: "Manual attendance deleted",
    module: "Attendance",
    actionType: "Delete",
  },
  "attendance.override.create": {
    label: "Attendance override created",
    module: "Attendance",
    actionType: "Create",
  },
  "attendance.override.update": {
    label: "Attendance override updated",
    module: "Attendance",
    actionType: "Update",
  },
  "attendance.override.toggle": {
    label: "Attendance override toggled",
    module: "Attendance",
    actionType: "Update",
  },
  "attendance.override.delete": {
    label: "Attendance override deleted",
    module: "Attendance",
    actionType: "Delete",
  },

  "leave.submit": { label: "Leave requested", module: "Leave", actionType: "Create" },
  "leave.cancel": { label: "Leave cancelled", module: "Leave", actionType: "Update" },
  "leave.delete": { label: "Leave deleted", module: "Leave", actionType: "Delete" },
  "leave.approved": {
    label: "Leave approved",
    module: "Leave",
    actionType: "Leave Approval",
  },
  "leave.rejected": {
    label: "Leave rejected",
    module: "Leave",
    actionType: "Leave Approval",
  },
  "leave.pending": {
    label: "Leave set to pending",
    module: "Leave",
    actionType: "Leave Approval",
  },

  "site.create": { label: "Site created", module: "Sites", actionType: "Create" },
  "site.update": { label: "Site updated", module: "Sites", actionType: "Update" },
  "site.delete": { label: "Site deleted", module: "Sites", actionType: "Delete" },
  "site.update_image": { label: "Site image updated", module: "Sites", actionType: "Update" },
  "site.delete_image": { label: "Site image deleted", module: "Sites", actionType: "Delete" },

  "holiday.create": { label: "Holiday created", module: "Holidays", actionType: "Create" },
  "holiday.update": { label: "Holiday updated", module: "Holidays", actionType: "Update" },
  "holiday.delete": { label: "Holiday deleted", module: "Holidays", actionType: "Delete" },

  "settings.update": {
    label: "Settings changed",
    module: "Settings",
    actionType: "Settings Change",
  },
  "settings.logo_upload": {
    label: "Company logo uploaded",
    module: "Settings",
    actionType: "Update",
  },
  "settings.backup_create": {
    label: "Backup created",
    module: "Database",
    actionType: "Backup",
  },
  "settings.export_data": { label: "Data exported", module: "Database", actionType: "Export" },
  "settings.export_report": {
    label: "Readable report exported",
    module: "Reports",
    actionType: "Export",
  },
  "settings.restore_data": {
    label: "Backup restored",
    module: "Database",
    actionType: "Restore",
  },
  "settings.data_cleanup": {
    label: "Database cleanup",
    module: "Database",
    actionType: "Cleanup",
  },
  "settings.audit_clear": {
    label: "Audit logs cleared",
    module: "Database",
    actionType: "Cleanup",
  },
  "settings.audit_retention_update": {
    label: "Audit retention updated",
    module: "Settings",
    actionType: "Settings Change",
  },

  "task.assign": { label: "Task assigned", module: "Tasks", actionType: "Create" },
  "task.update": { label: "Task updated", module: "Tasks", actionType: "Task Update" },
  "task.delete": { label: "Task deleted", module: "Tasks", actionType: "Delete" },
  "task.clear_all": { label: "All tasks cleared", module: "Tasks", actionType: "Delete" },

  "report.export": { label: "Report exported", module: "Reports", actionType: "Export" },
};

const MODULE_BY_TARGET: Record<string, AuditModule> = {
  employee: "Employees",
  attendance: "Attendance",
  leave: "Leave",
  site: "Sites",
  holiday: "Holidays",
  settings: "Settings",
  task: "Tasks",
  report: "Reports",
  audit: "Database",
};

export const AUDIT_MODULES: AuditModule[] = [
  "Auth",
  "Employees",
  "Attendance",
  "Leave",
  "Sites",
  "Holidays",
  "Settings",
  "Database",
  "Security",
  "Tasks",
  "Reports",
  "Other",
];

export const AUDIT_ACTION_TYPES: AuditActionType[] = [
  "Create",
  "Update",
  "Delete",
  "Login",
  "Logout",
  "Attendance",
  "Leave Approval",
  "Settings Change",
  "Manual Attendance",
  "Task Update",
  "Export",
  "Backup",
  "Restore",
  "Cleanup",
  "Password Change",
  "Other",
];

export const AUDIT_RETENTION_DAYS = [30, 60, 90, 365] as const;
export type AuditRetentionDays = (typeof AUDIT_RETENTION_DAYS)[number];

export function resolveAuditMeta(
  action: string,
  targetType?: string | null
): AuditActionMeta {
  const known = CATALOG[action];
  if (known) return known;

  const prefix = action.split(".")[0] ?? "";
  const verb = action.split(".")[1] ?? "";
  let actionType: AuditActionType = "Other";
  if (verb.includes("create") || verb === "assign" || verb === "submit") actionType = "Create";
  else if (verb.includes("delete") || verb.includes("clear")) actionType = "Delete";
  else if (verb.includes("update") || verb.includes("toggle")) actionType = "Update";
  else if (verb.includes("export")) actionType = "Export";
  else if (verb.includes("login")) actionType = "Login";
  else if (verb.includes("logout")) actionType = "Logout";

  const module =
    MODULE_BY_TARGET[targetType ?? ""] ??
    (prefix === "auth"
      ? "Auth"
      : prefix === "settings"
        ? "Settings"
        : prefix === "employee"
          ? "Employees"
          : prefix === "attendance"
            ? "Attendance"
            : prefix === "leave"
              ? "Leave"
              : prefix === "site"
                ? "Sites"
                : prefix === "holiday"
                  ? "Holidays"
                  : prefix === "task"
                    ? "Tasks"
                    : prefix === "report"
                      ? "Reports"
                      : "Other");

  return {
    label: action
      .replace(/\./g, " ")
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase()),
    module,
    actionType,
  };
}

export function buildAuditDescription(
  action: string,
  metadata: Record<string, unknown> | null | undefined,
  targetType?: string | null
): string {
  const meta = resolveAuditMeta(action, targetType);
  const parts: string[] = [meta.label];

  if (metadata && typeof metadata === "object") {
    const category = metadata.category;
    if (typeof category === "string" && category) {
      parts.push(`(${category})`);
    }
    const reason = metadata.reason;
    if (typeof reason === "string" && reason.trim()) {
      parts.push(`— ${reason.trim()}`);
    }
    const message = metadata.message;
    if (typeof message === "string" && message.trim()) {
      parts.push(`— ${message.trim()}`);
    }
    const employeeName = metadata.employeeName ?? metadata.employee_name;
    const employeeCode = metadata.employeeCode ?? metadata.employee_code;
    if (typeof employeeName === "string" && employeeName) {
      parts.push(`for ${employeeName}${typeof employeeCode === "string" && employeeCode ? ` (${employeeCode})` : ""}`);
    } else if (typeof employeeCode === "string" && employeeCode) {
      parts.push(`for ${employeeCode}`);
    }
    const adminName = metadata.adminName ?? metadata.admin_name;
    if (typeof adminName === "string" && adminName) {
      parts.push(`by ${adminName}`);
    }
  }

  return parts.join(" ");
}

/** SQL fragment helpers: map filter module/actionType to action prefixes / exact actions. */
export function actionsForModule(module: AuditModule): string[] {
  return Object.entries(CATALOG)
    .filter(([, m]) => m.module === module)
    .map(([action]) => action);
}

export function actionsForActionType(actionType: AuditActionType): string[] {
  return Object.entries(CATALOG)
    .filter(([, m]) => m.actionType === actionType)
    .map(([action]) => action);
}
