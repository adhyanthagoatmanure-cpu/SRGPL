import type { ReactNode } from "react";

export interface Column<T> {
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
  /** Footer cell content (e.g. totals). */
  footer?: ReactNode;
}

interface Props<T> {
  rows: T[] | undefined;
  columns: Column<T>[];
  rowKey: (row: T) => string;
  /** Renders the action buttons column. */
  actions?: (row: T) => ReactNode;
  emptyTitle?: string;
  emptyText?: string;
  emptyAction?: ReactNode;
  caption?: string;
}

/** Generic responsive table: becomes a list of cards on narrow screens. Shows loading and empty states. */
export function DataTable<T>({ rows, columns, rowKey, actions, emptyTitle = "Nothing here yet", emptyText, emptyAction, caption }: Props<T>) {
  if (rows === undefined) {
    return (
      <div className="loading" role="status" aria-label="Loading">
        <div className="spinner" />
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="empty card">
        <strong>{emptyTitle}</strong>
        {emptyText && <p>{emptyText}</p>}
        {emptyAction}
      </div>
    );
  }
  const hasFooter = columns.some((c) => c.footer !== undefined);
  return (
    <div className="table-wrap">
      <table className="data cards">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.header} scope="col" className={c.className}>
                {c.header}
              </th>
            ))}
            {actions && <th scope="col">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={rowKey(r)}>
              {columns.map((c) => (
                <td key={c.header} data-label={c.header} className={c.className}>
                  {c.cell(r)}
                </td>
              ))}
              {actions && (
                <td className="cell-actions">
                  <div className="actions">{actions(r)}</div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
        {hasFooter && (
          <tfoot>
            <tr>
              {columns.map((c, i) => (
                <td key={c.header} data-label={c.footer !== undefined ? c.header : ""} className={c.className}>
                  {c.footer ?? (i === 0 ? "Total" : "")}
                </td>
              ))}
              {actions && <td />}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
