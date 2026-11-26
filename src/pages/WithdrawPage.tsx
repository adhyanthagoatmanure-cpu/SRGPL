import { useState } from "react";
import { DataTable } from "../components/DataTable";
import { Field } from "../components/Field";
import { FormModal } from "../components/Modal";
import { ConfirmDeleteText, PageHeader, RangeFilter, SearchBox, Tabs, useRange } from "../components/ui";
import { useUser } from "../context/AuthContext";
import { useUi } from "../context/UiContext";
import type { UpiAccount, Withdrawal } from "../db/types";
import { useLive } from "../hooks";
import { formatDate, formatMoney, matches, sum } from "../lib/format";
import { today } from "../lib/ids";
import { addWithdrawal, createUpi, deleteUpi, deleteWithdrawal, listUpi, listWithdrawals, renameUpi, updateWithdrawal, type WithdrawalInput } from "../services/withdrawals";

type Tab = "withdrawals" | "accounts";

export default function WithdrawPage() {
  const user = useUser();
  const { run, confirm } = useUi();
  const [tab, setTab] = useState<Tab>("withdrawals");
  const [range, setRange] = useRange("today");
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<Withdrawal | "new" | null>(null);
  const [acc, setAcc] = useState<UpiAccount | "new" | null>(null);
  const accounts = useLive(listUpi);
  const rows = useLive((id) => listWithdrawals(id, range), [range.from, range.to]);
  const shown = rows?.filter((w) => matches(q, w.name, w.remarks));
  const cur = edit && edit !== "new" ? edit : undefined;
  const curAcc = acc && acc !== "new" ? acc : undefined;

  return (
    <>
      <PageHeader title="UPI Withdraw" subtitle="Cash given to customers against UPI payments, with your commission">
        <button className="btn primary" disabled={!accounts?.length} onClick={() => setEdit("new")}>
          New withdrawal
        </button>
      </PageHeader>
      {accounts && accounts.length === 0 && <div className="notice info">Add your UPI accounts first (Accounts tab), e.g. PhonePe, GPay.</div>}
      <Tabs tabs={[{ id: "withdrawals", label: "Withdrawals" }, { id: "accounts", label: "UPI accounts" }]} value={tab} onChange={setTab} />

      {tab === "withdrawals" ? (
        <>
          <RangeFilter range={range} onChange={setRange} />
          <div className="toolbar">
            <SearchBox value={q} onChange={setQ} />
          </div>
          <DataTable
            rows={shown}
            rowKey={(w) => w.id}
            emptyTitle="No withdrawals in this period"
            columns={[
              { header: "Date", cell: (w) => formatDate(w.date) },
              { header: "Account", cell: (w) => <strong>{w.name}</strong> },
              { header: "Amount", cell: (w) => formatMoney(w.amount), className: "right", footer: formatMoney(sum(shown ?? [], (w) => w.amount)) },
              { header: "Commission", cell: (w) => formatMoney(w.commission), className: "right", footer: formatMoney(sum(shown ?? [], (w) => w.commission)) },
              { header: "Commission received", cell: (w) => (w.way === "bank" ? "In bank" : "In hand") },
              { header: "Remarks", cell: (w) => w.remarks || "\u2014" },
            ]}
            actions={(w) => (
              <>
                <button className="btn sm" onClick={() => setEdit(w)}>
                  Edit
                </button>
                <button
                  className="btn sm danger"
                  onClick={async () => {
                    if (await confirm({ title: "Delete withdrawal", message: <ConfirmDeleteText what={`${w.name} ${formatMoney(w.amount)}`} />, danger: true, confirmLabel: "Delete" })) {
                      await run(() => deleteWithdrawal(user.id, w.id), "Withdrawal deleted.");
                    }
                  }}
                >
                  Delete
                </button>
              </>
            )}
          />
        </>
      ) : (
        <>
          <div className="toolbar">
            <button className="btn primary" onClick={() => setAcc("new")}>
              Add UPI account
            </button>
          </div>
          <DataTable
            rows={accounts}
            rowKey={(a) => a.id}
            emptyTitle="No UPI accounts yet"
            columns={[
              { header: "ID", cell: (a) => a.code },
              { header: "Account", cell: (a) => <strong>{a.name}</strong> },
            ]}
            actions={(a) => (
              <>
                <button className="btn sm" onClick={() => setAcc(a)}>
                  Rename
                </button>
                <button
                  className="btn sm danger"
                  onClick={async () => {
                    if (await confirm({ title: "Delete UPI account", message: <><ConfirmDeleteText what={a.name} /><p>Past withdrawals keep the account name.</p></>, danger: true, confirmLabel: "Delete" })) {
                      await run(() => deleteUpi(user.id, a.id), "Account deleted.");
                    }
                  }}
                >
                  Delete
                </button>
              </>
            )}
          />
        </>
      )}

      <FormModal
        open={edit !== null}
        title={cur ? "Edit withdrawal" : "New withdrawal"}
        onClose={() => setEdit(null)}
        onSubmit={(v: WithdrawalInput) => run(() => (cur ? updateWithdrawal(user.id, cur.id, v) : addWithdrawal(user.id, v)), cur ? "Withdrawal updated." : "Withdrawal saved.")}
      >
        {cur ? (
          <p>
            <strong>{cur.name}</strong>
          </p>
        ) : (
          <Field label="UPI account" name="upiId" type="select" options={(accounts ?? []).map((a) => ({ value: a.id, label: a.name }))} />
        )}
        <div className="form-grid">
          <Field label="Amount given" name="amount" type="number" min="0.01" required defaultValue={cur?.amount} />
          <Field label="Your commission" name="commission" type="number" defaultValue={cur?.commission ?? 0} />
          <Field label="Commission received" name="way" type="select" defaultValue={cur?.way ?? "hand"} options={[{ value: "hand", label: "In hand (cash)" }, { value: "bank", label: "In bank" }]} />
          <Field label="Date" name="date" type="date" required defaultValue={cur?.date ?? today()} />
        </div>
        <Field label="Remarks" name="remarks" type="textarea" defaultValue={cur?.remarks} />
      </FormModal>

      <FormModal open={acc !== null} title={curAcc ? "Rename account" : "Add UPI account"} onClose={() => setAcc(null)} onSubmit={(v: { name: string }) => run(() => (curAcc ? renameUpi(user.id, curAcc.id, v.name) : createUpi(user.id, v.name)), "Saved.")}>
        <Field label="Account name" name="name" required defaultValue={curAcc?.name} autoFocus />
      </FormModal>
    </>
  );
}
