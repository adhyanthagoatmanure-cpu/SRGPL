import { useState } from "react";
import { DataTable } from "../components/DataTable";
import { Field } from "../components/Field";
import { FormModal } from "../components/Modal";
import { ConfirmDeleteText, PageHeader, RangeFilter, SearchBox, Tabs, useRange } from "../components/ui";
import { useUser } from "../context/AuthContext";
import { useUi } from "../context/UiContext";
import type { Expense, Item } from "../db/types";
import { useLive } from "../hooks";
import { formatDate, formatMoney, matches, sum } from "../lib/format";
import { today } from "../lib/ids";
import { addExpense, deleteExpense, listExpenses, updateExpense, type ExpenseInput } from "../services/expenses";
import { createExpenseItem, deleteItem, listItems, updateItem } from "../services/items";

type Tab = "entries" | "items";

export default function ExpensesPage() {
  const user = useUser();
  const { run, confirm } = useUi();
  const [tab, setTab] = useState<Tab>("entries");
  const [range, setRange] = useRange("month");
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<Expense | "new" | null>(null);
  const [itemEdit, setItemEdit] = useState<Item | "new" | null>(null);
  const rows = useLive((id) => listExpenses(id, range), [range.from, range.to]);
  const items = useLive((id) => listItems(id, "expense"));
  const shown = rows?.filter((e) => matches(q, e.itemName, e.remarks));
  const cur = edit && edit !== "new" ? edit : undefined;
  const curItem = itemEdit && itemEdit !== "new" ? itemEdit : undefined;

  return (
    <>
      <PageHeader title="Expenses" subtitle="Shop spending by category">
        <button className="btn primary" disabled={!items?.length} onClick={() => setEdit("new")}>
          New expense
        </button>
      </PageHeader>
      {items && items.length === 0 && <div className="notice info">Create an expense category first (Categories tab), e.g. Rent, Tea, Electricity.</div>}
      <Tabs tabs={[{ id: "entries", label: "Expenses" }, { id: "items", label: "Categories" }]} value={tab} onChange={setTab} />

      {tab === "entries" && (
        <>
          <RangeFilter range={range} onChange={setRange} />
          <div className="toolbar">
            <SearchBox value={q} onChange={setQ} />
          </div>
          <DataTable
            rows={shown}
            rowKey={(e) => e.id}
            emptyTitle="No expenses in this period"
            columns={[
              { header: "Date", cell: (e) => formatDate(e.date) },
              { header: "Category", cell: (e) => <strong>{e.itemName}</strong>, footer: `${shown?.length ?? 0} entries` },
              { header: "Amount", cell: (e) => formatMoney(e.amount), className: "right", footer: formatMoney(sum(shown ?? [], (e) => e.amount)) },
              { header: "Remarks", cell: (e) => e.remarks || "\u2014" },
            ]}
            actions={(e) => (
              <>
                <button className="btn sm" onClick={() => setEdit(e)}>
                  Edit
                </button>
                <button
                  className="btn sm danger"
                  onClick={async () => {
                    if (await confirm({ title: "Delete expense", message: <ConfirmDeleteText what={`${e.itemName} ${formatMoney(e.amount)}`} />, danger: true, confirmLabel: "Delete" })) {
                      await run(() => deleteExpense(user.id, e.id), "Expense deleted.");
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
              Add category
            </button>
          </div>
          <DataTable
            rows={items}
            rowKey={(i) => i.id}
            emptyTitle="No categories yet"
            columns={[
              { header: "ID", cell: (i) => i.code },
              { header: "Category", cell: (i) => <strong>{i.name}</strong> },
            ]}
            actions={(i) => (
              <>
                <button className="btn sm" onClick={() => setItemEdit(i)}>
                  Rename
                </button>
                <button
                  className="btn sm danger"
                  onClick={async () => {
                    if (await confirm({ title: "Delete category", message: <><ConfirmDeleteText what={i.name} /><p>Past expense entries keep the category name.</p></>, danger: true, confirmLabel: "Delete" })) {
                      await run(() => deleteItem(user.id, i.id), "Category deleted.");
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
        title={cur ? "Edit expense" : "New expense"}
        onClose={() => setEdit(null)}
        onSubmit={(v: ExpenseInput) => run(() => (cur ? updateExpense(user.id, cur.id, v) : addExpense(user.id, v)), cur ? "Expense updated." : "Expense saved.")}
      >
        {cur ? (
          <p>
            <strong>{cur.itemName}</strong>
          </p>
        ) : (
          <Field label="Category" name="itemId" type="select" options={(items ?? []).map((i) => ({ value: i.id, label: i.name }))} />
        )}
        <div className="form-grid">
          <Field label="Amount" name="amount" type="number" required defaultValue={cur?.amount} />
          <Field label="Date" name="date" type="date" required defaultValue={cur?.date ?? today()} />
        </div>
        <Field label="Remarks" name="remarks" type="textarea" defaultValue={cur?.remarks} />
      </FormModal>

      <FormModal
        open={itemEdit !== null}
        title={curItem ? "Rename category" : "Add category"}
        onClose={() => setItemEdit(null)}
        onSubmit={(v: { name: string }) => run(() => (curItem ? updateItem(user.id, curItem.id, v) : createExpenseItem(user.id, v.name)), "Saved.")}
      >
        <Field label="Category name" name="name" required defaultValue={curItem?.name} autoFocus />
      </FormModal>
    </>
  );
}
