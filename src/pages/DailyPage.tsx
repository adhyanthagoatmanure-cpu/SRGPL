import { useState } from "react";
import { DataTable } from "../components/DataTable";
import { Field } from "../components/Field";
import { FormModal } from "../components/Modal";
import { ConfirmDeleteText, PageHeader, Tabs } from "../components/ui";
import { useUser } from "../context/AuthContext";
import { useUi } from "../context/UiContext";
import type { Network } from "../db/types";
import { useLive } from "../hooks";
import { formatDate, formatMoney, sum } from "../lib/format";
import { today } from "../lib/ids";
import { dailyHistory, dailySheet, deleteDaily, saveDaily, type DailyRow } from "../services/daily";
import { NETWORK_LABEL } from "../services/network";

type Tab = "sheet" | "history";

export default function DailyPage() {
  const user = useUser();
  const { run, confirm } = useUi();
  const [tab, setTab] = useState<Tab>("sheet");
  const [date, setDate] = useState(today());
  const [edit, setEdit] = useState<DailyRow | null>(null);
  const [hFrom, setHFrom] = useState(date);
  const [hTo, setHTo] = useState(date);
  const sheet = useLive((id) => dailySheet(id, date || today()), [date]);
  const hist = useLive((id) => dailyHistory(id, hFrom, hTo), [hFrom, hTo]);
  const net: Network | undefined = edit?.network;

  return (
    <>
      <PageHeader title="Daily Transactions" subtitle="Wallet opening, purchase and closing balance for each network. Sales = opening + purchase - closing." />
      <Tabs tabs={[{ id: "sheet", label: "Daily sheet" }, { id: "history", label: "History" }]} value={tab} onChange={setTab} />

      {tab === "sheet" ? (
        <>
          <div className="toolbar">
            <Field label="Date" name="date" type="date" value={date} onChange={setDate} />
            <button className="btn" onClick={() => setDate(today())}>
              Today
            </button>
          </div>
          <div className="notice info">
            Each day starts at zero (like the original app). Enter the opening balance of each wallet for the day, then update purchase and closing balance.
          </div>
          <DataTable
            rows={sheet}
            rowKey={(r) => r.network.id}
            emptyTitle="No networks yet"
            emptyText="Add networks on the Recharge page (Networks tab) to use the daily sheet."
            columns={[
              { header: "Network", cell: (r) => <><strong>{r.network.name}</strong> <span className="badge">{NETWORK_LABEL[r.network.type]}</span></> },
              { header: "Opening", cell: (r) => formatMoney(r.record?.opening ?? 0), className: "right", footer: formatMoney(sum(sheet ?? [], (r) => r.record?.opening ?? 0)) },
              { header: "Purchase", cell: (r) => formatMoney(r.record?.purchase ?? 0), className: "right", footer: formatMoney(sum(sheet ?? [], (r) => r.record?.purchase ?? 0)) },
              { header: "Closing", cell: (r) => formatMoney(r.record?.closing ?? 0), className: "right", footer: formatMoney(sum(sheet ?? [], (r) => r.record?.closing ?? 0)) },
              { header: "Sales", cell: (r) => <strong>{formatMoney(r.record?.sales ?? 0)}</strong>, className: "right", footer: formatMoney(sum(sheet ?? [], (r) => r.record?.sales ?? 0)) },
            ]}
            actions={(r) => (
              <>
                <button className="btn sm primary" onClick={() => setEdit(r)}>
                  {r.record ? "Update" : "Enter"}
                </button>
                {r.record && (
                  <button
                    className="btn sm danger"
                    onClick={async () => {
                      if (await confirm({ title: "Clear day", message: <ConfirmDeleteText what={`${r.network.name} on ${formatDate(date)}`} />, danger: true, confirmLabel: "Delete" })) {
                        await run(() => deleteDaily(user.id, r.record!.id), "Entry deleted.");
                      }
                    }}
                  >
                    Delete
                  </button>
                )}
              </>
            )}
          />
        </>
      ) : (
        <>
          <div className="toolbar">
            <Field label="From" name="from" type="date" value={hFrom} onChange={setHFrom} />
            <Field label="To" name="to" type="date" value={hTo} onChange={setHTo} />
            <button className="btn" onClick={() => { setHFrom(""); setHTo(""); }}>
              All dates
            </button>
          </div>
          <DataTable
            rows={hist}
            rowKey={(h) => h.id}
            emptyTitle="No history"
            columns={[
              { header: "Date", cell: (h) => formatDate(h.date) },
              { header: "Network", cell: (h) => <strong>{h.item}</strong> },
              { header: "Opening", cell: (h) => formatMoney(h.opening), className: "right" },
              { header: "Purchase", cell: (h) => formatMoney(h.purchase), className: "right" },
              { header: "Closing", cell: (h) => formatMoney(h.closing), className: "right" },
              { header: "Sales", cell: (h) => formatMoney(h.sales), className: "right" },
            ]}
          />
        </>
      )}

      <FormModal
        open={edit !== null}
        title={`${net?.name ?? ""} - ${formatDate(date)}`}
        onClose={() => setEdit(null)}
        onSubmit={(v: { opening: string; purchase: string; closing: string }) => run(() => saveDaily(user.id, net!.id, date, v), "Saved.")}
      >
        <div className="form-grid">
          <Field label="Opening balance" name="opening" type="number" required defaultValue={edit?.record?.opening ?? 0} autoFocus />
          <Field label="Purchase (wallet top-up)" name="purchase" type="number" required defaultValue={edit?.record?.purchase ?? 0} />
          <Field label="Closing balance" name="closing" type="number" required defaultValue={edit?.record?.closing ?? 0} />
        </div>
        <p className="muted">Sales are calculated automatically: opening + purchase - closing.</p>
      </FormModal>
    </>
  );
}
