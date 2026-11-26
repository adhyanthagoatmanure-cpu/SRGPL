import { useState } from "react";
import { DataTable } from "../components/DataTable";
import { Field } from "../components/Field";
import { FormModal } from "../components/Modal";
import { ConfirmDeleteText, PageHeader, RangeFilter, useRange } from "../components/ui";
import { useUser } from "../context/AuthContext";
import { useUi } from "../context/UiContext";
import type { SaleReturn } from "../db/types";
import { useLive } from "../hooks";
import { formatDate, formatMoney, formatNumber, sum } from "../lib/format";
import { today } from "../lib/ids";
import { listItems } from "../services/items";
import { addReturn, deleteReturn, listReturns, updateReturn, type ReturnInput } from "../services/sales";

export default function ReturnsPage() {
  const user = useUser();
  const { run, confirm } = useUi();
  const [range, setRange] = useRange("month");
  const [edit, setEdit] = useState<SaleReturn | "new" | null>(null);
  const rows = useLive((id) => listReturns(id, range), [range.from, range.to]);
  const items = useLive((id) => listItems(id, "sale"));
  const cur = edit && edit !== "new" ? edit : undefined;

  return (
    <>
      <PageHeader title="Sale Returns" subtitle="Goods returned by customers. Stocked items are added back to stock.">
        <button className="btn primary" disabled={!items?.length} onClick={() => setEdit("new")}>
          New return
        </button>
      </PageHeader>
      <RangeFilter range={range} onChange={setRange} />
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        emptyTitle="No returns in this period"
        columns={[
          { header: "Date", cell: (r) => formatDate(r.date) },
          { header: "Product", cell: (r) => <strong>{r.product}</strong> },
          { header: "Qty", cell: (r) => formatNumber(r.quantity), className: "right", footer: formatNumber(sum(rows ?? [], (r) => r.quantity)) },
          { header: "Refund", cell: (r) => formatMoney(r.price), className: "right", footer: formatMoney(sum(rows ?? [], (r) => r.price)) },
          { header: "Remarks", cell: (r) => r.remarks || "\u2014" },
        ]}
        actions={(r) => (
          <>
            <button className="btn sm" onClick={() => setEdit(r)}>
              Edit
            </button>
            <button
              className="btn sm danger"
              onClick={async () => {
                if (await confirm({ title: "Delete return", message: <ConfirmDeleteText what={`${r.product} x ${r.quantity}`} />, danger: true, confirmLabel: "Delete" })) {
                  await run(() => deleteReturn(user.id, r.id), "Return deleted.");
                }
              }}
            >
              Delete
            </button>
          </>
        )}
      />
      <FormModal
        open={edit !== null}
        title={cur ? "Edit return" : "New return"}
        onClose={() => setEdit(null)}
        onSubmit={(v: ReturnInput) => run(() => (cur ? updateReturn(user.id, cur.id, v) : addReturn(user.id, v)), cur ? "Return updated." : "Return saved.")}
      >
        {cur ? (
          <p>
            <strong>{cur.product}</strong>
          </p>
        ) : (
          <Field label="Product" name="itemId" type="select" options={(items ?? []).map((i) => ({ value: i.id, label: i.name }))} />
        )}
        <div className="form-grid">
          <Field label="Quantity returned" name="quantity" type="number" step="any" min="0.01" required defaultValue={cur?.quantity ?? 1} />
          <Field label="Amount refunded" name="price" type="number" required defaultValue={cur?.price} />
          <Field label="Date" name="date" type="date" required defaultValue={cur?.date ?? today()} />
        </div>
        <Field label="Remarks" name="remarks" type="textarea" defaultValue={cur?.remarks} />
      </FormModal>
    </>
  );
}
