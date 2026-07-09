import { useEffect, useState } from "react";
import { Modal, ModalFooterActions } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { formatCountdown } from "@/auth/sessionTiming";

export function SessionTimeoutModal({
  open,
  secondsRemaining,
  onStaySignedIn,
  onLogout,
}: {
  open: boolean;
  secondsRemaining: number;
  onStaySignedIn: () => void;
  onLogout: () => void;
}) {
  const [displaySeconds, setDisplaySeconds] = useState(secondsRemaining);

  useEffect(() => {
    setDisplaySeconds(secondsRemaining);
  }, [secondsRemaining, open]);

  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => {
      setDisplaySeconds((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={onStaySignedIn}
      title="Session expiring soon"
      description="Your session will expire due to inactivity."
      widthClassName="max-w-md"
      showCloseButton={false}
      footer={
        <ModalFooterActions>
          <Button variant="secondary" onClick={onLogout}>
            Log out now
          </Button>
          <Button onClick={onStaySignedIn}>Stay signed in</Button>
        </ModalFooterActions>
      }
    >
      <p className="text-sm text-gray-600 dark:text-gray-300">
        Your session will expire in{" "}
        <span className="font-semibold text-gray-900 dark:text-white">
          {formatCountdown(displaySeconds)}
        </span>{" "}
        due to inactivity.
      </p>
    </Modal>
  );
}
