import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import type { TaskAnalytics } from "@/types";

export function TaskDashboardWidget({
  analytics,
  tasksLink,
  title = "Tasks Overview",
}: {
  analytics: TaskAnalytics | null;
  tasksLink: string;
  title?: string;
}) {
  if (!analytics) return null;

  return (
    <Card className="mb-6">
      <CardHeader
        title={title}
        subtitle={`${analytics.completion_percentage}% completion rate`}
        action={
          <Link to={tasksLink} className="text-sm font-medium text-brand-600 hover:underline">
            View all
          </Link>
        }
      />
      <CardBody className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <MiniStat icon={<Clock className="h-4 w-4 text-blue-600" />} label="In Progress" value={analytics.in_progress} />
        <MiniStat icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />} label="Completed" value={analytics.completed} />
        <MiniStat icon={<AlertTriangle className="h-4 w-4 text-red-600" />} label="Overdue" value={analytics.overdue} tone="text-red-700" />
        <MiniStat label="Pending" value={analytics.not_started + analytics.on_hold} />
      </CardBody>
    </Card>
  );
}

function MiniStat({
  icon,
  label,
  value,
  tone = "text-slate-900",
}: {
  icon?: React.ReactNode;
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-400">
        {icon}
        {label}
      </div>
      <p className={`mt-1 text-2xl font-semibold ${tone}`}>{value}</p>
    </div>
  );
}
