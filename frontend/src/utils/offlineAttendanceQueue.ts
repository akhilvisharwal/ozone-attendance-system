import type { WorkStatus } from "@/types";

const STORAGE_KEY = "ozone.pendingAttendance";

export interface PendingCheckIn {
  type: "check-in";
  createdAt: string;
  siteId: string;
  latitude: number | null;
  longitude: number | null;
  accuracy?: number;
  deviceInfo: string;
  selfieBase64: string | null;
}

export interface PendingCheckOut {
  type: "check-out";
  createdAt: string;
  workSummary?: string;
  workStatus: WorkStatus;
  remarks?: string;
  latitude: number | null;
  longitude: number | null;
  accuracy?: number;
  selfieBase64: string | null;
}

export type PendingAttendance = PendingCheckIn | PendingCheckOut;

function readQueue(): PendingAttendance[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PendingAttendance[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(items: PendingAttendance[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function getPendingAttendance(): PendingAttendance[] {
  return readQueue();
}

export function queuePendingAttendance(item: PendingAttendance): void {
  writeQueue([...readQueue(), item]);
}

export function clearPendingAttendance(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function shiftPendingAttendance(): PendingAttendance | null {
  const queue = readQueue();
  if (queue.length === 0) return null;
  const [next, ...rest] = queue;
  writeQueue(rest);
  return next;
}

export function peekPendingAttendance(): PendingAttendance | null {
  return readQueue()[0] ?? null;
}

export function dequeuePendingAttendance(): void {
  const queue = readQueue();
  if (queue.length === 0) return;
  writeQueue(queue.slice(1));
}

export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read blob"));
    reader.readAsDataURL(blob);
  });
}

export async function base64ToBlob(base64: string): Promise<Blob> {
  const res = await fetch(base64);
  return res.blob();
}
