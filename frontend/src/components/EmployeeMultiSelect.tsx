import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { Search, X } from "lucide-react";
import { FieldWrapper } from "@/components/ui/Input";
import { EmployeeAvatar } from "@/components/EmployeeAvatar";
import * as employeesApi from "@/api/employees";
import type { Employee } from "@/types";

interface EmployeeMultiSelectProps {
  label?: string;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  error?: string;
}

export function EmployeeMultiSelect({
  label = "Selected employees",
  selectedIds,
  onChange,
  disabled,
  error,
}: EmployeeMultiSelectProps) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    employeesApi
      .listActiveEmployees()
      .then((items) => {
        if (!cancelled) setEmployees(items);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedEmployees = useMemo(
    () => employees.filter((emp) => selectedIds.includes(emp.id)),
    [employees, selectedIds]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter(
      (emp) =>
        emp.name.toLowerCase().includes(q) ||
        emp.employee_code.toLowerCase().includes(q) ||
        (emp.designation ?? "").toLowerCase().includes(q) ||
        (emp.department ?? "").toLowerCase().includes(q)
    );
  }, [employees, query]);

  function toggle(id: string) {
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  }

  function remove(id: string) {
    onChange(selectedIds.filter((x) => x !== id));
  }

  return (
    <FieldWrapper label={label} error={error}>
      <div className="space-y-3">
        {selectedEmployees.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {selectedEmployees.map((emp) => (
              <span
                key={emp.id}
                className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 py-1 pl-1 pr-2.5 text-xs font-medium text-brand-800 ring-1 ring-brand-100"
              >
                <EmployeeAvatar name={emp.name} photoPath={emp.profile_photo_path} size="xs" />
                {emp.name}
                <button
                  type="button"
                  className="rounded-full p-0.5 hover:bg-brand-100"
                  onClick={() => remove(emp.id)}
                  disabled={disabled}
                  aria-label={`Remove ${emp.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search employees by name or code…"
            disabled={disabled || loading}
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          />
        </div>

        <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white">
          {loading ? (
            <p className="px-3 py-4 text-sm text-slate-500">Loading employees…</p>
          ) : filtered.length === 0 ? (
            <p className="px-3 py-4 text-sm text-slate-500">No employees found.</p>
          ) : (
            filtered.map((emp) => {
              const checked = selectedIds.includes(emp.id);
              return (
                <label
                  key={emp.id}
                  className={clsx(
                    "flex cursor-pointer items-center gap-3 border-b border-slate-100 px-3 py-2.5 text-sm last:border-b-0 hover:bg-slate-50",
                    checked && "bg-brand-50/40"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => toggle(emp.id)}
                    className="h-4 w-4 rounded border-slate-300 text-brand-600"
                  />
                  <EmployeeAvatar name={emp.name} photoPath={emp.profile_photo_path} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-slate-900">{emp.name}</span>
                    <span className="block text-xs text-slate-500">
                      {emp.employee_code}
                      {emp.designation ? ` · ${emp.designation}` : emp.department ? ` · ${emp.department}` : ""}
                    </span>
                  </span>
                </label>
              );
            })
          )}
        </div>
      </div>
    </FieldWrapper>
  );
}
