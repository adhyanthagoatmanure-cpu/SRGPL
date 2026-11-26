import { useId, type ReactNode } from "react";

export interface FieldProps {
  label: string;
  name: string;
  type?: "text" | "number" | "date" | "email" | "password" | "tel" | "select" | "textarea";
  defaultValue?: string | number;
  required?: boolean;
  hint?: string;
  options?: Array<{ value: string; label: string }>;
  placeholder?: string;
  step?: string;
  min?: string | number;
  max?: string | number;
  maxLength?: number;
  autoComplete?: string;
  autoFocus?: boolean;
  readOnly?: boolean;
  disabled?: boolean;
  value?: string;
  onChange?: (v: string) => void;
}

export function Field(p: FieldProps) {
  const id = useId();
  const type = p.type ?? "text";
  const common = {
    id,
    name: p.name,
    required: p.required,
    autoFocus: p.autoFocus,
    readOnly: p.readOnly,
    disabled: p.disabled,
    "aria-describedby": p.hint ? `${id}-hint` : undefined,
    ...(p.value !== undefined ? { value: p.value, onChange: (e: { target: { value: string } }) => p.onChange?.(e.target.value) } : { defaultValue: p.defaultValue }),
  };
  let control: ReactNode;
  if (type === "select") {
    control = (
      <select {...common}>
        {p.options?.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  } else if (type === "textarea") {
    control = <textarea {...common} maxLength={p.maxLength ?? 300} placeholder={p.placeholder} />;
  } else {
    control = (
      <input
        {...common}
        type={type}
        step={type === "number" ? (p.step ?? "0.01") : undefined}
        min={p.min ?? (type === "number" ? 0 : undefined)}
        max={p.max}
        maxLength={p.maxLength}
        placeholder={p.placeholder}
        autoComplete={p.autoComplete}
        inputMode={type === "number" ? "decimal" : type === "tel" ? "tel" : undefined}
      />
    );
  }
  return (
    <div className="field">
      <label htmlFor={id}>
        {p.label}
        {p.required && <span className="req" aria-hidden="true"> *</span>}
      </label>
      {control}
      {p.hint && (
        <span className="hint" id={`${id}-hint`}>
          {p.hint}
        </span>
      )}
    </div>
  );
}
