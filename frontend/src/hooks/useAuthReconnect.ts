import { useEffect, useRef } from "react";
import { refreshAccessToken } from "@/api/client";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

export function useAuthReconnect({
  enabled,
  onRestored,
  onSessionInvalid,
}: {
  enabled: boolean;
  onRestored: () => void | Promise<void>;
  onSessionInvalid: () => void | Promise<void>;
}) {
  const online = useOnlineStatus();
  const wasOfflineRef = useRef(false);
  const onRestoredRef = useRef(onRestored);
  const onSessionInvalidRef = useRef(onSessionInvalid);

  useEffect(() => {
    onRestoredRef.current = onRestored;
  }, [onRestored]);

  useEffect(() => {
    onSessionInvalidRef.current = onSessionInvalid;
  }, [onSessionInvalid]);

  useEffect(() => {
    if (!enabled) return;

    if (!online) {
      wasOfflineRef.current = true;
      return;
    }

    if (!wasOfflineRef.current) return;
    wasOfflineRef.current = false;

    let cancelled = false;

    void (async () => {
      const token = await refreshAccessToken();
      if (cancelled) return;
      if (!token) {
        await onSessionInvalidRef.current();
        return;
      }
      await onRestoredRef.current();
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, online]);
}
