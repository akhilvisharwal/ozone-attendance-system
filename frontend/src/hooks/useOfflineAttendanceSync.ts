import { useCallback, useEffect, useRef } from "react";
import * as attendanceApi from "@/api/attendance";
import {
  base64ToBlob,
  dequeuePendingAttendance,
  getPendingAttendance,
  peekPendingAttendance,
} from "@/utils/offlineAttendanceQueue";

export function useOfflineAttendanceSync(onSynced: () => void) {
  const syncingRef = useRef(false);

  const syncQueue = useCallback(async () => {
    if (syncingRef.current || !navigator.onLine) return;
    if (getPendingAttendance().length === 0) return;

    syncingRef.current = true;
    try {
      while (peekPendingAttendance()) {
        const item = peekPendingAttendance()!;
        if (item.type === "check-in") {
          await attendanceApi.checkIn({
            siteId: item.siteId,
            latitude: item.latitude,
            longitude: item.longitude,
            accuracy: item.accuracy,
            deviceInfo: item.deviceInfo,
            selfie: item.selfieBase64 ? await base64ToBlob(item.selfieBase64) : null,
          });
        } else {
          await attendanceApi.checkOut({
            workSummary: item.workSummary,
            workStatus: item.workStatus,
            remarks: item.remarks,
            latitude: item.latitude,
            longitude: item.longitude,
            accuracy: item.accuracy,
            selfie: item.selfieBase64 ? await base64ToBlob(item.selfieBase64) : null,
            deviceInfo: navigator.userAgent,
          });
        }
        dequeuePendingAttendance();
        onSynced();
      }
    } catch (err) {
      console.error("[offlineAttendanceSync] failed:", err);
    } finally {
      syncingRef.current = false;
    }
  }, [onSynced]);

  useEffect(() => {
    void syncQueue();
    function handleOnline() {
      void syncQueue();
    }
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [syncQueue]);
}
