import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import clsx from "clsx";
import {
  Building2,
  Clock,
  CalendarDays,
  Users,
  ScanFace,
  Shield,
  HardDrive,
  Database,
  Bell,
  ScrollText,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { CompanySettingsSection } from "@/components/settings/CompanySettingsSection";
import { AttendanceSettingsSection } from "@/components/settings/AttendanceSettingsSection";
import { WeeklyOffSettingsSection } from "@/components/settings/WeeklyOffSettingsSection";
import { EmployeeSettingsSection } from "@/components/settings/EmployeeSettingsSection";
import { AttendanceCaptureSettingsSection } from "@/components/settings/AttendanceCaptureSettingsSection";
import { NotificationSettingsSection } from "@/components/settings/NotificationSettingsSection";
import { SecuritySettingsSection } from "@/components/settings/SecuritySettingsSection";
import { BackupDataSettingsSection } from "@/components/settings/BackupDataSettingsSection";
import { DatabaseSettingsSection } from "@/components/settings/DatabaseSettingsSection";
import { AuditSettingsSection } from "@/components/settings/AuditSettingsSection";
import { SETTINGS_NAV, type SettingsTabId } from "@/types/settings";

const ICONS: Record<SettingsTabId, ReactNode> = {
  company: <Building2 className="h-4 w-4" />,
  attendance: <Clock className="h-4 w-4" />,
  weeklyOff: <CalendarDays className="h-4 w-4" />,
  employee: <Users className="h-4 w-4" />,
  mobile: <ScanFace className="h-4 w-4" />,
  notifications: <Bell className="h-4 w-4" />,
  security: <Shield className="h-4 w-4" />,
  backup: <HardDrive className="h-4 w-4" />,
  database: <Database className="h-4 w-4" />,
  audit: <ScrollText className="h-4 w-4" />,
};

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTabId>("company");
  const contentRef = useRef<HTMLDivElement>(null);

  const activeItem = useMemo(
    () => SETTINGS_NAV.find((item) => item.id === activeTab) ?? SETTINGS_NAV[0],
    [activeTab]
  );

  const groupedNav = useMemo(() => {
    const groups = new Map<string, typeof SETTINGS_NAV>();
    for (const item of SETTINGS_NAV) {
      const list = groups.get(item.group) ?? [];
      list.push(item);
      groups.set(item.group, list);
    }
    return Array.from(groups.entries());
  }, []);

  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
  }, [activeTab]);

  return (
    /*
      lg+: fill the shell height; left nav stays put, only the right pane scrolls.
      <lg: sticky horizontal category strip while the app main area scrolls.
    */
    <div className="mx-auto flex w-full max-w-6xl flex-col lg:h-full lg:min-h-0 lg:overflow-hidden">
      <div className="shrink-0">
        <PageHeader
          title="Settings"
          subtitle="Application Control Panel — configure the Attendance Management System"
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row lg:items-stretch lg:gap-8 lg:overflow-hidden">
        <nav
          aria-label="Settings categories"
          className={clsx(
            "z-20 shrink-0",
            // Mobile / tablet: sticky horizontal strip under the main scroll top
            "sticky top-0 -mx-4 border-b border-slate-200/80 bg-slate-50/95 px-4 py-2 backdrop-blur-md sm:-mx-6 sm:px-6",
            "flex flex-row gap-2 overflow-x-auto overscroll-x-contain",
            // Desktop: non-scrolling column (own overflow only if many categories)
            "lg:static lg:mx-0 lg:h-full lg:w-52 lg:flex-col lg:gap-0 lg:overflow-y-auto lg:overflow-x-visible lg:overscroll-contain lg:border-b-0 lg:bg-transparent lg:px-0 lg:py-1 lg:backdrop-blur-none"
          )}
        >
          {groupedNav.map(([group, items], groupIndex) => (
            <div
              key={group}
              className={clsx(
                "min-w-[10rem] shrink-0 lg:min-w-0 lg:shrink",
                groupIndex > 0 && "lg:mt-5 lg:border-t lg:border-slate-100 lg:pt-5"
              )}
            >
              <p className="mb-2 hidden px-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 lg:block">
                {group}
              </p>
              <div className="flex gap-2 lg:flex-col lg:gap-1">
                {items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveTab(item.id)}
                    className={clsx(
                      "flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors lg:w-full",
                      activeTab === item.id
                        ? "bg-brand-50 text-brand-700"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    )}
                  >
                    {ICONS[item.id]}
                    <span className="whitespace-nowrap">{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div
          ref={contentRef}
          className="min-h-0 min-w-0 flex-1 lg:overflow-y-auto lg:overscroll-contain lg:pr-1"
        >
          <Card className="overflow-hidden">
            <div className="border-b border-slate-100 px-5 py-4 sm:px-6">
              <h2 className="text-base font-semibold text-slate-900">{activeItem.label}</h2>
              <p className="mt-0.5 text-sm text-slate-500">{activeItem.description}</p>
            </div>

            <div className="px-5 py-8 sm:px-6">
              {activeTab === "company" ? (
                <CompanySettingsSection />
              ) : activeTab === "attendance" ? (
                <AttendanceSettingsSection />
              ) : activeTab === "weeklyOff" ? (
                <WeeklyOffSettingsSection />
              ) : activeTab === "employee" ? (
                <EmployeeSettingsSection />
              ) : activeTab === "mobile" ? (
                <AttendanceCaptureSettingsSection />
              ) : activeTab === "notifications" ? (
                <NotificationSettingsSection />
              ) : activeTab === "security" ? (
                <SecuritySettingsSection />
              ) : activeTab === "backup" ? (
                <BackupDataSettingsSection />
              ) : activeTab === "database" ? (
                <DatabaseSettingsSection />
              ) : activeTab === "audit" ? (
                <AuditSettingsSection />
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-10 text-center">
                  <p className="text-sm font-medium text-slate-700">
                    {activeItem.label} settings
                  </p>
                  <p className="mt-2 text-sm text-slate-500">
                    Application Settings – Features will be added here later.
                  </p>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
