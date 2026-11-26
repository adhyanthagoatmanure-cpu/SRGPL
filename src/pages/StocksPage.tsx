import { useState } from "react";
import { DataTable } from "../components/DataTable";
import { Field } from "../components/Field";
import { FormModal, Modal } from "../components/Modal";
import { ConfirmDeleteText, PageHeader, SearchBox, StatusBadge } from "../components/ui";
import { useUser } from "../context/AuthContext";
import { useUi } from "../context/UiContext";
import type { Stock } from "../db/types";
import { useLive } from "../hooks";
import { formatDate, formatMoney, formatNumber, matches } from "../lib/format";
import { LOW_STOCK_LIMIT, adjustStock, createStock, deleteStock, listStocks, restock, stockHistory, updateStock } from "../services/stocks";

type Dialog = { kind: "new" } | { kind: "restock" | "edit" | "adjust" | "history"; stock: Stock } | null;

const TYPE_LABEL: Record<string, string> = {
  opening: "Opening", restock: "Added", adjustment: "Adjusted", sale: "Sold", return: "Returned", "void-sale": "Sale cancelled", "void-return": "Return cancelled",
};

export default function StocksPage() {
  const user = useUser();
  const { run, confirm } = useUi();
  const rows = useLive(listStocks);
  const [q, setQ] = useState("");
  const [dlg, setDlg] = useState<Dialog>(null);
  const hist = useLive((id) => (dlg?.kind === "history" ? stockHistory(id, dlg.stock.id) : Promise.resolve([])), [dlg?.kind, dlg && "stock" in dlg ? dlg.stock.id : ""]);
  const shown = rows?.filter((s) => matches(q, s.name, s.code));
  const close = () => setDlg(null);
  const st = dlg && "stock" in dlg ? dlg.stock : undefined;
  const low = rows?.filter((s) => s.quantity < LOW_STOCK_LIMIT).length ?? 0;

  return (
    <>
      <PageHeader title="Stocks" subtitle="Items you keep in stock. Sales reduce stock automatically.">
        <button className="btn primary" onClick={() => setDlg({ kind: "new" })}>
          Add stock item
        </button>
      </PageHeader>
      {low > 0 && <div className="notice warn">{low} item(s) have fewer than {LOW_STOCK_LIMIT} units left.</div>}
      <div className="toolbar">
        <SearchBox value={q} onChange={setQ} />
      </div>
      <DataTable
        rows={shown}
        rowKey={(s) => s.id}
        emptyTitle={rows?.length ? "No items match" : "No stock items yet"}
        emptyText="Add an item with its quantity and selling price."
        columns={[
          { header: "ID", cell: (s) => s.code },
          { header: "Item", cell: (s) => <strong>{s.name}</strong> },
          { header: "Quantity", cell: (s) => <>{formatNumber(s.quantity)} {s.quantity < LOW_STOCK_LIMIT && <span className="badge bad">Low</span>}</>, className: "right" },
          { header: "Price", cell: (s) => formatMoney(s.price), className: "right" },
        ]}
        actions={(s) => (
          <>
            <button className="btn sm primary" onClick={() => setDlg({ kind: "restock", stock: s })}>
              Add stock
            </button>
            <button className="btn sm" onClick={() => setDlg({ kind: "edit", stock: s })}>
              Edit
            </button>
            <button className="btn sm" onClick={() => setDlg({ kind: "adjust", stock: s })}>
              Adjust
            </button>
            <button className="btn sm" onClick={() => setDlg({ kind: "history", stock: s })}>
              History
            </button>
            <button
              className="btn sm danger"
              onClick={async () => {
                if (await confirm({ title: "Delete stock item", message: <><ConfirmDeleteText what={s.name} /><p>Its stock history is deleted too. Past sales keep their records.</p></>, danger: true, confirmLabel: "Delete" })) {
                  await run(() => deleteStock(user.id, s.id), "Stock item deleted.");
                }
              }}
            >
              Delete
            </button>
          </>
        )}
      />

      <FormModal open={dlg?.kind === "new"} title="Add stock item" onClose={close} onSubmit={(v: { name: string; quantity: string; price: string }) => run(() => createStock(user.id, v), "Stock item added.")}>
        <Field label="Item name" name="name" required autoFocus />
        <div className="form-grid">
          <Field label="Opening quantity" name="quantity" type="number" step="any" required defaultValue={0} />
          <Field label="Selling price (per unit)" name="price" type="number" required />
        </div>
      </FormModal>

      <FormModal open={dlg?.kind === "restock"} title={`Add stock - ${st?.name ?? ""}`} onClose={close} onSubmit={(v: { quantity: string; price: string }) => run(() => restock(user.id, st!.id, v.quantity, v.price), "Stock updated.")}>
        <p className="muted">Current quantity: {formatNumber(st?.quantity)}</p>
        <div className="form-grid">
          <Field label="Quantity to add" name="quantity" type="number" step="any" min="0.01" required autoFocus />
          <Field label="New selling price" name="price" type="number" hint="Leave empty to keep the current price." />
        </div>
      </FormModal>

      <FormModal open={dlg?.kind === "edit"} title="Edit stock item" onClose={close} onSubmit={(v: { name: string; price: string }) => run(() => updateStock(user.id, st!.id, v), "Stock item updated.")}>
        <div className="form-grid">
          <Field label="Item name" name="name" required defaultValue={st?.name} autoFocus />
          <Field label="Selling price" name="price" type="number" required defaultValue={st?.price} />
        </div>
      </FormModal>

      <FormModal open={dlg?.kind === "adjust"} title={`Adjust quantity - ${st?.name ?? ""}`} onClose={close} onSubmit={(v: { delta: string }) => run(() => adjustStock(user.id, st!.id, v.delta), "Quantity adjusted.")}>
        <p className="muted">Current quantity: {formatNumber(st?.quantity)}. Use a negative number for damaged or lost items.</p>
        <Field label="Change (+ or -)" name="delta" type="number" step="any" min="-1000000" required autoFocus />
      </FormModal>

      <Modal open={dlg?.kind === "history"} title={`Stock history - ${st?.name ?? ""}`} onClose={close} wide>
        <DataTable
          rows={hist}
          rowKey={(h) => h.id}
          emptyTitle="No history"
          columns={[
            { header: "Date", cell: (h) => formatDate(h.date) },
            { header: "Type", cell: (h) => <StatusBadge status={TYPE_LABEL[h.type] ?? h.type} /> },
            { header: "Change", cell: (h) => `${h.quantity > 0 ? "+" : ""}${formatNumber(h.quantity)}`, className: "right" },
            { header: "Balance", cell: (h) => formatNumber(h.quantityAfter), className: "right" },
            { header: "Price", cell: (h) => (h.price === null ? "\u2014" : formatMoney(h.price)), className: "right" },
          ]}
        />
      </Modal>
    </>
  );
}
