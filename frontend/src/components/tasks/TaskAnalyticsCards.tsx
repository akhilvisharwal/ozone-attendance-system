import { AlertTriangle, CheckCircle2, Circle, Clock, PauseCircle } from "lucide-react";
import { motion } from "motion/react";
import type { TaskAnalytics } from "@/types";
import { Card } from "@/components/ui/Card";
import { staggerContainer, staggerItem } from "@/lib/motion";

export function TaskAnalyticsCards({ analytics }: { analytics: TaskAnalytics | null }) {
  if (!analytics) return null;

  const items = [
    { label: "Total", value: analytics.total, tone: "text-slate-900", icon: Circle },
    { label: "Not Started", value: analytics.not_started, tone: "text-slate-600", icon: Circle },
    { label: "In Progress", value: analytics.in_progress, tone: "text-blue-700", icon: Clock },
    { label: "On Hold", value: analytics.on_hold, tone: "text-amber-700", icon: PauseCircle },
    { label: "Completed", value: analytics.completed, tone: "text-emerald-700", icon: CheckCircle2 },
    { label: "Overdue", value: analytics.overdue, tone: "text-red-700", icon: AlertTriangle },
  ];

  return (
    <Card className="overflow-hidden">
      <motion.div
        variants={staggerContainer}
        initial="initial"
        animate="animate"
        className="grid grid-cols-2 divide-x divide-y divide-slate-100 sm:grid-cols-3 lg:grid-cols-7"
      >
        {items.map(({ label, value, tone, icon: Icon }) => (
          <motion.div key={label} variants={staggerItem} className="flex min-w-0 items-center gap-3 p-4">
            <Icon className={`h-5 w-5 flex-shrink-0 ${tone}`} />
            <div className="min-w-0">
              <p className="truncate text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
              <p className={`text-xl font-semibold ${tone}`}>{value}</p>
            </div>
          </motion.div>
        ))}
        <motion.div variants={staggerItem} className="col-span-2 min-w-0 p-4 sm:col-span-3 lg:col-span-1">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Completion</p>
          <p className="mt-1 text-xl font-semibold text-brand-700">{analytics.completion_percentage}%</p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-brand-500 transition-all"
              style={{ width: `${analytics.completion_percentage}%` }}
            />
          </div>
        </motion.div>
      </motion.div>
    </Card>
  );
}
