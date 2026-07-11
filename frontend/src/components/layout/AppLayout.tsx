import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import clsx from "clsx";
import { motion } from "motion/react";
import { ChevronLeft, LogOut, Menu, X } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { usePermissions } from "@/auth/usePermissions";
import { useLocalStorageBoolean } from "@/hooks/useLocalStorageBoolean";
import { EmployeeAvatar } from "@/components/EmployeeAvatar";
import { Logo, LogoMark } from "@/components/Logo";
import { NotificationBell } from "@/components/NotificationBell";
import { MobileAvatarMenu } from "@/components/layout/MobileAvatarMenu";
import { BottomNav } from "@/components/layout/BottomNav";
import { quickTransition } from "@/lib/motion";

export interface NavItem {
  to: string;
  label: string;
  /** Shorter label for the employee bottom tab bar on narrow screens. */
  shortLabel?: string;
  icon: ReactNode;
  end?: boolean;
}

const SIDEBAR_COLLAPSE_KEY = "ozone.sidebar.collapsed";

export function AppLayout({
  navItems,
  roleLabel,
  variant = "admin",
}: {
  navItems: NavItem[];
  roleLabel: string;
  /** Controls the mobile (below `lg`) navigation pattern: admin keeps the hamburger drawer, employee gets a bottom tab bar. */
  variant?: "admin" | "employee";
}) {
  const { employee, logout } = useAuth();
  const { isMasterAdmin } = usePermissions();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useLocalStorageBoolean(SIDEBAR_COLLAPSE_KEY, false);
  const location = useLocation();
  /** Settings uses an internal split-pane scroll; lock the shell scroll on lg+. */
  const isSettingsPage = /\/settings\/?$/.test(location.pathname);
  const isEmployeeMobile = variant === "employee";
  const profilePath =
    employee?.role === "employee"
      ? "/profile"
      : employee?.role === "junior_admin"
        ? "/admin/profile"
        : "/admin/settings";

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

  const brand = <Logo variant="sidebar" onNavigate={closeDrawer} />;

  function renderNav(scope: "desktop" | "mobile") {
    return (
      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain px-3 py-4">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={closeDrawer}
            title={collapsed ? item.label : undefined}
            className={({ isActive }) =>
              clsx(
                "relative flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors sm:py-2.5",
                collapsed && "lg:justify-center lg:px-0",
                isActive ? "text-brand-700" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.span
                    layoutId={`sidebar-active-pill-${scope}`}
                    className="absolute inset-0 rounded-lg bg-brand-50"
                    transition={quickTransition}
                  />
                )}
                <span className="relative z-10 flex items-center gap-3">
                  {item.icon}
                  <span className={clsx("sidebar-label", collapsed && "lg:hidden")}>{item.label}</span>
                </span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    );
  }

  const profileContent = (
    <>
      <EmployeeAvatar
        name={employee?.name ?? "User"}
        photoPath={employee?.profile_photo_path}
        size="lg"
        editable
        onEditClick={() => {
          closeDrawer();
          navigate(profilePath);
        }}
      />
      <div className={clsx("min-w-0", collapsed && "lg:hidden")}>
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
      <p className={clsx("mb-2 text-xs font-medium uppercase tracking-wide text-slate-400", collapsed && "lg:hidden")}>
        {roleLabel}
      </p>

      {isMasterAdmin ? (
        <NavLink
          to="/admin/settings"
          onClick={closeDrawer}
          title={collapsed ? "Settings" : undefined}
          className={({ isActive }) =>
            clsx(
              "flex w-full items-center gap-3 rounded-lg px-2 py-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500",
              collapsed && "lg:justify-center",
              isActive ? "bg-brand-50" : "hover:bg-slate-50"
            )
          }
          aria-label="Open application settings"
        >
          {profileContent}
        </NavLink>
      ) : (
        <div className={clsx("flex items-center gap-3 px-2 py-2", collapsed && "lg:justify-center")}>
          {profileContent}
        </div>
      )}

      <button
        onClick={() => {
          void logout().finally(() => navigate("/login", { replace: true }));
        }}
        title={collapsed ? "Logout" : undefined}
        className={clsx(
          "mt-3 flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-50 hover:text-red-600",
          collapsed && "lg:justify-center"
        )}
      >
        <LogOut className="h-4 w-4" />
        <span className={clsx(collapsed && "lg:hidden")}>Logout</span>
      </button>
    </div>
  );

  return (
    <div className="flex h-dvh overflow-hidden bg-slate-50">
      <aside
        className={clsx(
          "sidebar-shell relative hidden h-full shrink-0 lg:flex",
          collapsed ? "w-[4.5rem]" : "w-64"
        )}
      >
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="absolute -right-3 top-7 z-10 hidden h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 shadow-soft-sm transition-colors hover:bg-slate-50 hover:text-slate-700 lg:flex"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <ChevronLeft className={clsx("h-3.5 w-3.5 transition-transform duration-200", collapsed && "rotate-180")} />
        </button>

        <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden border-r border-slate-200 bg-white">
          <div
            className={clsx(
              "flex shrink-0 min-h-[4.5rem] items-center overflow-hidden border-b border-slate-100 px-4 py-3 lg:px-5",
              collapsed && "lg:justify-center lg:px-2"
            )}
          >
            {collapsed ? <LogoMark /> : brand}
          </div>
          {renderNav("desktop")}
          {userFooter}
        </div>
      </aside>

      {variant === "admin" && (
        <>
          <div
            className={clsx(
              "fixed inset-0 z-40 bg-slate-900/50 transition-opacity lg:hidden",
              drawerOpen ? "opacity-100" : "pointer-events-none opacity-0"
            )}
            aria-hidden={!drawerOpen}
          />
          <aside
            className={clsx(
              "fixed inset-y-0 left-0 z-50 flex h-dvh w-72 max-w-[85vw] flex-col overflow-hidden bg-white shadow-soft-lg transition-transform duration-200 ease-out lg:hidden",
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
            {renderNav("mobile")}
            {userFooter}
          </aside>
        </>
      )}

      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header
          className={clsx(
            "sticky top-0 z-30 grid shrink-0 min-h-[3.5rem] items-center gap-2 border-b border-slate-200 bg-white/95 px-3 py-2.5 pt-safe backdrop-blur sm:gap-3 sm:px-4 lg:hidden",
            isEmployeeMobile ? "grid-cols-[minmax(0,1fr)_auto]" : "grid-cols-[auto_minmax(0,1fr)_auto]"
          )}
        >
          {!isEmployeeMobile && (
            <button
              onClick={() => setDrawerOpen(true)}
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
          )}
          <Logo variant="header" className="justify-self-start" onNavigate={closeDrawer} />
          <div className="flex items-center gap-1 justify-self-end">
            <NotificationBell />
            {isEmployeeMobile ? (
              <MobileAvatarMenu />
            ) : (
              <button
                type="button"
                onClick={() => navigate(profilePath)}
                className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                aria-label="My profile"
              >
                <EmployeeAvatar
                  name={employee?.name ?? "User"}
                  photoPath={employee?.profile_photo_path}
                  size="sm"
                />
              </button>
            )}
          </div>
        </header>

        <main
          className={clsx(
            "min-h-0 min-w-0 flex-1 overscroll-contain overflow-x-hidden",
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
              "mx-auto w-full max-w-[1600px] min-w-0 px-3 py-4 sm:px-6 sm:py-6 lg:px-8",
              isEmployeeMobile ? "pb-employee-nav" : "pb-safe",
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

        {isEmployeeMobile && <BottomNav items={navItems} />}
      </div>
    </div>
  );
}
