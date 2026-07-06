import { apiClient } from "./client";
import type { ScoreboardEntry } from "@/types";

export async function getScoreboard(params?: { from?: string; to?: string }) {
  const res = await apiClient.get<{ entries: ScoreboardEntry[]; period: { from: string; to: string } }>(
    "/scoreboard",
    { params }
  );
  return res.data;
}

export async function getMyScore(params?: { from?: string; to?: string }) {
  const res = await apiClient.get<{ entry: ScoreboardEntry | null; period: { from: string; to: string } }>(
    "/scoreboard/me",
    { params }
  );
  return res.data;
}
