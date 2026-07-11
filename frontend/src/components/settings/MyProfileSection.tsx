import { ProfilePhotoEditor } from "@/components/ProfilePhotoEditor";
import { useAuth } from "@/auth/AuthContext";
import { Spinner } from "@/components/ui/Spinner";

export function MyProfileSection() {
  const { employee } = useAuth();

  if (!employee) {
    return (
      <div className="flex justify-center py-12">
        <Spinner label="Loading profile…" />
      </div>
    );
  }

  const roleLabel =
    employee.role === "admin"
      ? "System Admin"
      : employee.role === "junior_admin"
        ? "Junior Admin"
        : "Employee";

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Signed in as <span className="font-medium text-slate-700">{employee.name}</span>
        {" · "}
        {employee.employee_code}
        {" · "}
        {roleLabel}
      </p>
      <p className="text-sm text-slate-500">
        Your profile picture appears in the sidebar, navigation, and across attendance, tasks, leave,
        and expenses. Attendance selfies are stored separately and are not used here.
      </p>
      <ProfilePhotoEditor employee={employee} />
    </div>
  );
}
