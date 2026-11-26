import { useState } from "react";
import { DataTable } from "../components/DataTable";
import { Field } from "../components/Field";
import { FormModal } from "../components/Modal";
import { ConfirmDeleteText, PageHeader, RangeFilter, useRange } from "../components/ui";
import { useUser } from "../context/AuthContext";
import { useUi } from "../context/UiContext";
import type { CashEntry } from "../db/types";
import { useLive } from "../hooks";
import { formatDate, formatMoney, sum } from "../lib/format";
import { today } from "../lib/ids";
import { addCash, deleteCash, listCash, updateCash } from "../services/withdrawals";

export default function CashPage() {
  const user = useUser();
  const { run, confirm } = useUi();
  const [range, setRange] = useRange("today");
  const [edit, setEdit] = useState<CashEntry | "new" | null>(null);
  const rows = useLive((id) => listCash(id, range), [range.from, range.to]);
  const cur = edit && edit !== "new" ? edit : undefined;

  return (
    <>
      <PageHeader title="Cash in Hand" subtitle="Cash counted in your drawer. It is added to the Daily Overview total.">
        <button className="btn primary" onClick={() => setEdit("new")}>
          Add cash entry
        </button>
      </PageHeader>
      <RangeFilter range={range} onChange={setRange} />
      <DataTable
        rows={rows}
        rowKey={(c) => c.id}
        emptyTitle="No cash entries in this period"
        columns={[
          { header: "Date", cell: (c) => formatDate(c.date) },
          { header: "Amount", cell: (c) => formatMoney(c.amount), className: "right", footer: formatMoney(sum(rows ?? [], (c) => c.amount)) },
        ]}
        actions={(c) => (
          <>
            <button className="btn sm" onClick={() => setEdit(c)}>
              Edit
            </button>
            <button
              className="btn sm danger"
              onClick={async () => {
                if (await confirm({ title: "Delete entry", message: <ConfirmDeleteText what={`${formatMoney(c.amount)} on ${formatDate(c.date)}`} />, danger: true, confirmLabel: "Delete" })) {
                  await run(() => deleteCash(user.id, c.id), "Entry deleted.");
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
        title={cur ? "Edit cash entry" : "Add cash entry"}
        onClose={() => setEdit(null)}
        onSubmit={(v: { amount: string; date: string }) => run(() => (cur ? updateCash(user.id, cur.id, v) : addCash(user.id, v)), "Saved.")}
      >
        <div className="form-grid">
          <Field label="Cash in hand" name="amount" type="number" min="0.01" required defaultValue={cur?.amount} autoFocus />
          <Field label="Date" name="date" type="date" required defaultValue={cur?.date ?? today()} />
        </div>
      </FormModal>
    </>
  );
}
