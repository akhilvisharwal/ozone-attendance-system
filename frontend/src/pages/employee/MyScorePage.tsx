import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { CheckCircle2, Clock, Star } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import * as scoreboardApi from "@/api/scoreboard";
import type { ScoreboardEntry } from "@/types";

export function MyScorePage() {
  const [scoreData, setScoreData] = useState<{ entry: ScoreboardEntry | null; period: { from: string; to: string } } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    scoreboardApi.getMyScore()
      .then(setScoreData)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <PageHeader title="My Score" subtitle="Your performance this month" />

      {loading ? (
        <Spinner />
      ) : (
        <div className="flex flex-col gap-6">
          {scoreData?.entry ? (
            <Card>
              <CardHeader
                title="This Month's Score"
                subtitle={`${scoreData.period.from} → ${scoreData.period.to}`}
              />
              <CardBody>
                <div className="mb-4 flex items-center gap-4">
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-50 text-4xl font-black text-brand-700">
                    {scoreData.entry.score}
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Total Score</p>
                    <p className="text-xs text-slate-400">+5 per day present · +3 for ≥8h · +2 per task</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <ScoreStat icon={<Clock className="h-4 w-4" />} label="Days Present" value={scoreData.entry.total_days_present} />
                  <ScoreStat icon={<Clock className="h-4 w-4" />} label="Full 8h Days" value={scoreData.entry.total_days_8h} />
                  <ScoreStat icon={<CheckCircle2 className="h-4 w-4" />} label="Tasks Done" value={`${scoreData.entry.completed_tasks} / ${scoreData.entry.total_tasks}`} />
                  <ScoreStat icon={<Star className="h-4 w-4" />} label="Score" value={scoreData.entry.score} highlight />
                </div>
              </CardBody>
            </Card>
          ) : (
            <Card>
              <CardBody>
                <p className="text-sm text-slate-500">No attendance data yet for this month.</p>
              </CardBody>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function ScoreStat({ icon, label, value, highlight }: { icon: ReactNode; label: string; value: number | string; highlight?: boolean }) {
  return (
    <div className={`flex flex-col gap-1 rounded-lg p-3 ${highlight ? "bg-brand-50" : "bg-slate-50"}`}>
      <span className={`flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide ${highlight ? "text-brand-500" : "text-slate-400"}`}>
        {icon}{label}
      </span>
      <span className={`text-xl font-bold ${highlight ? "text-brand-700" : "text-slate-900"}`}>{value}</span>
    </div>
  );
}
