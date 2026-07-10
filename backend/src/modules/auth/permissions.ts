/** Granular permissions for junior_admin accounts. Master admin (role=admin) always has all. */

export const ADMIN_PERMISSION_KEYS = [
  "viewDashboard",
  "viewAttendance",
  "editAttendance",
  "manualAttendance",
  "viewEmployees",
  "sendAttendanceReminders",
  "assignTasks",
  "editTasks",
  "deleteTasks",
  "viewReports",
  "manageExpenses",
] as const;

export type AdminPermission = (typeof ADMIN_PERMISSION_KEYS)[number];

export type AdminPermissions = Record<AdminPermission, boolean>;

export const ADMIN_PERMISSION_LABELS: Record<AdminPermission, { label: string; description: string }> = {
  viewDashboard: {
    label: "View Dashboard",
    description: "Access the admin dashboard and today's attendance overview.",
  },
  viewAttendance: {
    label: "View Attendance Records",
    description: "View daily and monthly attendance records, and download monthly Excel/PDF exports.",
  },
  editAttendance: {
    label: "Edit Attendance",
    description: "Edit monthly calendar cells and change day status (Present, Absent, Half Day, Leave, etc.).",
  },
  manualAttendance: {
    label: "Manual Attendance",
    description: "Create, update, and delete manual attendance entries from the calendar.",
  },
  viewEmployees: {
    label: "View Employees",
    description: "View the employee directory (read-only).",
  },
  sendAttendanceReminders: {
    label: "Send Attendance Reminders",
    description: "Remind employees who have not marked attendance today.",
  },
  assignTasks: {
    label: "Assign Tasks",
    description: "Create and assign tasks to employees.",
  },
  editTasks: {
    label: "Edit Tasks",
    description: "Update existing task assignments and details.",
  },
  deleteTasks: {
    label: "Delete Tasks",
    description: "Delete tasks and clear task groups.",
  },
  viewReports: {
    label: "View Reports",
    description: "View and export attendance reports.",
  },
  manageExpenses: {
    label: "Expense Tracker",
    description: "Record company expenses, submit reimbursement requests, and export expense reports.",
  },
};

export function emptyPermissions(): AdminPermissions {
  return {
    viewDashboard: false,
    viewAttendance: false,
    editAttendance: false,
    manualAttendance: false,
    viewEmployees: false,
    sendAttendanceReminders: false,
    assignTasks: false,
    editTasks: false,
    deleteTasks: false,
    viewReports: false,
    manageExpenses: false,
  };
}

export function defaultJuniorAdminPermissions(): AdminPermissions {
  return {
    viewDashboard: true,
    viewAttendance: true,
    editAttendance: true,
    manualAttendance: true,
    viewEmployees: true,
    sendAttendanceReminders: true,
    assignTasks: false,
    editTasks: false,
    deleteTasks: false,
    viewReports: false,
    manageExpenses: false,
  };
}

export function fullPermissions(): AdminPermissions {
  const all = emptyPermissions();
  for (const key of ADMIN_PERMISSION_KEYS) {
    all[key] = true;
  }
  return all;
}

export function normalizePermissions(raw: unknown): AdminPermissions {
  const base = emptyPermissions();
  if (!raw || typeof raw !== "object") return base;
  const source = raw as Record<string, unknown>;
  for (const key of ADMIN_PERMISSION_KEYS) {
    base[key] = Boolean(source[key]);
  }
  return base;
}

export function hasPermission(permissions: AdminPermissions | null | undefined, key: AdminPermission): boolean {
  return Boolean(permissions?.[key]);
}

export function hasAllPermissions(
  permissions: AdminPermissions | null | undefined,
  keys: AdminPermission[]
): boolean {
  return keys.every((key) => hasPermission(permissions, key));
}

export function hasAnyPermission(
  permissions: AdminPermissions | null | undefined,
  ...keys: AdminPermission[]
): boolean {
  return keys.some((key) => hasPermission(permissions, key));
}
