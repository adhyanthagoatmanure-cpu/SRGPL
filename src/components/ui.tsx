import { useState, type ReactNode } from "react";
import { Field } from "./Field";
import { monthStart, today } from "../lib/ids";

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children && <div className="row">{children}</div>}
    </div>
  );
}

export function Loading() {
  return (
    <div className="loading" role="status" aria-label="Loading">
      <div className="spinner" />
    </div>
  );
}

const TONES: Record<string, string> = {
  Pending: "warn", Success: "ok", Delivered: "info", Failed: "bad", Cancelled: "",
  New: "info", "Success Delivery": "ok", Return: "warn", "Return Delivery": "",
  paid: "ok", unpaid: "warn", new: "info", active: "ok", pending: "warn",
};
export function StatusBadge({ status }: { status: string }) {
  return <span className={`badge ${TONES[status] ?? ""}`}>{status}</span>;
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: Array<{ id: T; label: string }>; value: T; onChange: (t: T) => void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function SearchBox({ value, onChange, label = "Search" }: { value: string; onChange: (v: string) => void; label?: string }) {
  return (
    <div className="search">
      <Field label={label} name="search" type="text" value={value} onChange={onChange} placeholder="Type to search..." />
    </div>
  );
}

export interface Range {
  from: string;
  to: string;
}

/** From / To date filter. Defaults to the current month. */
export function useRange(initial: "today" | "month" = "month"): [Range, (r: Range) => void] {
  const [r, setR] = useState<Range>({ from: initial === "today" ? today() : monthStart(), to: today() });
  return [r, setR];
}

export function RangeFilter({ range, onChange }: { range: Range; onChange: (r: Range) => void }) {
  return (
    <div className="toolbar">
      <Field label="From" name="from" type="date" value={range.from} onChange={(from) => onChange({ ...range, from })} />
      <Field label="To" name="to" type="date" value={range.to} onChange={(to) => onChange({ ...range, to })} />
      <button type="button" className="btn" onClick={() => onChange({ from: today(), to: today() })}>
        Today
      </button>
      <button type="button" className="btn" onClick={() => onChange({ from: monthStart(), to: today() })}>
        This month
      </button>
      <button type="button" className="btn" onClick={() => onChange({ from: "", to: "" })}>
        All dates
      </button>
    </div>
  );
}

export const Money = ({ children }: { children: ReactNode }) => <span className="nowrap">{children}</span>;

export function ConfirmDeleteText({ what }: { what: string }) {
  return (
    <p>
      Delete <strong>{what}</strong>? This cannot be undone. Export a backup first if you might need it again.
    </p>
  );
}
