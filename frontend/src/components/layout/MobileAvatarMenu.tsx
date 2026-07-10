import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { Camera, LogOut, User } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { SecureImage } from "@/components/SecureImage";
import { updateMyAvatar } from "@/api/employees";
import { panelVariantsFromTop } from "@/lib/motion";

/** Mobile-header avatar trigger for the employee shell — replaces the drawer footer's profile/logout block. */
export function MobileAvatarMenu() {
  const { employee, logout, refreshMe } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  async function handleAvatarChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await updateMyAvatar(file);
      await refreshMe();
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="h-8 w-8 flex-shrink-0 overflow-hidden rounded-full bg-slate-100 ring-2 ring-transparent transition-shadow hover:ring-slate-200"
        aria-label="Account menu"
        aria-haspopup="true"
        aria-expanded={open}
      >
        {employee?.profile_photo_path ? (
          <SecureImage path={employee.profile_photo_path} alt="Profile" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-slate-400">
            <User className="h-4 w-4" />
          </div>
        )}
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
              <div className="h-11 w-11 flex-shrink-0 overflow-hidden rounded-full bg-slate-100">
                {employee?.profile_photo_path ? (
                  <SecureImage path={employee.profile_photo_path} alt="Profile" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-slate-400">
                    <User className="h-5 w-5" />
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">{employee?.name}</p>
                <p className="truncate text-xs text-slate-400">{employee?.employee_code}</p>
              </div>
            </div>

            <button
              type="button"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
            >
              <Camera className="h-4 w-4 text-slate-400" />
              {uploading ? "Uploading..." : "Change photo"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleAvatarChange}
            />

            <button
              type="button"
              onClick={() => {
                setOpen(false);
                void logout().finally(() => navigate("/login", { replace: true }));
              }}
              className="flex w-full items-center gap-2.5 border-t border-slate-100 px-4 py-2.5 text-left text-sm font-medium text-slate-500 transition-colors hover:bg-slate-50 hover:text-red-600"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
