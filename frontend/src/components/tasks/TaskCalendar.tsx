import clsx from "clsx";
import type { Task } from "@/types";
import { formatDate } from "@/utils/format";

const STATUS_COLORS: Record<Task["status"], string> = {
  not_started: "bg-slate-100 text-slate-700 border-slate-200",
  in_progress: "bg-blue-50 text-blue-800 border-blue-200",
  on_hold: "bg-amber-50 text-amber-800 border-amber-200",
  completed: "bg-emerald-50 text-emerald-800 border-emerald-200",
};

export function TaskCalendar({ tasks, month }: { tasks: Task[]; month: Date }) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstDay = new Date(year, monthIndex, 1);
  const startOffset = firstDay.getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  const cells: Array<{ day: number | null; tasks: Task[] }> = [];
  for (let i = 0; i < startOffset; i++) cells.push({ day: null, tasks: [] });
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const dayTasks = tasks.filter((task) => {
      const start = task.start_date ?? task.attendance_date ?? "";
      const due = task.effective_due_date ?? task.extended_due_date ?? task.due_date ?? start;
      return start <= dateStr && due >= dateStr;
    });
    cells.push({ day, tasks: dayTasks });
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">
          {month.toLocaleString("default", { month: "long", year: "numeric" })}
        </h3>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-slate-400">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="py-2">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell, index) => (
          <div
            key={index}
            className={clsx(
              "min-h-[88px] rounded-lg border p-1.5 text-left",
              cell.day ? "border-slate-200 bg-white" : "border-transparent bg-transparent"
            )}
          >
            {cell.day && (
              <>
                <p className="text-xs font-medium text-slate-500">{cell.day}</p>
                <div className="mt-1 space-y-1">
                  {cell.tasks.slice(0, 2).map((task) => (
                    <div
                      key={task.id}
                      className={clsx(
                        "truncate rounded border px-1 py-0.5 text-[10px] font-medium",
                        STATUS_COLORS[task.status],
                        task.is_overdue && task.status !== "completed" && "ring-1 ring-red-300"
                      )}
                      title={`${task.title} (${formatDate(task.effective_due_date ?? task.due_date ?? "")})`}
                    >
                      {task.title}
                    </div>
                  ))}
                  {cell.tasks.length > 2 && (
                    <p className="text-[10px] text-slate-400">+{cell.tasks.length - 2} more</p>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
