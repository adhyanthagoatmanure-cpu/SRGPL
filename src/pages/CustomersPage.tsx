import { useState } from "react";
import { DataTable } from "../components/DataTable";
import { Field } from "../components/Field";
import { FormModal, Modal } from "../components/Modal";
import { ConfirmDeleteText, PageHeader, SearchBox } from "../components/ui";
import { useUser } from "../context/AuthContext";
import { useUi } from "../context/UiContext";
import type { Customer } from "../db/types";
import { useLive } from "../hooks";
import { formatDate, matches } from "../lib/format";
import { createCustomer, customerHistory, deleteCustomer, listCustomers, updateCustomer } from "../services/customers";

export default function CustomersPage() {
  const user = useUser();
  const { run, confirm } = useUi();
  const rows = useLive(listCustomers);
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<Customer | "new" | null>(null);
  const [hist, setHist] = useState<Customer | null>(null);
  const history = useLive((id) => (hist ? customerHistory(id, hist.id) : Promise.resolve([])), [hist?.id]);

  const shown = rows?.filter((c) => matches(q, c.name, c.mobile, c.place, c.code, c.remarks));
  const cur = edit && edit !== "new" ? edit : undefined;

  return (
    <>
      <PageHeader title="Customers" subtitle="Your customer directory">
        <button className="btn primary" onClick={() => setEdit("new")}>
          Add customer
        </button>
      </PageHeader>
      <div className="toolbar">
        <SearchBox value={q} onChange={setQ} label="Search customers" />
      </div>
      <DataTable
        rows={shown}
        rowKey={(c) => c.id}
        emptyTitle={rows?.length ? "No customers match your search" : "No customers yet"}
        emptyText={rows?.length ? undefined : "Add your first customer to get started."}
        columns={[
          { header: "ID", cell: (c) => c.code },
          { header: "Name", cell: (c) => <strong>{c.name}</strong> },
          { header: "Mobile", cell: (c) => <a href={`tel:${c.mobile}`}>{c.mobile}</a> },
          { header: "Place", cell: (c) => c.place },
          { header: "Remarks", cell: (c) => c.remarks || "\u2014" },
          { header: "Added", cell: (c) => formatDate(c.date) },
        ]}
        actions={(c) => (
          <>
            <button className="btn sm" onClick={() => setEdit(c)}>
              Edit
            </button>
            <button className="btn sm" onClick={() => setHist(c)}>
              History
            </button>
            <button
              className="btn sm danger"
              onClick={async () => {
                if (await confirm({ title: "Delete customer", message: <ConfirmDeleteText what={c.name} />, danger: true, confirmLabel: "Delete" })) {
                  await run(() => deleteCustomer(user.id, c.id), "Customer deleted.");
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
        title={cur ? "Edit customer" : "Add customer"}
        onClose={() => setEdit(null)}
        onSubmit={(v) =>
          run(
            () => (cur ? updateCustomer(user.id, cur.id, { name: v.name, mobile: v.mobile, place: v.place, remarks: v.remarks }) : createCustomer(user.id, { name: v.name, mobile: v.mobile, place: v.place, remarks: v.remarks })),
            cur ? "Customer updated." : "Customer added.",
          )
        }
      >
        <div className="form-grid">
          <Field label="Name" name="name" required defaultValue={cur?.name} maxLength={80} autoFocus />
          <Field label="Mobile" name="mobile" type="tel" required defaultValue={cur?.mobile} />
          <Field label="Place" name="place" required defaultValue={cur?.place} maxLength={120} />
        </div>
        <Field label="Remarks" name="remarks" type="textarea" defaultValue={cur?.remarks} />
      </FormModal>

      <Modal open={hist !== null} title={`History - ${hist?.name ?? ""}`} onClose={() => setHist(null)} wide>
        <DataTable
          rows={history}
          rowKey={(h) => h.id}
          emptyTitle="No history"
          columns={[
            { header: "Date", cell: (h) => formatDate(h.date) },
            { header: "Name", cell: (h) => h.name },
            { header: "Place", cell: (h) => h.place },
            { header: "Remarks", cell: (h) => h.remarks || "\u2014" },
          ]}
        />
      </Modal>
    </>
  );
}
