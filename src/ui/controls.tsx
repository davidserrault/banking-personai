import { createContext, useContext, useId, type ReactNode } from "react";
import { Plus, Trash2, ChevronDown } from "lucide-react";
import type { ValidationIssue } from "../domain/types";
import { t } from "./messages";
export const ErrorsContext = createContext<ValidationIssue[]>([]);
interface FieldProps {
  label: string;
  value: string | number;
  onChange: (value: any) => void;
  type?: string;
  min?: number;
  max?: number;
  step?: number | string;
  path?: string;
  hint?: string;
  options?: [string, string][];
  disabled?: boolean;
  span?: boolean;
}
export function Field({
  label,
  value,
  onChange,
  type = "text",
  min,
  max,
  step,
  path,
  hint,
  options,
  disabled,
  span,
}: FieldProps) {
  const id = useId();
  const issues = useContext(ErrorsContext);
  const error = issues.find((x) => {
    const normalized = x.path.replace(/\[(\d+)\]/g, ".$1");
    return normalized === path || normalized === `configuration.${path}`;
  })?.message;
  const props = {
    id,
    disabled,
    "aria-invalid": Boolean(error),
    "aria-describedby": error ? `${id}-error` : hint ? `${id}-hint` : undefined,
  };
  return (
    <div className={`field ${span ? "span-2" : ""}`}>
      <label htmlFor={id}>{label}</label>
      {options ? (
        <div className="select-wrap">
          <select
            {...props}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          >
            {options.map(([key, name]) => (
              <option key={key} value={key}>
                {name}
              </option>
            ))}
          </select>
          <ChevronDown size={14} />
        </div>
      ) : (
        <input
          {...props}
          type={type}
          value={
            typeof value === "number" && !Number.isFinite(value) ? "" : value
          }
          min={min}
          max={max}
          step={step ?? (type === "number" ? "any" : undefined)}
          onChange={(e) =>
            onChange(
              type === "number"
                ? e.target.value === ""
                  ? NaN
                  : Number(e.target.value)
                : e.target.value,
            )
          }
        />
      )}{" "}
      {error ? (
        <span className="field-error" id={`${id}-error`}>
          {error}
        </span>
      ) : hint ? (
        <span className="field-hint" id={`${id}-hint`}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}
export function Toggle({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  hint?: string;
}) {
  return (
    <label className="toggle-row">
      <span>
        <span>{label}</span>
        {hint && <small>{hint}</small>}
      </span>
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="switch" aria-hidden="true" />
    </label>
  );
}
export function Section({
  title,
  description,
  children,
  action,
  className = "",
}: {
  title: string;
  description?: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      <div className="section-heading">
        <div>
          <h3>{title}</h3>
          {description && <p>{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
export function AddButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      className="button secondary small"
      disabled={disabled}
      onClick={onClick}
    >
      <Plus size={15} />
      {children}
    </button>
  );
}
export function DeleteButton({
  onClick,
  label = t("studio.remove"),
  disabled,
}: {
  onClick: () => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <button
      className="icon-button danger"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      <Trash2 size={16} />
    </button>
  );
}
export function Empty({
  icon,
  title,
  text,
  children,
}: {
  icon?: ReactNode;
  title: string;
  text?: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      {icon}
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {children}
    </div>
  );
}
