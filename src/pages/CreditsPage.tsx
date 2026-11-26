import { useState } from "react";
import { DataTable } from "../components/DataTable";
import { Field } from "../components/Field";
import { FormModal, Modal } from "../components/Modal";
import { ConfirmDeleteText, PageHeader, SearchBox } from "../components/ui";
import { useUser } from "../context/AuthContext";
import { useUi } from "../context/UiContext";
import type { CollectionKind, Credit } from "../db/types";
import { useLive } from "../hooks";
import { formatDate, formatMoney, matches, sum } from "../lib/format";
import { today } from "../lib/ids";
import { addCollectionEntry, collectionsFor, createCredit, deleteCredit, listCredits, updateCredit } from "../services/credits";

type Dialog = { kind: "new" } | { kind: "edit" | "entry" | "history"; credit: Credit; entry?: CollectionKind } | null;

export default function CreditsPage() {
  const user = useUser();
  const { run, confirm } = useUi();
  const rows = useLive(listCredits);
  const [q, setQ] = useState("");
  const [dlg, setDlg] = useState<Dialog>(null);
  const cr = dlg && "credit" in dlg ? dlg.credit : undefined;
  const hist = useLive((id) => (dlg?.kind === "history" ? collectionsFor(id, dlg.credit.id) : Promise.resolve([])), [dlg?.kind, cr?.id]);
  const shown = rows?.filter((c) => matches(q, c.name, c.mobile, c.particulars, c.code));
  const close = () => setDlg(null);

  return (
    <>
      <PageHeader title="Credits" subtitle="Customers who owe you money">
        <button className="btn primary" onClick={() => setDlg({ kind: "new" })}>
          Add credit customer
        </button>
      </PageHeader>
      <div className="stats">
        <div className="stat accent bad">
          <div className="label">Total to collect</div>
          <div className="value">{formatMoney(sum(rows ?? [], (c) => c.balance))}</div>
        </div>
      </div>
      <div className="toolbar">
        <SearchBox value={q} onChange={setQ} />
      </div>
      <DataTable
        rows={shown}
        rowKey={(c) => c.id}
        emptyTitle={rows?.length ? "No customers match" : "No credit customers yet"}
        emptyText="Add a customer who takes goods or money on credit."
        columns={[
          { header: "ID", cell: (c) => c.code },
          { header: "Name", cell: (c) => <strong>{c.name}</strong> },
          { header: "Mobile", cell: (c) => (c.mobile ? <a href={`tel:${c.mobile}`}>{c.mobile}</a> : "\u2014") },
          { header: "Particulars", cell: (c) => c.particulars || "\u2014" },
          { header: "Balance due", cell: (c) => <strong className={c.balance > 0 ? "line-neg" : ""}>{formatMoney(c.balance)}</strong>, className: "right" },
        ]}
        actions={(c) => (
          <>
            <button className="btn sm primary" disabled={c.balance <= 0} onClick={() => setDlg({ kind: "entry", credit: c, entry: "payment" })}>
              Collect payment
            </button>
            <button className="btn sm" onClick={() => setDlg({ kind: "entry", credit: c, entry: "credit" })}>
              Give credit
            </button>
            <button className="btn sm" onClick={() => setDlg({ kind: "history", credit: c })}>
              History
            </button>
            <button className="btn sm" onClick={() => setDlg({ kind: "edit", credit: c })}>
              Edit
            </button>
            <button
              className="btn sm danger"
              onClick={async () => {
                if (await confirm({ title: "Delete credit customer", message: <><ConfirmDeleteText what={c.name} /><p>Their full credit history is deleted too{c.balance > 0 ? ` and the ${formatMoney(c.balance)} still due will no longer be tracked` : ""}.</p></>, danger: true, confirmLabel: "Delete" })) {
                  await run(() => deleteCredit(user.id, c.id), "Customer deleted.");
                }
              }}
            >
              Delete
            </button>
          </>
        )}
      />

      <FormModal open={dlg?.kind === "new"} title="Add credit customer" onClose={close} onSubmit={(v: { name: string; mobile: string; particulars: string; openingBalance: string }) => run(() => createCredit(user.id, v), "Customer added.")}>
        <div className="form-grid">
          <Field label="Name" name="name" required autoFocus />
          <Field label="Mobile" name="mobile" type="tel" />
          <Field label="Opening balance due" name="openingBalance" type="number" defaultValue={0} />
        </div>
        <Field label="Particulars" name="particulars" type="textarea" />
      </FormModal>

      <FormModal open={dlg?.kind === "edit"} title="Edit customer" onClose={close} onSubmit={(v: { name: string; mobile: string; particulars: string }) => run(() => updateCredit(user.id, cr!.id, v), "Customer updated.")}>
        <div className="form-grid">
          <Field label="Name" name="name" required defaultValue={cr?.name} autoFocus />
          <Field label="Mobile" name="mobile" type="tel" defaultValue={cr?.mobile} />
        </div>
        <Field label="Particulars" name="particulars" type="textarea" defaultValue={cr?.particulars} />
        <p className="muted">The balance changes only through credit and payment entries.</p>
      </FormModal>

      <FormModal
        open={dlg?.kind === "entry"}
        title={dlg?.kind === "entry" && dlg.entry === "payment" ? `Collect payment - ${cr?.name}` : `Give credit - ${cr?.name}`}
        onClose={close}
        onSubmit={(v: { amount: string; remarks: string; date: string }) =>
          run(() => addCollectionEntry(user.id, cr!.id, { kind: (dlg as { entry: CollectionKind }).entry, ...v }), "Entry saved.")
        }
      >
        <p>
          Current balance due: <strong>{formatMoney(cr?.balance)}</strong>
        </p>
        <div className="form-grid">
          <Field label="Amount" name="amount" type="number" min="0.01" required autoFocus defaultValue={dlg?.kind === "entry" && dlg.entry === "payment" ? cr?.balance : undefined} />
          <Field label="Date" name="date" type="date" required defaultValue={today()} />
        </div>
        <Field label="Remarks" name="remarks" type="textarea" />
      </FormModal>

      <Modal open={dlg?.kind === "history"} title={`Credit history - ${cr?.name ?? ""}`} onClose={close} wide>
        <DataTable
          rows={hist}
          rowKey={(h) => h.id}
          emptyTitle="No entries"
          columns={[
            { header: "Date", cell: (h) => formatDate(h.date) },
            { header: "Type", cell: (h) => (h.kind === "credit" ? <span className="badge warn">Credit given</span> : <span className="badge ok">Payment</span>) },
            { header: "Amount", cell: (h) => formatMoney(h.amount), className: "right" },
            { header: "Balance after", cell: (h) => formatMoney(h.balance), className: "right" },
            { header: "Remarks", cell: (h) => h.remarks || "\u2014" },
          ]}
        />
      </Modal>
    </>
  );
}
