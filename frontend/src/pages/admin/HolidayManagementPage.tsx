import { useEffect, useState } from "react";
import { CalendarHeart, Pencil, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Spinner, EmptyState } from "@/components/ui/Spinner";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Alert } from "@/components/ui/Alert";
import { ResponsiveTable, type Column } from "@/components/ui/ResponsiveTable";
import { HolidayFormModal } from "@/components/HolidayFormModal";
import * as holidaysApi from "@/api/holidays";
import type { CompanyHoliday } from "@/api/holidays";
import { extractErrorMessage } from "@/api/client";

function scheduleLabel(h: CompanyHoliday): string {
  if (h.holiday_type === "recurring" && h.recurring_month && h.recurring_day) {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${h.recurring_day} ${months[h.recurring_month - 1]} (every year)`;
  }
  return h.holiday_date ?? "-";
}

export function HolidayManagementPage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [items, setItems] = useState<CompanyHoliday[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<CompanyHoliday | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CompanyHoliday | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    holidaysApi
      .listHolidays({ year })
      .then((res) => setItems(res.items))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  const columns: Column<CompanyHoliday>[] = [
    {
      header: "Holiday",
      primary: true,
      cell: (h) => (
        <div>
          <p className="font-medium text-slate-900">{h.name}</p>
          {h.description && <p className="text-xs text-slate-400">{h.description}</p>}
        </div>
      ),
    },
    {
      header: "Schedule",
      cell: (h) => scheduleLabel(h),
    },
    {
      header: "Type",
      cell: (h) => (
        <Badge tone={h.holiday_type === "recurring" ? "blue" : "slate"}>
          {h.holiday_type === "recurring" ? "Annual" : "One-time"}
        </Badge>
      ),
    },
  ];

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleteError(null);
    setDeleting(true);
    try {
      await holidaysApi.deleteHoliday(deleteTarget.id);
      setItems((prev) => prev.filter((h) => h.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      setDeleteError(extractErrorMessage(err, "Could not delete holiday"));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Holiday Management"
        subtitle="Configure company holidays — employees are not marked absent on these days"
        icon={<CalendarHeart className="h-5 w-5" />}
        action={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>
            Add Holiday
          </Button>
        }
      />

      <Card className="mb-4 p-4">
        <Select label="Year" value={year} onChange={(e) => setYear(Number(e.target.value))} className="sm:w-40">
          {[currentYear - 1, currentYear, currentYear + 1, currentYear + 2].map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </Select>
      </Card>

      <Card>
        {loading ? (
          <Spinner />
        ) : items.length === 0 ? (
          <EmptyState title="No holidays configured" description="Add one-time or recurring annual holidays" />
        ) : (
          <ResponsiveTable
            columns={columns}
            data={items}
            rowKey={(h) => h.id}
            actions={(h) => (
              <div className="flex justify-end gap-1">
                <Button size="sm" variant="ghost" onClick={() => setEditTarget(h)} title="Edit">
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-600 hover:bg-red-50"
                  onClick={() => setDeleteTarget(h)}
                  title="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )}
          />
        )}
      </Card>

      <HolidayFormModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={load}
      />

      {editTarget && (
        <HolidayFormModal
          open
          editTarget={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => { load(); setEditTarget(null); }}
        />
      )}

      {deleteTarget && (
        <Modal open onClose={() => setDeleteTarget(null)} title="Delete Holiday">
          <div className="flex flex-col gap-4">
            {deleteError && <Alert variant="error">{deleteError}</Alert>}
            <Alert variant="error">
              Delete <strong>{deleteTarget.name}</strong>? This will remove the holiday from all calendars and reports.
            </Alert>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
              <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancel</Button>
              <Button isLoading={deleting} className="bg-red-600 hover:bg-red-700 text-white" onClick={confirmDelete}>
                Delete
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
