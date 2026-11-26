import { useMemo, useState } from "react";
import { DataTable } from "../components/DataTable";
import { Field } from "../components/Field";
import { FormModal } from "../components/Modal";
import { ConfirmDeleteText, PageHeader, RangeFilter, SearchBox, Tabs, useRange } from "../components/ui";
import { useUser } from "../context/AuthContext";
import { useUi } from "../context/UiContext";
import type { Item, Sale } from "../db/types";
import { useLive } from "../hooks";
import { formatDate, formatMoney, formatNumber, matches, sum } from "../lib/format";
import { today } from "../lib/ids";
import { round2 } from "../lib/validation";
import { createSaleItem, deleteItem, listItems, updateItem } from "../services/items";
import { addSale, deleteSale, listSales, updateSale, type SaleInput } from "../services/sales";
import { listStocks } from "../services/stocks";

type Tab = "sales" | "items";

function SaleForm({ items, stockQty, sale }: { items: Item[]; stockQty: Map<string, number>; sale?: Sale }) {
  const [itemId, setItemId] = useState(sale?.itemId ?? items[0]?.id ?? "");
  const [qty, setQty] = useState(String(sale?.quantity ?? 1));
  const [price, setPrice] = useState(sale ? String(sale.price) : "");
  const [touched, setTouched] = useState(Boolean(sale));
  const item = items.find((i) => i.id === itemId);
  const auto = item ? String(round2((Number(qty) || 0) * item.rate)) : "";
  const stock = item?.stockId ? stockQty.get(item.stockId) : undefined;
  return (
    <>
      {sale ? (
        <p>
          <strong>{sale.itemName}</strong>
        </p>
      ) : (
        <Field
          label="Item"
          name="itemId"
          type="select"
          value={itemId}
          onChange={(v) => {
            setItemId(v);
            setTouched(false);
          }}
          options={items.map((i) => ({ value: i.id, label: `${i.name} - ${formatMoney(i.rate)}${i.stockId && stockQty.has(i.stockId) ? ` (stock ${formatNumber(stockQty.get(i.stockId))})` : ""}` }))}
        />
      )}
      <div className="form-grid">
        <Field label="Quantity" name="quantity" type="number" step="any" min="0.01" required value={qty} onChange={setQty} hint={stock !== undefined && !sale ? `In stock: ${formatNumber(stock)}` : undefined} />
        <Field
          label="Total price received"
          name="price"
          type="number"
          required
          value={touched ? price : auto}
          onChange={(v) => {
            setTouched(true);
            setPrice(v);
          }}
          hint={item && !sale ? `Rate ${formatMoney(item.rate)} x quantity. You can change it (e.g. a discount).` : undefined}
        />
        <Field label="Date" name="date" type="date" defaultValue={sale?.date ?? today()} required />
      </div>
      <Field label="Remarks" name="remarks" type="textarea" defaultValue={sale?.remarks} />
    </>
  );
}

export default function SalesPage() {
  const user = useUser();
  const { run, confirm } = useUi();
  const [tab, setTab] = useState<Tab>("sales");
  const [range, setRange] = useRange("today");
  const [q, setQ] = useState("");
  const [saleEdit, setSaleEdit] = useState<Sale | "new" | null>(null);
  const [itemEdit, setItemEdit] = useState<Item | "new" | null>(null);

  const sales = useLive((id) => listSales(id, range), [range.from, range.to]);
  const items = useLive((id) => listItems(id, "sale"));
  const stocks = useLive(listStocks);
  const stockQty = useMemo(() => new Map((stocks ?? []).map((s) => [s.id, s.quantity])), [stocks]);

  const shown = sales?.filter((s) => matches(q, s.itemName, s.remarks));
  const curSale = saleEdit && saleEdit !== "new" ? saleEdit : undefined;
  const curItem = itemEdit && itemEdit !== "new" ? itemEdit : undefined;

  return (
    <>
      <PageHeader title="Sales" subtitle="Record what you sell. Stock reduces automatically for stocked items.">
        <button className="btn primary" disabled={!items?.length} onClick={() => setSaleEdit("new")}>
          New sale
        </button>
      </PageHeader>
      {items && items.length === 0 && (
        <div className="notice info">
          Add an item first (Items tab) or create a stock item on the Stocks page, then you can record sales.
        </div>
      )}
      <Tabs tabs={[{ id: "sales", label: "Sales" }, { id: "items", label: "Items & rates" }]} value={tab} onChange={setTab} />

      {tab === "sales" && (
        <>
          <RangeFilter range={range} onChange={setRange} />
          <div className="toolbar">
            <SearchBox value={q} onChange={setQ} />
          </div>
          <DataTable
            rows={shown}
            rowKey={(s) => s.id}
            emptyTitle="No sales in this period"
            columns={[
              { header: "Date", cell: (s) => formatDate(s.date) },
              { header: "Item", cell: (s) => <strong>{s.itemName}</strong>, footer: `${shown?.length ?? 0} sales` },
              { header: "Qty", cell: (s) => formatNumber(s.quantity), className: "right", footer: formatNumber(sum(shown ?? [], (s) => s.quantity)) },
              { header: "Amount", cell: (s) => formatMoney(s.price), className: "right", footer: formatMoney(sum(shown ?? [], (s) => s.price)) },
              { header: "Remarks", cell: (s) => s.remarks || "\u2014" },
            ]}
            actions={(s) => (
              <>
                <button className="btn sm" onClick={() => setSaleEdit(s)}>
                  Edit
                </button>
                <button
                  className="btn sm danger"
                  onClick={async () => {
                    if (await confirm({ title: "Delete sale", message: <><ConfirmDeleteText what={`${s.itemName} x ${s.quantity} (${formatMoney(s.price)})`} /><p>Stocked quantity will be returned to stock.</p></>, danger: true, confirmLabel: "Delete" })) {
                      await run(() => deleteSale(user.id, s.id), "Sale deleted.");
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

      {tab === "items" && (
        <>
          <div className="toolbar">
            <button className="btn primary" onClick={() => setItemEdit("new")}>
              Add item
            </button>
          </div>
          <DataTable
            rows={items}
            rowKey={(i) => i.id}
            emptyTitle="No items yet"
            emptyText="Items created on the Stocks page also appear here."
            columns={[
              { header: "ID", cell: (i) => i.code },
              { header: "Item", cell: (i) => <strong>{i.name}</strong> },
              { header: "Rate", cell: (i) => formatMoney(i.rate), className: "right" },
              { header: "Stock", cell: (i) => (i.stockId && stockQty.has(i.stockId) ? formatNumber(stockQty.get(i.stockId)) : "Not tracked") },
            ]}
            actions={(i) => (
              <>
                <button className="btn sm" onClick={() => setItemEdit(i)}>
                  Edit
                </button>
                <button
                  className="btn sm danger"
                  onClick={async () => {
                    if (await confirm({ title: "Delete item", message: <ConfirmDeleteText what={i.name} />, danger: true, confirmLabel: "Delete" })) {
                      await run(() => deleteItem(user.id, i.id), "Item deleted.");
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
        open={saleEdit !== null}
        title={curSale ? "Edit sale" : "New sale"}
        onClose={() => setSaleEdit(null)}
        onSubmit={(v: SaleInput) =>
          run(
            () => (curSale ? updateSale(user.id, curSale.id, v) : addSale(user.id, v)),
            curSale ? "Sale updated." : "Sale saved.",
          )
        }
      >
        <SaleForm items={items ?? []} stockQty={stockQty} sale={curSale} />
      </FormModal>

      <FormModal
        open={itemEdit !== null}
        title={curItem ? "Edit item" : "Add item"}
        onClose={() => setItemEdit(null)}
        onSubmit={(v: { name: string; rate: string }) =>
          run(() => (curItem ? updateItem(user.id, curItem.id, v) : createSaleItem(user.id, v)), curItem ? "Item updated." : "Item added.")
        }
      >
        <div className="form-grid">
          <Field label="Item name" name="name" required defaultValue={curItem?.name} autoFocus />
          <Field label="Rate (selling price per unit)" name="rate" type="number" required defaultValue={curItem?.rate} />
        </div>
      </FormModal>
    </>
  );
}
