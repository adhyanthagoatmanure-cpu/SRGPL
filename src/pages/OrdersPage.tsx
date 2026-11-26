import { useState } from "react";
import { DataTable } from "../components/DataTable";
import { Field } from "../components/Field";
import { FormModal } from "../components/Modal";
import { ConfirmDeleteText, PageHeader, SearchBox, StatusBadge, Tabs } from "../components/ui";
import { useUser } from "../context/AuthContext";
import { useUi } from "../context/UiContext";
import { ORDER_STATUSES, type Order } from "../db/types";
import { useLive } from "../hooks";
import { formatDate, matches } from "../lib/format";
import { allOrderHistory, createOrder, deleteOrder, listOrders, setOrderStatus, updateOrderDetails, type OrderInput } from "../services/orders";

type Tab = "open" | "all" | "log";
const OPEN = new Set(["Pending", "Success", "Failed"]);

export default function OrdersPage() {
  const user = useUser();
  const { run, confirm } = useUi();
  const [tab, setTab] = useState<Tab>("open");
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<Order | "new" | null>(null);
  const [status, setStatus] = useState<Order | null>(null);
  const orders = useLive(listOrders);
  const log = useLive(allOrderHistory);

  const shown = orders?.filter((o) => (tab === "all" || OPEN.has(o.status)) && matches(q, o.name, o.mobile, o.particular, o.code, o.status));
  const cur = edit && edit !== "new" ? edit : undefined;

  return (
    <>
      <PageHeader title="Orders" subtitle="Customer orders and their progress">
        <button className="btn primary" onClick={() => setEdit("new")}>
          New order
        </button>
      </PageHeader>
      <Tabs
        tabs={[
          { id: "open", label: "Open orders" },
          { id: "all", label: "All orders" },
          { id: "log", label: "Status log" },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab !== "log" && (
        <>
          <div className="toolbar">
            <SearchBox value={q} onChange={setQ} />
          </div>
          <DataTable
            rows={shown}
            rowKey={(o) => o.id}
            emptyTitle={tab === "open" ? "No open orders" : "No orders"}
            emptyText="Orders you add will show up here."
            columns={[
              { header: "ID", cell: (o) => o.code },
              { header: "Date", cell: (o) => formatDate(o.date) },
              { header: "Customer", cell: (o) => <strong>{o.name}</strong> },
              { header: "Mobile", cell: (o) => o.mobile || "\u2014" },
              { header: "Order", cell: (o) => o.particular },
              { header: "Status", cell: (o) => <StatusBadge status={o.status} /> },
              { header: "Remarks", cell: (o) => o.remarks || "\u2014" },
            ]}
            actions={(o) => (
              <>
                <button className="btn sm primary" onClick={() => setStatus(o)}>
                  Update status
                </button>
                <button className="btn sm" onClick={() => setEdit(o)}>
                  Edit
                </button>
                <button
                  className="btn sm danger"
                  onClick={async () => {
                    if (await confirm({ title: "Delete order", message: <ConfirmDeleteText what={`order ${o.code} (${o.name})`} />, danger: true, confirmLabel: "Delete" })) {
                      await run(() => deleteOrder(user.id, o.id), "Order deleted.");
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
      {tab === "log" && (
        <DataTable
          rows={log}
          rowKey={(h) => h.id}
          emptyTitle="No status changes yet"
          columns={[
            { header: "Date", cell: (h) => formatDate(h.date) },
            { header: "Order", cell: (h) => (h.order ? `${h.order.code} - ${h.order.name}` : "(deleted order)") },
            { header: "Status", cell: (h) => <StatusBadge status={h.status} /> },
            { header: "Remarks", cell: (h) => h.remarks || "\u2014" },
          ]}
        />
      )}

      <FormModal
        open={edit !== null}
        title={cur ? "Edit order" : "New order"}
        onClose={() => setEdit(null)}
        onSubmit={(v: OrderInput) =>
          run(
            () => (cur ? updateOrderDetails(user.id, cur.id, v) : createOrder(user.id, v)),
            cur ? "Order updated." : "Order added.",
          )
        }
      >
        <div className="form-grid">
          <Field label="Customer name" name="name" required defaultValue={cur?.name} autoFocus />
          <Field label="Mobile" name="mobile" type="tel" defaultValue={cur?.mobile} />
        </div>
        <Field label="Order details" name="particular" type="textarea" required defaultValue={cur?.particular} maxLength={300} />
        <Field label="Remarks" name="remarks" type="textarea" defaultValue={cur?.remarks} />
      </FormModal>

      <FormModal
        open={status !== null}
        title={`Update status - order ${status?.code ?? ""}`}
        onClose={() => setStatus(null)}
        onSubmit={(v) => run(() => setOrderStatus(user.id, status!.id, v.status, v.remarks), "Status updated.")}
      >
        <Field label="Status" name="status" type="select" defaultValue={status?.status} options={ORDER_STATUSES.map((s) => ({ value: s, label: s }))} />
        <Field label="Remarks" name="remarks" type="textarea" defaultValue={status?.remarks} />
      </FormModal>
    </>
  );
}
