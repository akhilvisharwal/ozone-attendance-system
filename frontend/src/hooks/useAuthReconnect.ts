import { useEffect, useRef } from "react";
import { refreshAccessToken } from "@/api/client";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

export function useAuthReconnect({
  enabled,
  onRestored,
}: {
  enabled: boolean;
  onRestored: () => void | Promise<void>;
}) {
  const online = useOnlineStatus();
  const wasOfflineRef = useRef(false);
  const onRestoredRef = useRef(onRestored);

  useEffect(() => {
    onRestoredRef.current = onRestored;
  }, [onRestored]);

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
      if (cancelled || !token) return;
      await onRestoredRef.current();
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, online]);
}
