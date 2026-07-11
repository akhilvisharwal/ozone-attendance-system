import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { Bell, Trash2 } from "lucide-react";
import clsx from "clsx";
import * as notificationsApi from "@/api/notifications";
import type { AppNotification } from "@/types";
import { formatDateTime } from "@/utils/format";
import { panelVariants } from "@/lib/motion";

const POLL_INTERVAL_MS = 30_000;

export function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    const [unread, list] = await Promise.all([
      notificationsApi.getUnreadCount(),
      notificationsApi.listNotifications(),
    ]);
    setCount(unread);
    setNotifications(list);
  }, []);

  useEffect(() => {
    refresh().catch(() => undefined);
    const id = window.setInterval(() => refresh().catch(() => undefined), POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        refresh().catch(() => undefined);
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [refresh]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function handleOpen() {
    const nextOpen = !open;
    setOpen(nextOpen);
    if (nextOpen) await refresh().catch(() => undefined);
  }

  async function handleSelect(notification: AppNotification) {
    if (!notification.read_at) {
      await notificationsApi.markNotificationRead(notification.id);
      setCount((c) => Math.max(0, c - 1));
      setNotifications((items) =>
        items.map((item) =>
          item.id === notification.id ? { ...item, read_at: new Date().toISOString() } : item
        )
      );
    }
    setOpen(false);
    if (notification.link_path) navigate(notification.link_path);
  }

  async function handleDelete(e: React.MouseEvent, notification: AppNotification) {
    e.stopPropagation();
    await notificationsApi.deleteNotification(notification.id);
    if (!notification.read_at) {
      setCount((c) => Math.max(0, c - 1));
    }
    setNotifications((items) => items.filter((item) => item.id !== notification.id));
  }

  async function markAllRead() {
    await notificationsApi.markAllNotificationsRead();
    setCount(0);
    setNotifications((items) =>
      items.map((item) => ({ ...item, read_at: item.read_at ?? new Date().toISOString() }))
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => void handleOpen()}
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

      <AnimatePresence>
        {open && (
          <motion.div
            variants={panelVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="absolute right-0 z-50 mt-2 w-[min(20rem,calc(100vw-1.5rem))] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <p className="text-sm font-semibold text-slate-900">Notifications</p>
              {count > 0 && (
                <button
                  type="button"
                  onClick={() => void markAllRead()}
                  className="text-xs font-medium text-brand-600 hover:underline"
                >
                  Mark all read
                </button>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-slate-400">No notifications</p>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    className={clsx(
                      "flex items-start gap-2 border-b border-slate-50 px-4 py-3 hover:bg-slate-50",
                      !n.read_at && "bg-brand-50/40"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => void handleSelect(n)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="text-sm font-medium text-slate-900">{n.title}</p>
                      {n.body && <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{n.body}</p>}
                      <p className="mt-1 text-[10px] text-slate-400">{formatDateTime(n.created_at)}</p>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => void handleDelete(e, n)}
                      className="mt-0.5 flex-shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-600"
                      aria-label="Delete notification"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
