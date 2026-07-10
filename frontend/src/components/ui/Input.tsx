import type {
  ChangeEvent,
  InputHTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { useMemo } from "react";
import clsx from "clsx";
import { Combobox, optionsFromSelectChildren } from "./Combobox";
import { DatePicker } from "./DatePicker";
import { MonthPicker } from "./MonthPicker";

interface FieldWrapperProps {
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
  labelProps?: LabelHTMLAttributes<HTMLLabelElement>;
}

export function FieldWrapper({ label, error, hint, required, children, labelProps }: FieldWrapperProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-sm font-medium text-slate-700" {...labelProps}>
          {label}
          {required && <span className="text-red-500"> *</span>}
        </label>
      )}
      {children}
      {hint && !error && <span className="text-xs text-slate-400">{hint}</span>}
      {error && <span className="text-xs font-medium text-red-600">{error}</span>}
    </div>
  );
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export function Input({ label, error, hint, required, className, type, value, onChange, ...props }: InputProps) {
  if (type === "date") {
    return (
      <DatePicker
        label={label}
        error={error}
        hint={hint}
        required={required}
        className={className}
        value={value === undefined || value === null ? "" : String(value)}
        onChange={(nextValue) => {
          if (onChange) {
            onChange({ target: { value: nextValue } } as ChangeEvent<HTMLInputElement>);
          }
        }}
        min={props.min !== undefined ? String(props.min) : undefined}
        max={props.max !== undefined ? String(props.max) : undefined}
        disabled={props.disabled}
        id={props.id}
        name={props.name}
        placeholder={props.placeholder}
      />
    );
  }

  if (type === "month") {
    return (
      <MonthPicker
        label={label}
        error={error}
        hint={hint}
        required={required}
        className={className}
        value={value === undefined || value === null ? "" : String(value)}
        onChange={(nextValue) => {
          if (onChange) {
            onChange({ target: { value: nextValue } } as ChangeEvent<HTMLInputElement>);
          }
        }}
        disabled={props.disabled}
        id={props.id}
        name={props.name}
        placeholder={props.placeholder}
      />
    );
  }

  return (
    <FieldWrapper label={label} error={error} hint={hint} required={required}>
      <input
        className={clsx(
          "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 shadow-soft-xs placeholder:text-slate-400 transition-shadow sm:py-2 sm:text-sm",
          "focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100",
          error && "border-red-400 focus:border-red-500 focus:ring-red-100",
          className
        )}
        required={required}
        type={type}
        value={value}
        onChange={onChange}
        {...props}
      />
    </FieldWrapper>
  );
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}

export function Select({
  label,
  error,
  hint,
  required,
  className,
  children,
  value,
  onChange,
  disabled,
  id,
  name,
}: SelectProps) {
  const options = useMemo(() => optionsFromSelectChildren(children), [children]);
  const stringValue = value === undefined || value === null ? "" : String(value);

  return (
    <Combobox
      label={label}
      error={error}
      hint={hint}
      required={required}
      className={className}
      options={options}
      value={stringValue}
      disabled={disabled}
      id={id}
      name={name}
      onChange={(nextValue) => {
        if (onChange) {
          onChange({ target: { value: nextValue } } as ChangeEvent<HTMLSelectElement>);
        }
      }}
    />
  );
}

export { Combobox, type ComboboxOption } from "./Combobox";
export { DatePicker } from "./DatePicker";
export { MonthPicker } from "./MonthPicker";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export function Textarea({ label, error, hint, required, className, ...props }: TextareaProps) {
  return (
    <FieldWrapper label={label} error={error} hint={hint} required={required}>
      <textarea
        className={clsx(
          "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 shadow-soft-xs placeholder:text-slate-400 transition-shadow sm:py-2 sm:text-sm",
          "focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100",
          error && "border-red-400",
          className
        )}
        required={required}
        {...props}
      />
    </FieldWrapper>
  );
}
