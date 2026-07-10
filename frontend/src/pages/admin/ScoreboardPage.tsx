import { useEffect, useState } from "react";
import { Medal, Star, Trophy } from "lucide-react";
import { motion } from "motion/react";
import { staggerContainer, staggerItem } from "@/lib/motion";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { ContentSkeleton, EmptyState } from "@/components/ui/Spinner";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { EmployeeAvatar } from "@/components/EmployeeAvatar";
import { ResponsiveTable, FilterBar, type Column } from "@/components/ui/ResponsiveTable";
import * as scoreboardApi from "@/api/scoreboard";
import type { ScoreboardEntry } from "@/types";

const RANK_ICONS = [
  <Trophy key="rank-1" className="h-5 w-5 text-yellow-500" />,
  <Medal key="rank-2" className="h-5 w-5 text-slate-400" />,
  <Medal key="rank-3" className="h-5 w-5 text-amber-700" />,
];

type RankedEntry = ScoreboardEntry & { rank: number };

export function ScoreboardPage() {
  const [entries, setEntries] = useState<ScoreboardEntry[]>([]);
  const [period, setPeriod] = useState<{ from: string; to: string } | null>(null);
  const [legend, setLegend] = useState("");
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  function load() {
    setLoading(true);
    scoreboardApi
      .getScoreboard(from && to ? { from, to } : undefined)
      .then((res) => {
        setEntries(res.entries);
        setPeriod(res.period);
        setLegend(res.legend);
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  const rankedEntries: RankedEntry[] = entries.map((e, i) => ({ ...e, rank: i + 1 }));

  const rankColumns: Column<RankedEntry>[] = [
    {
      header: "Rank",
      mobileHidden: true,
      cell: (entry) => (
        <div className="flex items-center gap-1.5 font-bold text-slate-500">
          {entry.rank <= 3 ? RANK_ICONS[entry.rank - 1] : <Star className="h-4 w-4 text-slate-200" />}#{entry.rank}
        </div>
      ),
    },
    {
      header: "Employee",
      primary: true,
      cell: (entry) => (
        <div className="flex items-center gap-3">
          <EmployeeAvatar name={entry.name} photoPath={entry.profile_photo_path} size="sm" />
          <div>
            <p className="font-medium text-slate-900">{entry.name}</p>
            <p className="text-xs text-slate-400">
              {entry.employee_code} · Rank #{entry.rank}
              {entry.designation ? ` · ${entry.designation}` : ""}
            </p>
          </div>
        </div>
      ),
    },
    { header: "Present", align: "center", cell: (entry) => entry.total_days_present },
    { header: "Half Day", align: "center", cell: (entry) => entry.half_days },
    { header: "Absent", align: "center", cell: (entry) => entry.absent_days },
    { header: "Late", align: "center", cell: (entry) => entry.late_arrivals },
    { header: "Leave", align: "center", cell: (entry) => entry.leave_days },
    {
      header: "Tasks Done",
      align: "center",
      cell: (entry) => `${entry.completed_tasks} / ${entry.total_tasks}`,
    },
    {
      header: "Score",
      align: "center",
      cell: (entry) => (
        <span className="inline-flex items-center justify-center rounded-full bg-brand-100 px-3 py-0.5 text-sm font-bold text-brand-700">
          {entry.score}
        </span>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Employee Scoreboard"
        subtitle="Rankings based on attendance, leave, and task completion"
      />

      <Card className="mb-4">
        <FilterBar>
          <Input label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          <Button variant="outline" onClick={load} className="sm:self-end">Apply</Button>
          <Button variant="ghost" onClick={() => { setFrom(""); setTo(""); }} className="sm:self-end">Reset</Button>
        </FilterBar>
        {period && (
          <p className="px-4 pb-3 text-xs text-slate-400">
            Showing: {period.from} → {period.to}
          </p>
        )}
      </Card>

      <Card>
        {loading ? (
          <ContentSkeleton />
        ) : entries.length === 0 ? (
          <EmptyState title="No employee data available yet" />
        ) : (
          <>
            {entries.length >= 1 && (
              <motion.div
                variants={staggerContainer}
                initial="initial"
                animate="animate"
                className="flex flex-wrap justify-center gap-4 border-b border-slate-100 px-5 py-6"
              >
                {entries.slice(0, 3).map((entry, idx) => (
                  <PodiumCard key={entry.employee_id} entry={entry} rank={idx + 1} />
                ))}
              </motion.div>
            )}

            <ResponsiveTable columns={rankColumns} data={rankedEntries} rowKey={(e) => e.employee_id} />

            {legend && (
              <div className="border-t border-slate-100 px-4 py-3 text-xs text-slate-400 lg:px-5">
                Scoring: {legend}
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

function PodiumCard({ entry, rank }: { entry: ScoreboardEntry; rank: number }) {
  const sizes: Record<number, string> = { 1: "w-36", 2: "w-28", 3: "w-28" };

  return (
    <motion.div variants={staggerItem} className={`flex flex-col items-center text-center ${sizes[rank] ?? "w-28"}`}>
      <EmployeeAvatar
        name={entry.name}
        photoPath={entry.profile_photo_path}
        size={rank === 1 ? "xl" : "lg"}
      />
      <div className="mt-1">{RANK_ICONS[rank - 1]}</div>
      <p className="mt-1 text-xs font-semibold text-slate-900">{entry.name}</p>
      <p className="text-xs text-slate-400">{entry.employee_code}</p>
      {entry.designation && <p className="text-[10px] text-slate-500">{entry.designation}</p>}
      <span className="mt-1 inline-flex items-center rounded-full bg-brand-100 px-2 py-0.5 text-xs font-bold text-brand-700">
        {entry.score} pts
      </span>
    </motion.div>
  );
}
