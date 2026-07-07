import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import clsx from "clsx";
import * as notificationsApi from "@/api/notifications";
import type { AppNotification } from "@/types";
import { formatDateTime } from "@/utils/format";

export function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  async function refresh() {
    const [unread, list] = await Promise.all([
      notificationsApi.getUnreadCount(),
      notificationsApi.listNotifications(),
    ]);
    setCount(unread);
    setNotifications(list);
  }

  useEffect(() => {
    refresh().catch(() => undefined);
    const id = window.setInterval(() => refresh().catch(() => undefined), 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function handleOpen() {
    setOpen((v) => !v);
    if (!open) await refresh().catch(() => undefined);
  }

  async function handleSelect(notification: AppNotification) {
    if (!notification.read_at) {
      await notificationsApi.markNotificationRead(notification.id);
      setCount((c) => Math.max(0, c - 1));
    }
    setOpen(false);
    if (notification.link_path) navigate(notification.link_path);
  }

  async function markAllRead() {
    await notificationsApi.markAllNotificationsRead();
    setCount(0);
    await refresh();
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={handleOpen}
        className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {count > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold text-slate-900">Notifications</p>
            {count > 0 && (
              <button type="button" onClick={markAllRead} className="text-xs font-medium text-brand-600 hover:underline">
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-400">No notifications</p>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => handleSelect(n)}
                  className={clsx(
                    "block w-full border-b border-slate-50 px-4 py-3 text-left hover:bg-slate-50",
                    !n.read_at && "bg-brand-50/40"
                  )}
                >
                  <p className="text-sm font-medium text-slate-900">{n.title}</p>
                  {n.body && <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{n.body}</p>}
                  <p className="mt-1 text-[10px] text-slate-400">{formatDateTime(n.created_at)}</p>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
