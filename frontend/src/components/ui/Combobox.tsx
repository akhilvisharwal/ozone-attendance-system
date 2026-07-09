import {
  Children,
  isValidElement,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { Check, ChevronDown, Loader2, Search } from "lucide-react";
import clsx from "clsx";
import { FieldWrapper } from "./Input";

export interface ComboboxOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

export interface ComboboxProps {
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  className?: string;
  triggerClassName?: string;
  options: ComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyMessage?: string;
  loading?: boolean;
  icon?: ReactNode;
  id?: string;
  name?: string;
  /** Override the trigger label (useful for async option lists). */
  selectedLabel?: string;
  /** Accessible name when the combobox has no visible label. */
  triggerAriaLabel?: string;
  /** Called when the dropdown opens. */
  onOpen?: () => void;
  /** When set, search is delegated to the parent instead of local filtering. */
  onSearch?: (query: string) => void;
}

const SEARCH_THRESHOLD = 5;

export function Combobox({
  label,
  error,
  hint,
  required,
  className,
  triggerClassName,
  options,
  value,
  onChange,
  placeholder = "Select an option",
  disabled = false,
  searchable,
  searchPlaceholder = "Search...",
  emptyMessage = "No options found",
  loading = false,
  icon,
  id,
  name,
  selectedLabel,
  triggerAriaLabel,
  onOpen,
  onSearch,
}: ComboboxProps) {
  const autoId = useId();
  const listboxId = id ?? autoId;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = options.find((option) => option.value === value) ?? null;
  const showSearch = searchable ?? options.length >= SEARCH_THRESHOLD;

  const filteredOptions = useMemo(() => {
    if (onSearch || !showSearch || !query.trim()) return options;
    const q = query.trim().toLowerCase();
    return options.filter(
      (option) =>
        option.label.toLowerCase().includes(q) ||
        option.value.toLowerCase().includes(q) ||
        option.description?.toLowerCase().includes(q)
    );
  }, [options, query, showSearch, onSearch]);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  useEffect(() => {
    if (!open || highlightIndex < 0 || !listRef.current) return;
    const item = listRef.current.querySelector<HTMLElement>(`[data-index="${highlightIndex}"]`);
    item?.scrollIntoView({ block: "nearest" });
  }, [highlightIndex, open]);

  function openDropdown() {
    if (disabled) return;
    setOpen(true);
    setQuery("");
    setHighlightIndex(-1);
    onOpen?.();
    if (showSearch) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  function closeDropdown() {
    setOpen(false);
    setQuery("");
    setHighlightIndex(-1);
  }

  function selectOption(option: ComboboxOption) {
    if (option.disabled) return;
    onChange(option.value);
    closeDropdown();
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (disabled) return;

    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openDropdown();
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((index) => {
        const next = index + 1;
        if (next >= filteredOptions.length) return index;
        while (next < filteredOptions.length && filteredOptions[next]?.disabled) {
          return next + 1 < filteredOptions.length ? next + 1 : index;
        }
        return next;
      });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((index) => Math.max(index - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightIndex >= 0 && highlightIndex < filteredOptions.length) {
        selectOption(filteredOptions[highlightIndex]);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeDropdown();
    }
  }

  const triggerLabel = selectedLabel ?? selected?.label ?? placeholder;
  const hasValue = Boolean(selected || selectedLabel);

  return (
    <FieldWrapper label={label} error={error} hint={hint} required={required}>
      <div ref={containerRef} className={clsx("relative", className)}>
        {name && required && (
          <input
            tabIndex={-1}
            aria-hidden
            name={name}
            value={value}
            required
            onChange={() => undefined}
            className="pointer-events-none absolute h-0 w-0 opacity-0"
          />
        )}

        <button
          type="button"
          id={listboxId}
          aria-label={triggerAriaLabel}
          aria-haspopup="listbox"
          aria-expanded={open}
          disabled={disabled}
          onClick={() => (open ? closeDropdown() : openDropdown())}
          onKeyDown={handleKeyDown}
          className={clsx(
            "flex w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-900",
            "min-h-[42px] transition-colors sm:min-h-[38px]",
            "focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100",
            disabled && "cursor-not-allowed bg-slate-50 text-slate-400",
            error && "border-red-400 focus:border-red-500 focus:ring-red-100",
            triggerClassName
          )}
        >
          <span className={clsx("flex min-w-0 items-center gap-1.5 truncate", !hasValue && "text-slate-500")}>
            {icon && <span className="flex-shrink-0 text-slate-400">{icon}</span>}
            <span className="truncate">{triggerLabel}</span>
          </span>
          <ChevronDown
            className={clsx(
              "h-4 w-4 flex-shrink-0 text-slate-400 transition-transform duration-200",
              open && "rotate-180"
            )}
          />
        </button>

        {open && (
          <div
            className={clsx(
              "absolute top-full z-30 mt-1 w-full min-w-[240px] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg",
              "combobox-panel-open"
            )}
          >
            {showSearch && (
              <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
                <Search className="h-4 w-4 flex-shrink-0 text-slate-400" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => {
                    const next = e.target.value;
                    setQuery(next);
                    setHighlightIndex(-1);
                    onSearch?.(next);
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder={searchPlaceholder}
                  className="w-full text-sm text-slate-900 outline-none placeholder:text-slate-400"
                />
                {loading && <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin text-slate-300" />}
              </div>
            )}

            <div ref={listRef} role="listbox" className="max-h-64 overflow-y-auto py-1">
              {!loading && filteredOptions.length === 0 && (
                <p className="px-3 py-3 text-center text-xs text-slate-400">{emptyMessage}</p>
              )}

              {filteredOptions.map((option, index) => (
                <ComboboxOptionRow
                  key={`${option.value}-${index}`}
                  index={index}
                  option={option}
                  selected={option.value === value}
                  highlighted={highlightIndex === index}
                  onSelect={() => selectOption(option)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </FieldWrapper>
  );
}

function ComboboxOptionRow({
  option,
  selected,
  highlighted,
  index,
  onSelect,
}: {
  option: ComboboxOption;
  selected: boolean;
  highlighted: boolean;
  index: number;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      data-index={index}
      role="option"
      aria-selected={selected}
      disabled={option.disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onSelect}
      className={clsx(
        "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors",
        option.disabled && "cursor-not-allowed text-slate-300",
        !option.disabled && highlighted && "bg-brand-50 text-brand-700",
        !option.disabled && !highlighted && "text-slate-700 hover:bg-slate-50"
      )}
    >
      <span className="flex min-w-0 flex-col">
        <span className="truncate">{option.label}</span>
        {option.description && (
          <span className="truncate text-xs text-slate-400">{option.description}</span>
        )}
      </span>
      {selected && !option.disabled && <Check className="h-4 w-4 flex-shrink-0 text-brand-600" />}
    </button>
  );
}

/** Converts legacy `<option>` children into combobox options. */
export function optionsFromSelectChildren(children: ReactNode): ComboboxOption[] {
  const options: ComboboxOption[] = [];

  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const element = child as ReactElement<{ value?: string | number; disabled?: boolean; children?: ReactNode }>;
    if (element.type !== "option") return;

    const rawValue = element.props.value;
    const value = rawValue === undefined || rawValue === null ? "" : String(rawValue);
    const label = flattenOptionLabel(element.props.children) || value;

    options.push({
      value,
      label,
      disabled: element.props.disabled,
    });
  });

  return options;
}

function flattenOptionLabel(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(flattenOptionLabel).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) {
    return flattenOptionLabel(node.props.children);
  }
  return "";
}
