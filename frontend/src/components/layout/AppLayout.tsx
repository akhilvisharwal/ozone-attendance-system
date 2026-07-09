import { NavLink, Outlet, useLocation } from "react-router-dom";
import type { ChangeEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { LogOut, Menu, User, X } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { SecureImage } from "@/components/SecureImage";
import { Logo } from "@/components/Logo";
import { NotificationBell } from "@/components/NotificationBell";
import { updateMyAvatar } from "@/api/employees";

export interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  end?: boolean;
}

export function AppLayout({
  navItems,
  roleLabel,
}: {
  navItems: NavItem[];
  roleLabel: string;
}) {
  const { employee, logout, refreshMe } = useAuth();
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();
  /** Settings uses an internal split-pane scroll; lock the shell scroll on lg+. */
  const isSettingsPage = /\/settings\/?$/.test(location.pathname);

  const closeDrawer = () => setDrawerOpen(false);

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (drawerOpen) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [drawerOpen]);

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

  const brand = <Logo variant="sidebar" onNavigate={closeDrawer} />;

  const nav = (
    <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain px-3 py-4">
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={closeDrawer}
          className={({ isActive }) =>
            clsx(
              "flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors sm:py-2.5",
              isActive ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            )
          }
        >
          {item.icon}
          {item.label}
        </NavLink>
      ))}
    </nav>
  );

  const profileContent = (
    <>
      <div className="relative flex-shrink-0">
        <div className="h-10 w-10 overflow-hidden rounded-full bg-slate-100">
          {employee?.profile_photo_path ? (
            <SecureImage path={employee.profile_photo_path} alt="Profile" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-slate-400">
              <User className="h-5 w-5" />
            </div>
          )}
        </div>
        {employee?.role === "employee" && (
          <button
            disabled={uploading}
            onClick={() => avatarInputRef.current?.click()}
            title="Change profile picture"
            className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-brand-600 text-white shadow hover:bg-brand-700 disabled:opacity-50"
          >
            <span className="text-[8px] font-bold leading-none">✎</span>
          </button>
        )}
        <input
          ref={avatarInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleAvatarChange}
        />
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-900">{employee?.name}</p>
        <p className="text-xs text-slate-400">{employee?.employee_code}</p>
        {employee?.designation && (
          <p className="truncate text-xs text-slate-500">{employee.designation}</p>
        )}
      </div>
    </>
  );

  const userFooter = (
    <div className="shrink-0 border-t border-slate-100 px-4 py-4 pb-safe">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">{roleLabel}</p>

      {employee?.role === "admin" ? (
        <NavLink
          to="/admin/settings"
          onClick={closeDrawer}
          className={({ isActive }) =>
            clsx(
              "flex w-full items-center gap-3 rounded-lg px-2 py-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500",
              isActive ? "bg-brand-50" : "hover:bg-slate-50"
            )
          }
          aria-label="Open application settings"
        >
          {profileContent}
        </NavLink>
      ) : (
        <div className="flex items-center gap-3 px-2 py-2">{profileContent}</div>
      )}

      <button
        onClick={() => logout()}
        className="mt-3 flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-500 hover:bg-slate-50 hover:text-red-600"
      >
        <LogOut className="h-4 w-4" />
        Logout
      </button>
    </div>
  );

  return (
    <div className="flex h-dvh overflow-hidden bg-slate-50">
      <aside className="hidden h-full w-64 min-w-0 shrink-0 flex-col overflow-hidden border-r border-slate-200 bg-white lg:flex">
        <div className="flex shrink-0 min-h-[4.5rem] items-center overflow-hidden border-b border-slate-100 px-4 py-3 lg:px-5">
          {brand}
        </div>
        {nav}
        {userFooter}
      </aside>

      <div
        className={clsx(
          "fixed inset-0 z-40 bg-slate-900/50 transition-opacity lg:hidden",
          drawerOpen ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        aria-hidden={!drawerOpen}
      />
      <aside
        className={clsx(
          "fixed inset-y-0 left-0 z-50 flex h-dvh w-72 max-w-[85vw] flex-col overflow-hidden bg-white shadow-xl transition-transform duration-200 ease-out lg:hidden",
          drawerOpen ? "translate-x-0" : "-translate-x-full"
        )}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex shrink-0 min-h-[4rem] items-center gap-2 border-b border-slate-100 px-3 py-3 pt-safe">
          <div className="min-w-0 flex-1 overflow-hidden">{brand}</div>
          <button
            onClick={closeDrawer}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {nav}
        {userFooter}
      </aside>

      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-30 grid shrink-0 min-h-[3.5rem] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-b border-slate-200 bg-white/95 px-3 py-2.5 pt-safe backdrop-blur sm:gap-3 sm:px-4 lg:hidden">
          <button
            onClick={() => setDrawerOpen(true)}
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Logo variant="header" className="justify-self-start" onNavigate={closeDrawer} />
          <div className="flex items-center gap-1 justify-self-end">
            <NotificationBell />
            <div className="h-8 w-8 flex-shrink-0 overflow-hidden rounded-full bg-slate-100">
            {employee?.profile_photo_path ? (
              <SecureImage path={employee.profile_photo_path} alt="Profile" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-slate-400">
                <User className="h-4 w-4" />
              </div>
            )}
            </div>
          </div>
        </header>

        <main
          className={clsx(
            "min-h-0 flex-1 overscroll-contain",
            isSettingsPage
              ? "flex flex-col overflow-y-auto lg:overflow-hidden"
              : "overflow-y-auto"
          )}
        >
          <div className="hidden border-b border-slate-200 px-4 py-3 print:block sm:px-6">
            <Logo variant="print" interactive={false} />
          </div>
          <div
            className={clsx(
              "mx-auto w-full max-w-[1600px] px-4 py-5 sm:px-6 sm:py-6 lg:px-8 pb-safe",
              isSettingsPage && "flex min-h-0 flex-1 flex-col lg:overflow-hidden"
            )}
          >
            <div className="mb-4 hidden shrink-0 justify-end lg:flex">
              <NotificationBell />
            </div>
            <div
              className={clsx(
                isSettingsPage && "flex min-h-0 flex-1 flex-col lg:overflow-hidden"
              )}
            >
              <Outlet />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
