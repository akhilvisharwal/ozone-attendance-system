import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { Camera, LogOut, UserCircle } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { EmployeeAvatar } from "@/components/EmployeeAvatar";
import { panelVariantsFromTop } from "@/lib/motion";

/** Mobile-header avatar trigger for the employee shell — replaces the drawer footer's profile/logout block. */
export function MobileAvatarMenu() {
  const { employee, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-full ring-2 ring-transparent transition-shadow hover:ring-slate-200 focus:outline-none focus-visible:ring-brand-400"
        aria-label="Account menu"
        aria-haspopup="true"
        aria-expanded={open}
      >
        <EmployeeAvatar
          name={employee?.name ?? "User"}
          photoPath={employee?.profile_photo_path}
          size="sm"
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            variants={panelVariantsFromTop}
            initial="initial"
            animate="animate"
            exit="exit"
            style={{ transformOrigin: "top right" }}
            className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft-lg"
          >
            <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3.5">
              <EmployeeAvatar
                name={employee?.name ?? "User"}
                photoPath={employee?.profile_photo_path}
                size="lg"
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">{employee?.name}</p>
                <p className="truncate text-xs text-slate-400">{employee?.employee_code}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setOpen(false);
                navigate("/profile");
              }}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
            >
              <UserCircle className="h-4 w-4 text-slate-400" />
              My Profile
            </button>

            <button
              type="button"
              onClick={() => {
                setOpen(false);
                navigate("/profile");
              }}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
            >
              <Camera className="h-4 w-4 text-slate-400" />
              Change photo
            </button>

            <button
              type="button"
              onClick={() => {
                setOpen(false);
                void logout().then(() => navigate("/login", { replace: true }));
              }}
              className="flex w-full items-center gap-2.5 border-t border-slate-100 px-4 py-2.5 text-left text-sm font-medium text-rose-600 transition-colors hover:bg-rose-50"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
