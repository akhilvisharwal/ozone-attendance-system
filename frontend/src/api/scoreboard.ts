import { apiClient } from "./client";
import type { ScoreboardEntry } from "@/types";

export async function getScoreboard(params?: { from?: string; to?: string }) {
  const res = await apiClient.get<{
    entries: ScoreboardEntry[];
    period: { from: string; to: string };
    legend: string;
  }>("/scoreboard", { params });
  return res.data;
}
