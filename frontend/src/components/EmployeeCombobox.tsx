import { useEffect, useMemo, useRef, useState } from "react";
import { Users } from "lucide-react";
import * as employeesApi from "@/api/employees";
import type { Employee } from "@/types";
import { Combobox, type ComboboxOption } from "@/components/ui/Combobox";
import { EMPLOYEE_CODES_CHANGED_EVENT } from "@/utils/employeeCodeEvents";

const ALL_EMPLOYEES_VALUE = "";

function formatEmployeeLabel(employee: Employee): string {
  return `${employee.name} (${employee.employee_code})`;
}

/**
 * Searchable employee picker backed live by the employee database.
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
  const [options, setOptions] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  const fetchEmployees = (search: string) => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    const request = search
      ? employeesApi.listEmployees({ search, isActive: true, limit: 100 }).then((res) => res.items)
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

  useEffect(() => {
    fetchEmployees("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onCodesChanged() {
      fetchEmployees("");
      setSelectedEmployee(null);
    }
    window.addEventListener(EMPLOYEE_CODES_CHANGED_EVENT, onCodesChanged);
    return () => window.removeEventListener(EMPLOYEE_CODES_CHANGED_EVENT, onCodesChanged);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!value) {
      setSelectedEmployee(null);
      return;
    }
    if (selectedEmployee?.id === value) return;

    const matchInOptions = options.find((employee) => employee.id === value);
    if (matchInOptions) {
      setSelectedEmployee(matchInOptions);
      return;
    }

    employeesApi
      .getEmployeeById(value)
      .then((employee) => setSelectedEmployee(employee))
      .catch(() => setSelectedEmployee(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, options]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const comboboxOptions = useMemo<ComboboxOption[]>(() => {
    const rows: ComboboxOption[] = [{ value: ALL_EMPLOYEES_VALUE, label: "All Employees" }];
    for (const employee of options) {
      rows.push({
        value: employee.id,
        label: employee.name,
        description: [employee.employee_code, employee.designation].filter(Boolean).join(" · "),
      });
    }
    return rows;
  }, [options]);

  function handleSearch(query: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchEmployees(query), 250);
  }

  return (
    <Combobox
      label={label}
      hint={hideHint ? undefined : hint}
      className={className}
      options={comboboxOptions}
      value={value}
      onChange={onChange}
      placeholder="All Employees"
      searchable
      searchPlaceholder="Search by name, ID, or role..."
      emptyMessage="No active employees found"
      loading={loading}
      icon={<Users className="h-4 w-4" />}
      triggerClassName={triggerClassName}
      onOpen={() => fetchEmployees("")}
      onSearch={handleSearch}
      selectedLabel={selectedEmployee ? formatEmployeeLabel(selectedEmployee) : undefined}
    />
  );
}
