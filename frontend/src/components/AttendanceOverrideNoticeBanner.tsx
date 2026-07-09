import { Info } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { formatDate } from "@/utils/format";
import type { AttendanceOverrideNotice } from "@/types";

interface AttendanceOverrideNoticeBannerProps {
  override: AttendanceOverrideNotice | null | undefined;
  compact?: boolean;
}

export function AttendanceOverrideNoticeBanner({
  override,
  compact,
}: AttendanceOverrideNoticeBannerProps) {
  if (!override) return null;

  const dateLabel =
    override.startDate === override.endDate
      ? formatDate(override.startDate)
      : `${formatDate(override.startDate)} – ${formatDate(override.endDate)}`;

  return (
    <Alert variant="info">
      <div className="flex items-start gap-2">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <div>
          <p className="font-medium">Special attendance rules are active today</p>
          <p className="mt-0.5 text-slate-600">
            {override.reason}
            {!compact && (
              <>
                {" "}
                · {dateLabel}
              </>
            )}
          </p>
        </div>
      </div>
    </Alert>
  );
}
