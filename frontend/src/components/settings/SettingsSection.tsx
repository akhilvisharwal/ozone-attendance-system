import clsx from "clsx";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";

export function SettingsSection({
  title,
  description,
  children,
  onSave,
  saving,
  saveLabel = "Save changes",
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onSave?: () => void;
  saving?: boolean;
  saveLabel?: string;
}) {
  return (
    <Card>
      <CardHeader title={title} subtitle={description} />
      <CardBody className="flex flex-col gap-4">{children}</CardBody>
      {onSave && (
        <div className="border-t border-slate-100 px-5 py-4">
          <Button onClick={onSave} isLoading={saving}>
            {saveLabel}
          </Button>
        </div>
      )}
    </Card>
  );
}

export function FieldRow({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[minmax(0,220px)_1fr] sm:items-start sm:gap-4">
      <div>
        <p className="text-sm font-medium text-slate-700">{label}</p>
        {hint && <p className="text-xs text-slate-400">{hint}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function ToggleRow({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <FieldRow label={label} hint={hint}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={clsx(
          "relative inline-flex h-6 w-11 flex-shrink-0 rounded-full transition-colors",
          checked ? "bg-brand-600" : "bg-slate-300",
          disabled && "opacity-50"
        )}
      >
        <span
          className={clsx(
            "pointer-events-none inline-block h-5 w-5 translate-y-0.5 rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-5" : "translate-x-0.5"
          )}
        />
      </button>
    </FieldRow>
  );
}
