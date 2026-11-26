import { useState } from "react";
import { DataTable } from "../components/DataTable";
import { Field } from "../components/Field";
import { FormModal } from "../components/Modal";
import { ConfirmDeleteText, PageHeader, RangeFilter, SearchBox, StatusBadge, Tabs, useRange } from "../components/ui";
import { useUser } from "../context/AuthContext";
import { useUi } from "../context/UiContext";
import type { Purchase } from "../db/types";
import { useLive } from "../hooks";
import { formatDate, formatMoney, matches, sum } from "../lib/format";
import { today } from "../lib/ids";
import { addPurchase, deletePurchase, listPurchases, payPurchase, purchaseHistory, renamePurchaseShop } from "../services/purchases";

type Tab = "shops" | "history";
type Dialog = { kind: "add"; shop?: Purchase } | { kind: "pay" | "rename"; shop: Purchase } | null;

export default function PurchasesPage() {
  const user = useUser();
  const { run, confirm } = useUi();
  const [tab, setTab] = useState<Tab>("shops");
  const [q, setQ] = useState("");
  const [range, setRange] = useRange("month");
  const [dlg, setDlg] = useState<Dialog>(null);
  const shops = useLive(listPurchases);
  const hist = useLive((id) => purchaseHistory(id));
  const shown = shops?.filter((p) => matches(q, p.shop, p.particulars, p.code));
  const histShown = hist?.filter((h) => (!range.from || h.date >= range.from) && (!range.to || h.date <= range.to) && matches(q, h.shopName, h.particular));
  const st = dlg && "shop" in dlg ? dlg.shop : undefined;
  const close = () => setDlg(null);
  const totalOwed = sum(shops ?? [], (p) => p.balance);

  return (
    <>
      <PageHeader title="Purchases" subtitle="Goods bought from suppliers and what you still owe them">
        <button className="btn primary" onClick={() => setDlg({ kind: "add" })}>
          New purchase
        </button>
      </PageHeader>
      <div className="stats">
        <div className="stat accent bad">
          <div className="label">Total owed to shops</div>
          <div className="value">{formatMoney(totalOwed)}</div>
        </div>
      </div>
      <Tabs tabs={[{ id: "shops", label: "Shops" }, { id: "history", label: "History" }]} value={tab} onChange={setTab} />
      {tab === "history" && <RangeFilter range={range} onChange={setRange} />}
      <div className="toolbar">
        <SearchBox value={q} onChange={setQ} />
      </div>

      {tab === "shops" ? (
        <DataTable
          rows={shown}
          rowKey={(p) => p.id}
          emptyTitle={shops?.length ? "No shops match" : "No purchases yet"}
          emptyText="Record a purchase to start tracking what you owe each shop."
          columns={[
            { header: "ID", cell: (p) => p.code },
            { header: "Shop", cell: (p) => <strong>{p.shop}</strong> },
            { header: "Last purchase", cell: (p) => p.particulars || "\u2014" },
            { header: "Last date", cell: (p) => formatDate(p.date) },
            { header: "Balance owed", cell: (p) => formatMoney(p.balance), className: "right" },
            { header: "Status", cell: (p) => <StatusBadge status={p.status} /> },
          ]}
          actions={(p) => (
            <>
              <button className="btn sm" onClick={() => setDlg({ kind: "add", shop: p })}>
                Add purchase
              </button>
              <button className="btn sm primary" disabled={p.balance <= 0} onClick={() => setDlg({ kind: "pay", shop: p })}>
                Pay
              </button>
              <button className="btn sm" onClick={() => setDlg({ kind: "rename", shop: p })}>
                Rename
              </button>
              <button
                className="btn sm danger"
                onClick={async () => {
                  if (await confirm({ title: "Delete shop", message: <><ConfirmDeleteText what={p.shop} /><p>All its purchase and payment history is deleted too.</p></>, danger: true, confirmLabel: "Delete" })) {
                    await run(() => deletePurchase(user.id, p.id), "Shop deleted.");
                  }
                }}
              >
                Delete
              </button>
            </>
          )}
        />
      ) : (
        <DataTable
          rows={histShown}
          rowKey={(h) => h.id}
          emptyTitle="No entries in this period"
          columns={[
            { header: "Date", cell: (h) => formatDate(h.date) },
            { header: "Shop", cell: (h) => <strong>{h.shopName}</strong> },
            { header: "Type", cell: (h) => (h.kind === "purchase" ? <span className="badge warn">Purchase</span> : <span className="badge ok">Payment</span>) },
            { header: "Details", cell: (h) => h.particular || "\u2014" },
            { header: "Amount", cell: (h) => formatMoney(h.amount), className: "right", footer: formatMoney(sum(histShown ?? [], (h) => (h.kind === "purchase" ? h.amount : -h.amount))) + " net" },
            { header: "Balance after", cell: (h) => formatMoney(h.balance), className: "right" },
          ]}
        />
      )}

      <FormModal
        open={dlg?.kind === "add"}
        title={st ? `New purchase - ${st.shop}` : "New purchase"}
        onClose={close}
        onSubmit={(v: { shop: string; particular: string; amount: string; date: string }) => run(() => addPurchase(user.id, v), "Purchase saved.")}
      >
        {st ? <input type="hidden" name="shop" defaultValue={st.shop} /> : <Field label="Shop name" name="shop" required autoFocus hint="Using an existing shop name adds to that shop's balance." />}
        <div className="form-grid">
          <Field label="Amount (owed)" name="amount" type="number" required />
          <Field label="Date" name="date" type="date" defaultValue={today()} required />
        </div>
        <Field label="Particulars" name="particular" type="textarea" />
      </FormModal>

      <FormModal
        open={dlg?.kind === "pay"}
        title={`Pay shop - ${st?.shop ?? ""}`}
        onClose={close}
        onSubmit={(v: { amount: string; remarks: string }) => run(() => payPurchase(user.id, st!.id, v.amount, v.remarks), "Payment saved.")}
      >
        <p>
          Balance owed: <strong>{formatMoney(st?.balance)}</strong>
        </p>
        <Field label="Amount paid" name="amount" type="number" required defaultValue={st?.balance} min="0.01" max={st?.balance} autoFocus />
        <Field label="Remarks" name="remarks" type="textarea" />
      </FormModal>

      <FormModal
        open={dlg?.kind === "rename"}
        title="Rename shop"
        onClose={close}
        onSubmit={(v: { name: string }) => run(() => renamePurchaseShop(user.id, st!.id, v.name), "Shop renamed.")}
      >
        <Field label="Shop name" name="name" required defaultValue={st?.shop} autoFocus />
      </FormModal>
    </>
  );
}
