import { Navigate, Route, Routes } from "react-router-dom";
import { MotionConfig } from "motion/react";
import {
  LayoutDashboard,
  Users,
  ClipboardList,
  Building2,
  FileBarChart,
  Clock,
  FileText,
  CheckSquare,
  Trophy,
  CalendarDays,
  CalendarCheck,
  CalendarRange,
  CalendarHeart,
  Wallet,
  UserCircle,
} from "lucide-react";
import { AuthProvider } from "@/auth/AuthContext";
import { SessionManager } from "@/auth/SessionManager";
import { ProtectedRoute } from "@/auth/ProtectedRoute";
import { MasterAdminRoute, PermissionRoute } from "@/auth/PermissionRoute";
import { useAuth } from "@/auth/AuthContext";
import { usePermissions } from "@/auth/usePermissions";
import { SettingsProvider } from "@/contexts/SettingsContext";
import { ToastProvider } from "@/components/ui/Toast";
import { AppLayout, type NavItem } from "@/components/layout/AppLayout";
import { LoadingScreen } from "@/components/LoadingScreen";
import { OfflineScreen } from "@/components/OfflineScreen";
import { LoginPage } from "@/pages/LoginPage";
import { ForgotPasswordPage } from "@/pages/ForgotPasswordPage";
import { ResetPasswordPage } from "@/pages/ResetPasswordPage";

import { EmployeeHomePage } from "@/pages/employee/EmployeeHomePage";
import { AttendanceHistoryPage } from "@/pages/employee/AttendanceHistoryPage";
import { DailyWorkReportsPage } from "@/pages/employee/DailyWorkReportsPage";
import { TasksPage } from "@/pages/employee/TasksPage";
import LeaveRequestsPage from "@/pages/employee/LeaveRequestsPage";

import { AdminDashboardPage } from "@/pages/admin/AdminDashboardPage";
import { EmployeesPage } from "@/pages/admin/EmployeesPage";
import { AttendanceRecordsPage } from "@/pages/admin/AttendanceRecordsPage";
import { MonthlyAttendancePage } from "@/pages/admin/MonthlyAttendancePage";
import { SitesPage } from "@/pages/admin/SitesPage";
import { ReportsPage } from "@/pages/admin/ReportsPage";
import { TaskManagementPage } from "@/pages/admin/TaskManagementPage";
import { ScoreboardPage } from "@/pages/admin/ScoreboardPage";
import LeaveManagementPage from "@/pages/admin/LeaveManagementPage";
import { HolidayManagementPage } from "@/pages/admin/HolidayManagementPage";
import { SettingsPage } from "@/pages/admin/SettingsPage";
import { ProfilePage } from "@/pages/admin/ProfilePage";
import { NoAccessPage } from "@/pages/admin/NoAccessPage";
import { ExpenseTrackerPage } from "@/pages/admin/ExpenseTrackerPage";
import { ExpenseManagementPage } from "@/pages/admin/ExpenseManagementPage";
import { EmployeeProfilePage } from "@/pages/employee/EmployeeProfilePage";

const employeeNavItems: NavItem[] = [
  { to: "/", label: "Check In / Out", shortLabel: "Home", icon: <Clock className="h-4 w-4" />, end: true },
  { to: "/history", label: "Attendance History", shortLabel: "Attendance", icon: <ClipboardList className="h-4 w-4" /> },
  { to: "/work-reports", label: "Work Reports", shortLabel: "Reports", icon: <FileText className="h-4 w-4" /> },
  { to: "/tasks", label: "My Tasks", shortLabel: "Tasks", icon: <CheckSquare className="h-4 w-4" /> },
  { to: "/leaves", label: "Leave Requests", shortLabel: "Leaves", icon: <CalendarDays className="h-4 w-4" /> },
  { to: "/profile", label: "My Profile", shortLabel: "Profile", icon: <UserCircle className="h-4 w-4" /> },
];

function AdminShell() {
  const { isMasterAdmin, can, canAny } = usePermissions();

  const navItems: NavItem[] = [
    ...(can("viewDashboard")
      ? [{ to: "/admin", label: "Dashboard", icon: <LayoutDashboard className="h-4 w-4" />, end: true }]
      : []),
    { to: "/admin/profile", label: "My Profile", icon: <UserCircle className="h-4 w-4" /> },
    ...(can("viewEmployees")
      ? [{ to: "/admin/employees", label: "Employees", icon: <Users className="h-4 w-4" /> }]
      : []),
    ...(can("viewAttendance")
      ? [
          {
            to: "/admin/attendance",
            label: "Attendance Records",
            icon: <ClipboardList className="h-4 w-4" />,
          },
          {
            to: "/admin/monthly",
            label: "Monthly Attendance",
            icon: <CalendarRange className="h-4 w-4" />,
          },
        ]
      : []),
    ...(canAny("assignTasks", "editTasks", "deleteTasks")
      ? [{ to: "/admin/tasks", label: "Task Assignment", icon: <CheckSquare className="h-4 w-4" /> }]
      : []),
    ...(isMasterAdmin
      ? [
          { to: "/admin/scoreboard", label: "Scoreboard", icon: <Trophy className="h-4 w-4" /> },
          {
            to: "/admin/leaves",
            label: "Leave Management",
            icon: <CalendarCheck className="h-4 w-4" />,
          },
          {
            to: "/admin/holidays",
            label: "Holiday Management",
            icon: <CalendarHeart className="h-4 w-4" />,
          },
          { to: "/admin/sites", label: "Sites", icon: <Building2 className="h-4 w-4" /> },
        ]
      : []),
    ...(can("viewReports")
      ? [{ to: "/admin/reports", label: "Reports", icon: <FileBarChart className="h-4 w-4" /> }]
      : []),
    ...(isMasterAdmin
      ? [
          {
            to: "/admin/expense-management",
            label: "Expense Approval",
            icon: <Wallet className="h-4 w-4" />,
          },
        ]
      : can("manageExpenses")
        ? [{ to: "/admin/expenses", label: "Expense Tracker", icon: <Wallet className="h-4 w-4" /> }]
        : []),
  ];

  return (
    <AppLayout
      navItems={navItems}
      roleLabel={isMasterAdmin ? "Administrator" : "Junior Admin"}
    />
  );
}

function RootRedirect() {
  const { employee } = useAuth();
  const { homePath } = usePermissions();

  if (!employee) return <Navigate to="/login" replace />;
  return <Navigate to={homePath} replace />;
}

function AuthenticatedApp() {
  const { isBootstrapping, isOffline, isReconnecting } = useAuth();

  if (isBootstrapping) {
    return <LoadingScreen label="Verifying your session…" />;
  }

  if (isOffline) {
    return <OfflineScreen reconnecting={isReconnecting} />;
  }

  return (
    <SettingsProvider>
      <ToastProvider>
        <SessionManager />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          <Route element={<ProtectedRoute allowedRoles={["employee"]} />}>
            <Route element={<AppLayout navItems={employeeNavItems} roleLabel="Employee" variant="employee" />}>
              <Route path="/" element={<EmployeeHomePage />} />
              <Route path="/history" element={<AttendanceHistoryPage />} />
              <Route path="/work-reports" element={<DailyWorkReportsPage />} />
              <Route path="/tasks" element={<TasksPage />} />
              <Route path="/leaves" element={<LeaveRequestsPage />} />
              <Route path="/profile" element={<EmployeeProfilePage />} />
            </Route>
          </Route>

          <Route element={<ProtectedRoute allowedRoles={["admin", "junior_admin"]} />}>
            <Route element={<AdminShell />}>
              <Route path="/admin/profile" element={<ProfilePage />} />
              <Route element={<PermissionRoute allOf={["viewDashboard"]} />}>
                <Route path="/admin" element={<AdminDashboardPage />} />
              </Route>
              <Route element={<PermissionRoute allOf={["viewEmployees"]} />}>
                <Route path="/admin/employees" element={<EmployeesPage />} />
              </Route>
              <Route element={<PermissionRoute allOf={["viewAttendance"]} />}>
                <Route path="/admin/attendance" element={<AttendanceRecordsPage />} />
                <Route path="/admin/monthly" element={<MonthlyAttendancePage />} />
              </Route>
              <Route element={<PermissionRoute anyOf={["assignTasks", "editTasks", "deleteTasks"]} />}>
                <Route path="/admin/tasks" element={<TaskManagementPage />} />
              </Route>
              <Route element={<MasterAdminRoute />}>
                <Route path="/admin/scoreboard" element={<ScoreboardPage />} />
                <Route path="/admin/leaves" element={<LeaveManagementPage />} />
                <Route path="/admin/holidays" element={<HolidayManagementPage />} />
                <Route path="/admin/sites" element={<SitesPage />} />
                <Route path="/admin/settings" element={<SettingsPage />} />
                <Route path="/admin/expense-management" element={<ExpenseManagementPage />} />
              </Route>
              <Route element={<PermissionRoute allOf={["viewReports"]} />}>
                <Route path="/admin/reports" element={<ReportsPage />} />
              </Route>
              <Route element={<PermissionRoute allOf={["manageExpenses"]} />}>
                <Route path="/admin/expenses" element={<ExpenseTrackerPage />} />
              </Route>
              <Route path="/admin/no-access" element={<NoAccessPage />} />
            </Route>
          </Route>

          <Route path="*" element={<RootRedirect />} />
        </Routes>
      </ToastProvider>
    </SettingsProvider>
  );
}

function App() {
  return (
    <MotionConfig reducedMotion="user">
      <AuthProvider>
        <AuthenticatedApp />
      </AuthProvider>
    </MotionConfig>
  );
}

export default App;
