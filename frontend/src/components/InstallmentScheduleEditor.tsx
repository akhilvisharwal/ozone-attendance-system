import { Plus, Trash2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

/** Mirrors the backend's splitEqualInstallments rounding rule for a live preview. */
function splitEqual(principal: number, count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor((principal / count) * 100) / 100;
  const amounts = Array.from({ length: count }, () => base);
  amounts[count - 1] = Math.round((principal - base * (count - 1)) * 100) / 100;
  return amounts;
}

function addMonths(dateStr: string, months: number): string {
  const [y, m] = dateStr.split("-").map(Number);
  const total = m - 1 + months;
  const year = y + Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;
  return `${year}-${String(month + 1).padStart(2, "0")}-01`;
}

function formatMonthLabel(dateStr: string): string {
  const [y, m] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}

/**
 * Free-edit installment schedule: any number of rows, each with an independently
 * editable amount. "Split evenly" is a convenience that recomputes all rows at once —
 * it doesn't restrict what the admin can do afterwards.
 */
export function InstallmentScheduleEditor({
  amounts,
  startDate,
  principal,
  onChange,
}: {
  amounts: number[];
  startDate: string;
  /** Target total — used only for the running-total comparison, not enforced here. */
  principal: number;
  onChange: (amounts: number[]) => void;
}) {
  const total = Math.round(amounts.reduce((s, a) => s + a, 0) * 100) / 100;
  const targetPrincipal = Math.round(principal * 100) / 100;
  const matches = total === targetPrincipal;

  function updateAt(index: number, value: number) {
    const next = [...amounts];
    next[index] = value;
    onChange(next);
  }

  function removeAt(index: number) {
    onChange(amounts.filter((_, i) => i !== index));
  }

  function addRow() {
    onChange([...amounts, 0]);
  }

  function splitEvenly() {
    const count = Math.max(1, amounts.length);
    onChange(splitEqual(principal, count));
  }

  return (
    <div className="space-y-2">
      <div className="max-h-64 space-y-1.5 overflow-y-auto rounded-md border border-slate-200 p-2">
        {amounts.length === 0 ? (
          <p className="py-3 text-center text-sm text-slate-500">No installments yet.</p>
        ) : (
          amounts.map((amount, index) => (
            <div key={index} className="flex items-center gap-2">
              <span className="w-12 flex-shrink-0 text-xs font-medium text-slate-500">
                #{index + 1}
              </span>
              <span className="w-20 flex-shrink-0 text-xs text-slate-500">
                {formatMonthLabel(addMonths(startDate, index))}
              </span>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={amount || ""}
                onChange={(e) => updateAt(index, Number(e.target.value) || 0)}
                className="flex-1"
              />
              <button
                type="button"
                onClick={() => removeAt(index)}
                title="Remove installment"
                className="flex-shrink-0 rounded-lg p-1.5 text-red-500 hover:bg-red-50 hover:text-red-700"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={addRow} icon={<Plus className="h-3.5 w-3.5" />}>
            Add Installment
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={splitEvenly}
            icon={<Wand2 className="h-3.5 w-3.5" />}
          >
            Split Evenly
          </Button>
        </div>
        <p className={`text-sm font-medium ${matches ? "text-emerald-600" : "text-rose-600"}`}>
          Total: {total.toFixed(2)} / {targetPrincipal.toFixed(2)}
          {!matches && " — must match"}
        </p>
      </div>
    </div>
  );
}
