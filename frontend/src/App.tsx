import { Navigate, Route, Routes } from "react-router-dom";
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
} from "lucide-react";
import { AuthProvider } from "@/auth/AuthContext";
import { SessionManager } from "@/auth/SessionManager";
import { ProtectedRoute } from "@/auth/ProtectedRoute";
import { SettingsProvider } from "@/contexts/SettingsContext";
import { AppLayout } from "@/components/layout/AppLayout";
import { LoginPage } from "@/pages/LoginPage";

// Employee pages
import { EmployeeHomePage } from "@/pages/employee/EmployeeHomePage";
import { AttendanceHistoryPage } from "@/pages/employee/AttendanceHistoryPage";
import { DailyWorkReportsPage } from "@/pages/employee/DailyWorkReportsPage";
import { TasksPage } from "@/pages/employee/TasksPage";
import LeaveRequestsPage from "@/pages/employee/LeaveRequestsPage";

// Admin pages
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

const employeeNavItems = [
  { to: "/", label: "Check In / Out", icon: <Clock className="h-4 w-4" />, end: true },
  { to: "/history", label: "Attendance History", icon: <ClipboardList className="h-4 w-4" /> },
  { to: "/work-reports", label: "Work Reports", icon: <FileText className="h-4 w-4" /> },
  { to: "/tasks", label: "My Tasks", icon: <CheckSquare className="h-4 w-4" /> },
  { to: "/leaves", label: "Leave Requests", icon: <CalendarDays className="h-4 w-4" /> },
];

const adminNavItems = [
  { to: "/admin", label: "Dashboard", icon: <LayoutDashboard className="h-4 w-4" />, end: true },
  { to: "/admin/employees", label: "Employees", icon: <Users className="h-4 w-4" /> },
  { to: "/admin/attendance", label: "Attendance Records", icon: <ClipboardList className="h-4 w-4" /> },
  { to: "/admin/monthly", label: "Monthly Attendance", icon: <CalendarRange className="h-4 w-4" /> },
  { to: "/admin/tasks", label: "Task Assignment", icon: <CheckSquare className="h-4 w-4" /> },
  { to: "/admin/scoreboard", label: "Scoreboard", icon: <Trophy className="h-4 w-4" /> },
  { to: "/admin/leaves", label: "Leave Management", icon: <CalendarCheck className="h-4 w-4" /> },
  { to: "/admin/holidays", label: "Holiday Management", icon: <CalendarHeart className="h-4 w-4" /> },
  { to: "/admin/sites", label: "Sites", icon: <Building2 className="h-4 w-4" /> },
  { to: "/admin/reports", label: "Reports", icon: <FileBarChart className="h-4 w-4" /> },
];

function App() {
  return (
    <AuthProvider>
      <SettingsProvider>
      <SessionManager />
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route element={<ProtectedRoute allowedRoles={["employee"]} />}>
          <Route element={<AppLayout navItems={employeeNavItems} roleLabel="Employee" />}>
            <Route path="/" element={<EmployeeHomePage />} />
            <Route path="/history" element={<AttendanceHistoryPage />} />
            <Route path="/work-reports" element={<DailyWorkReportsPage />} />
            <Route path="/tasks" element={<TasksPage />} />
            <Route path="/leaves" element={<LeaveRequestsPage />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute allowedRoles={["admin"]} />}>
          <Route element={<AppLayout navItems={adminNavItems} roleLabel="Administrator" />}>
            <Route path="/admin" element={<AdminDashboardPage />} />
            <Route path="/admin/employees" element={<EmployeesPage />} />
            <Route path="/admin/attendance" element={<AttendanceRecordsPage />} />
            <Route path="/admin/monthly" element={<MonthlyAttendancePage />} />
            <Route path="/admin/tasks" element={<TaskManagementPage />} />
            <Route path="/admin/scoreboard" element={<ScoreboardPage />} />
            <Route path="/admin/leaves" element={<LeaveManagementPage />} />
            <Route path="/admin/holidays" element={<HolidayManagementPage />} />
            <Route path="/admin/sites" element={<SitesPage />} />
            <Route path="/admin/reports" element={<ReportsPage />} />
            <Route path="/admin/settings" element={<SettingsPage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </SettingsProvider>
    </AuthProvider>
  );
}

export default App;
