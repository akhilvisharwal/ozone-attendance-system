import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { Check, ChevronDown, Loader2, Search, Users } from "lucide-react";
import clsx from "clsx";
import * as employeesApi from "@/api/employees";
import type { Employee } from "@/types";

const ALL_EMPLOYEES_VALUE = "";

function formatEmployeeLabel(employee: Employee): string {
  return `${employee.name} (${employee.employee_code})`;
}

/**
 * Searchable employee picker backed live by the employee database.
 *
 * - Always fetches ACTIVE employees fresh (no hardcoded/static lists) —
 *   every time the dropdown is opened it re-fetches, so employees that were
 *   just created, edited, activated, or deactivated are reflected immediately.
 * - "All Employees" is always pinned as the first option.
 * - Typing debounces a server-side search (name or employee ID) so this
 *   scales to a large employee roster instead of loading everyone at once.
 */
export function EmployeeCombobox({
  value,
  onChange,
  label,
  hint,
  className,
  triggerClassName,
  hideHint = false,
}: {
  value: string;
  onChange: (employeeId: string) => void;
  label?: string;
  hint?: string;
  className?: string;
  triggerClassName?: string;
  hideHint?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [highlightIndex, setHighlightIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  const fetchEmployees = (search: string) => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    const request = search
      ? employeesApi
          .listEmployees({ search, isActive: true, limit: 100 })
          .then((res) => res.items)
      : employeesApi.listActiveEmployees();

    request
      .then((items) => {
        if (requestId !== requestIdRef.current) return;
        setOptions(items);
      })
      .catch(() => {
        if (requestId !== requestIdRef.current) return;
        setOptions([]);
      })
      .finally(() => {
        if (requestId === requestIdRef.current) setLoading(false);
      });
  };

  // Load active employees as soon as the filter mounts so the picker is ready.
  useEffect(() => {
    fetchEmployees("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the displayed label in sync with the live database. If the parent
  // clears the value (e.g. "Reset" elsewhere) or the currently selected
  // employee isn't in the loaded options yet (e.g. deep-linked id), resolve
  // it directly so the label always reflects current data, not stale state.
  useEffect(() => {
    if (!value) {
      setSelectedEmployee(null);
      return;
    }
    if (selectedEmployee?.id === value) return;

    const matchInOptions = options.find((e) => e.id === value);
    if (matchInOptions) {
      setSelectedEmployee(matchInOptions);
      return;
    }

    employeesApi
      .getEmployeeById(value)
      .then((employee) => setSelectedEmployee(employee))
      .catch(() => {
        // Employee may have been deactivated/removed since being selected — clear it.
        setSelectedEmployee(null);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, options]);

  function openDropdown() {
    setOpen(true);
    setQuery("");
    setHighlightIndex(-1);
    fetchEmployees(""); // always re-fetch fresh from the database on open
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function closeDropdown() {
    setOpen(false);
    setQuery("");
  }

  function handleQueryChange(next: string) {
    setQuery(next);
    setHighlightIndex(-1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchEmployees(next), 250);
  }

  function selectEmployee(employee: Employee | null) {
    setSelectedEmployee(employee);
    onChange(employee?.id ?? ALL_EMPLOYEES_VALUE);
    closeDropdown();
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closeDropdown();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const flatOptions = useMemo(() => [null, ...options] as (Employee | null)[], [options]);

  function handleKeyDown(e: KeyboardEvent) {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        e.preventDefault();
        openDropdown();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((i) => Math.min(i + 1, flatOptions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightIndex >= 0 && highlightIndex < flatOptions.length) {
        selectEmployee(flatOptions[highlightIndex]);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeDropdown();
    }
  }

  return (
    <div ref={containerRef} className={clsx("relative flex flex-col gap-1.5", className)}>
      {label && <label className="text-sm font-medium leading-5 text-slate-700">{label}</label>}

      <button
        type="button"
        onClick={() => (open ? closeDropdown() : openDropdown())}
        onKeyDown={handleKeyDown}
        className={clsx(
          "flex w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-900",
          "min-h-[42px] sm:min-h-[38px]",
          "focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100",
          triggerClassName
        )}
      >
        <span className={clsx("flex items-center gap-1.5 truncate", !selectedEmployee && "text-slate-500")}>
          <Users className="h-4 w-4 flex-shrink-0 text-slate-400" />
          {selectedEmployee ? formatEmployeeLabel(selectedEmployee) : "All Employees"}
        </span>
        <ChevronDown className={clsx("h-4 w-4 flex-shrink-0 text-slate-400 transition-transform", open && "rotate-180")} />
      </button>

      {hint && !hideHint && !open && <span className="text-xs text-slate-400">{hint}</span>}

      {open && (
        <div className="absolute top-full z-20 mt-1 w-full min-w-[280px] rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
            <Search className="h-4 w-4 flex-shrink-0 text-slate-400" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search by name or employee ID..."
              className="w-full text-sm text-slate-900 outline-none placeholder:text-slate-400"
            />
            {loading && <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin text-slate-300" />}
          </div>

          <div className="max-h-64 overflow-y-auto py-1">
            <ComboOption
              highlighted={highlightIndex === 0}
              selected={!selectedEmployee}
              onClick={() => selectEmployee(null)}
            >
              <span className="font-medium">All Employees</span>
            </ComboOption>

            {!loading && options.length === 0 && (
              <p className="px-3 py-3 text-center text-xs text-slate-400">No active employees found</p>
            )}

            {options.map((employee, idx) => (
              <ComboOption
                key={employee.id}
                highlighted={highlightIndex === idx + 1}
                selected={selectedEmployee?.id === employee.id}
                onClick={() => selectEmployee(employee)}
              >
                <span className="truncate">{employee.name}</span>
                <span className="ml-1.5 flex-shrink-0 text-xs text-slate-400">({employee.employee_code})</span>
              </ComboOption>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ComboOption({
  children,
  selected,
  highlighted,
  onClick,
}: {
  children: ReactNode;
  selected: boolean;
  highlighted: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={clsx(
        "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm",
        highlighted ? "bg-brand-50 text-brand-700" : "text-slate-700 hover:bg-slate-50"
      )}
    >
      <span className="flex min-w-0 items-center">{children}</span>
      {selected && <Check className="h-4 w-4 flex-shrink-0 text-brand-600" />}
    </button>
  );
}
