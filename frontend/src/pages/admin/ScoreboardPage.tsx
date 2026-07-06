import { useEffect, useState } from "react";
import { Medal, Star, Trophy } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Spinner, EmptyState } from "@/components/ui/Spinner";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { SecureImage } from "@/components/SecureImage";
import { ResponsiveTable, FilterBar, type Column } from "@/components/ui/ResponsiveTable";
import * as scoreboardApi from "@/api/scoreboard";
import type { ScoreboardEntry } from "@/types";
import { User } from "lucide-react";

const RANK_ICONS = [
  <Trophy className="h-5 w-5 text-yellow-500" />,
  <Medal className="h-5 w-5 text-slate-400" />,
  <Medal className="h-5 w-5 text-amber-700" />,
];

type RankedEntry = ScoreboardEntry & { rank: number };

export function ScoreboardPage() {
  const [entries, setEntries] = useState<ScoreboardEntry[]>([]);
  const [period, setPeriod] = useState<{ from: string; to: string } | null>(null);
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
          <div className="h-8 w-8 flex-shrink-0 overflow-hidden rounded-full bg-slate-100">
            {entry.profile_photo_path ? (
              <SecureImage path={entry.profile_photo_path} alt={entry.name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-slate-400">
                <User className="h-4 w-4" />
              </div>
            )}
          </div>
          <div>
            <p className="font-medium text-slate-900">{entry.name}</p>
            <p className="text-xs text-slate-400">
              {entry.employee_code} · Rank #{entry.rank}
            </p>
          </div>
        </div>
      ),
    },
    { header: "Days Present", align: "center", cell: (entry) => entry.total_days_present },
    { header: "Full 8h Days", align: "center", cell: (entry) => entry.total_days_8h },
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
        subtitle="Rankings based on attendance, working hours, and task completion"
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
          <Spinner />
        ) : entries.length === 0 ? (
          <EmptyState title="No employee data available yet" />
        ) : (
          <>
            {/* Top 3 podium */}
            {entries.length >= 1 && (
              <div className="flex flex-wrap justify-center gap-4 border-b border-slate-100 px-5 py-6">
                {entries.slice(0, 3).map((entry, idx) => (
                  <PodiumCard key={entry.employee_id} entry={entry} rank={idx + 1} />
                ))}
              </div>
            )}

            {/* Full ranking table */}
            <ResponsiveTable columns={rankColumns} data={rankedEntries} rowKey={(e) => e.employee_id} />

            <div className="border-t border-slate-100 px-4 py-3 text-xs text-slate-400 lg:px-5">
              Scoring: +5 per day present · +3 for ≥8h workday · +2 per completed task · −1 per absent day
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

function PodiumCard({ entry, rank }: { entry: ScoreboardEntry; rank: number }) {
  const sizes: Record<number, string> = { 1: "w-36", 2: "w-28", 3: "w-28" };
  const avatarSizes: Record<number, string> = { 1: "h-16 w-16", 2: "h-12 w-12", 3: "h-12 w-12" };

  return (
    <div className={`flex flex-col items-center text-center ${sizes[rank] ?? "w-28"}`}>
      <div className={`overflow-hidden rounded-full bg-slate-100 ${avatarSizes[rank]}`}>
        {entry.profile_photo_path ? (
          <SecureImage path={entry.profile_photo_path} alt={entry.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-slate-400">
            <User className={rank === 1 ? "h-7 w-7" : "h-5 w-5"} />
          </div>
        )}
      </div>
      <div className="mt-1">{RANK_ICONS[rank - 1]}</div>
      <p className="mt-1 text-xs font-semibold text-slate-900">{entry.name}</p>
      <p className="text-xs text-slate-400">{entry.employee_code}</p>
      <span className="mt-1 inline-flex items-center rounded-full bg-brand-100 px-2 py-0.5 text-xs font-bold text-brand-700">
        {entry.score} pts
      </span>
    </div>
  );
}
