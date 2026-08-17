import { useCallback, useEffect, useState } from "react";
import { Plus, Wallet } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { ContentSkeleton, EmptyState } from "@/components/ui/Spinner";
import { ResponsiveTable, FilterBar, type Column } from "@/components/ui/ResponsiveTable";
import { EmployeeCombobox } from "@/components/EmployeeCombobox";
import { NewAdvancePlanModal } from "@/components/NewAdvancePlanModal";
import { EmployeeAdvanceDetailModal } from "@/components/EmployeeAdvanceDetailModal";
import * as advancePlansApi from "@/api/advancePlans";
import type { EmployeeAdvanceSummary } from "@/api/advancePlans";
import { extractErrorMessage } from "@/api/client";

function formatAmount(value: number): string {
  return value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDueDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const [y, m] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}

export function AdvancesPage() {
  const [summaries, setSummaries] = useState<EmployeeAdvanceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [jumpToEmployeeId, setJumpToEmployeeId] = useState("");
  const [newPlanOpen, setNewPlanOpen] = useState(false);
  const [newPlanEmployeeId, setNewPlanEmployeeId] = useState<string | undefined>(undefined);
  const [detailTarget, setDetailTarget] = useState<{ id: string; name: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await advancePlansApi.listSummaries();
      setSummaries(data);
    } catch (err) {
      setError(extractErrorMessage(err, "Could not load advances."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: Column<EmployeeAdvanceSummary>[] = [
    {
      header: "Employee",
      primary: true,
      cell: (row) => (
        <div>
          <p className="font-medium text-slate-900">{row.employeeName}</p>
          <p className="text-xs text-slate-400">
            {row.employeeCode}
            {row.designation ? ` · ${row.designation}` : ""}
          </p>
        </div>
      ),
    },
    {
      header: "Active Plans",
      align: "center",
      cell: (row) => row.activePlanCount,
    },
    {
      header: "Principal",
      align: "right",
      cell: (row) => <span className="tabular-nums">{formatAmount(row.totalPrincipal)}</span>,
    },
    {
      header: "Paid So Far",
      align: "right",
      cell: (row) => <span className="tabular-nums text-emerald-600">{formatAmount(row.totalPaid)}</span>,
    },
    {
      header: "Remaining Balance",
      align: "right",
      cell: (row) => (
        <span className="tabular-nums font-semibold text-amber-700">{formatAmount(row.remainingBalance)}</span>
      ),
    },
    {
      header: "Next Due",
      align: "right",
      cell: (row) => (
        <div>
          <p className="tabular-nums text-slate-700">{formatDueDate(row.nextDueDate)}</p>
          {row.nextDueAmount != null && (
            <p className="text-xs text-slate-400">{formatAmount(row.nextDueAmount)}</p>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="min-w-0 space-y-6">
      <PageHeader
        title="Employee Advances"
        description="Record advances taken by employees and track their repayment plans."
        icon={<Wallet className="h-5 w-5" />}
        action={
          <Button
            onClick={() => {
              setNewPlanEmployeeId(undefined);
              setNewPlanOpen(true);
            }}
            icon={<Plus className="h-4 w-4" />}
          >
            New Advance
          </Button>
        }
      />

      <Card>
        <FilterBar>
          <div className="w-full sm:w-72">
            <EmployeeCombobox
              label="Jump to employee"
              hint="View or start an advance for any employee, even without an active plan."
              value={jumpToEmployeeId}
              onChange={(id) => {
                setJumpToEmployeeId(id);
                if (id) {
                  const match = summaries.find((s) => s.employeeId === id);
                  setDetailTarget({ id, name: match?.employeeName ?? "" });
                }
              }}
            />
          </div>
        </FilterBar>
      </Card>

      <Card>
        {error && (
          <div className="p-4">
            <Alert variant="error">{error}</Alert>
          </div>
        )}
        {loading ? (
          <div className="p-6">
            <ContentSkeleton />
          </div>
        ) : summaries.length === 0 ? (
          <EmptyState
            title="No active advances"
            description="Employees with an active repayment plan will appear here."
          />
        ) : (
          <ResponsiveTable
            columns={columns}
            data={summaries}
            rowKey={(row) => row.employeeId}
            onRowClick={(row) => setDetailTarget({ id: row.employeeId, name: row.employeeName })}
          />
        )}
      </Card>

      <NewAdvancePlanModal
        open={newPlanOpen}
        onClose={() => setNewPlanOpen(false)}
        initialEmployeeId={newPlanEmployeeId}
        onCreated={load}
      />

      <EmployeeAdvanceDetailModal
        open={Boolean(detailTarget)}
        onClose={() => {
          setDetailTarget(null);
          setJumpToEmployeeId("");
        }}
        employeeId={detailTarget?.id ?? null}
        employeeName={detailTarget?.name}
        onChanged={load}
      />
    </div>
  );
}
