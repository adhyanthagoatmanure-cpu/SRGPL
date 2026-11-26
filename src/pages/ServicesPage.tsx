import { useState } from "react";
import { DataTable } from "../components/DataTable";
import { Field } from "../components/Field";
import { FormModal, Modal } from "../components/Modal";
import { ConfirmDeleteText, PageHeader, SearchBox, StatusBadge, Tabs } from "../components/ui";
import { useUser } from "../context/AuthContext";
import { useUi } from "../context/UiContext";
import { SERVICE_STATUSES, type Service } from "../db/types";
import { useLive } from "../hooks";
import { formatDate, formatMoney, matches } from "../lib/format";
import {
  addServiceRemark, createService, deleteService, deliver, listServices, markReturn, markSuccess, returnDelivery, serviceHistory, updateServiceDetails,
} from "../services/jobs";

type Tab = "open" | "all" | "log";
type Kind = "success" | "deliver" | "return" | "returnDelivery" | "remark" | "edit" | "history";
type Dialog = { kind: "new" } | { kind: Kind; job: Service } | null;

export default function ServicesPage() {
  const user = useUser();
  const { run, confirm } = useUi();
  const [tab, setTab] = useState<Tab>("open");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [dlg, setDlg] = useState<Dialog>(null);
  const jobs = useLive(listServices);
  const log = useLive((id) => serviceHistory(id));
  const job = dlg && "job" in dlg ? dlg.job : undefined;
  const hist = useLive((id) => (dlg?.kind === "history" ? serviceHistory(id, dlg.job.id) : Promise.resolve([])), [dlg?.kind, job?.id]);
  const close = () => setDlg(null);

  const shown = jobs?.filter(
    (j) => (tab === "all" || j.status === "New" || j.status === "Success" || j.status === "Return") && (!status || j.status === status) && matches(q, j.name, j.mobile, j.complaint, j.code, j.place),
  );
  const open = (kind: Kind, j: Service) => setDlg({ kind, job: j });

  return (
    <>
      <PageHeader title="Service Jobs" subtitle="Repairs and other jobs, with advance and balance tracking">
        <button className="btn primary" onClick={() => setDlg({ kind: "new" })}>
          New job
        </button>
      </PageHeader>
      <Tabs tabs={[{ id: "open", label: "Open jobs" }, { id: "all", label: "All jobs" }, { id: "log", label: "Payment log" }]} value={tab} onChange={setTab} />

      {tab !== "log" ? (
        <>
          <div className="toolbar">
            <SearchBox value={q} onChange={setQ} />
            {tab === "all" && <Field label="Status" name="status" type="select" value={status} onChange={setStatus} options={[{ value: "", label: "All" }, ...SERVICE_STATUSES.map((s) => ({ value: s, label: s }))]} />}
          </div>
          <DataTable
            rows={shown}
            rowKey={(j) => j.id}
            emptyTitle={tab === "open" ? "No open jobs" : "No jobs"}
            columns={[
              { header: "ID", cell: (j) => j.code },
              { header: "Date", cell: (j) => formatDate(j.date) },
              { header: "Customer", cell: (j) => <><strong>{j.name}</strong>{j.place && <div className="muted">{j.place}</div>}{j.mobile && <div><a href={`tel:${j.mobile}`}>{j.mobile}</a></div>}</> },
              { header: "Job", cell: (j) => j.complaint },
              { header: "Advance", cell: (j) => formatMoney(j.advance), className: "right" },
              { header: "Final", cell: (j) => formatMoney(j.final), className: "right" },
              { header: "Balance", cell: (j) => formatMoney(j.balance), className: "right" },
              { header: "Status", cell: (j) => <StatusBadge status={j.status} /> },
              { header: "Remarks", cell: (j) => j.remarks || "\u2014" },
            ]}
            actions={(j) => (
              <>
                {(j.status === "New" || j.status === "Success") && (
                  <button className="btn sm primary" onClick={() => open("success", j)}>
                    {j.status === "New" ? "Mark done" : "Change bill"}
                  </button>
                )}
                {j.status === "Success" && (
                  <button className="btn sm primary" onClick={() => open("deliver", j)}>
                    Deliver
                  </button>
                )}
                {(j.status === "New" || j.status === "Success") && (
                  <button className="btn sm" onClick={() => open("return", j)}>
                    Cannot repair
                  </button>
                )}
                {j.status === "Return" && (
                  <button className="btn sm primary" onClick={() => open("returnDelivery", j)}>
                    Hand back
                  </button>
                )}
                <button className="btn sm" onClick={() => open("remark", j)}>
                  Remark
                </button>
                <button className="btn sm" onClick={() => open("history", j)}>
                  History
                </button>
                <button className="btn sm" onClick={() => open("edit", j)}>
                  Edit
                </button>
                <button
                  className="btn sm danger"
                  onClick={async () => {
                    if (await confirm({ title: "Delete job", message: <><ConfirmDeleteText what={`job ${j.code} (${j.name})`} /><p>Its payment history is deleted too.</p></>, danger: true, confirmLabel: "Delete" })) {
                      await run(() => deleteService(user.id, j.id), "Job deleted.");
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
        <DataTable
          rows={log}
          rowKey={(h) => h.id}
          emptyTitle="No entries yet"
          columns={[
            { header: "Date", cell: (h) => formatDate(h.date) },
            { header: "Customer", cell: (h) => h.customerName },
            { header: "Status", cell: (h) => <StatusBadge status={h.status} /> },
            { header: "Received", cell: (h) => formatMoney(h.paid), className: "right" },
            { header: "Refunded", cell: (h) => formatMoney(h.returnAmount), className: "right" },
            { header: "Balance", cell: (h) => formatMoney(h.balance), className: "right" },
            { header: "Remarks", cell: (h) => h.remarks || "\u2014" },
          ]}
        />
      )}

      <FormModal open={dlg?.kind === "new"} title="New service job" onClose={close} onSubmit={(v: { name: string; mobile: string; place: string; complaint: string; advance: string; remarks: string }) => run(() => createService(user.id, v), "Job added.")}>
        <div className="form-grid">
          <Field label="Customer name" name="name" required autoFocus />
          <Field label="Mobile" name="mobile" type="tel" />
          <Field label="Place" name="place" />
          <Field label="Advance received" name="advance" type="number" defaultValue={0} />
        </div>
        <Field label="Complaint / job details" name="complaint" type="textarea" required />
        <Field label="Remarks" name="remarks" type="textarea" />
      </FormModal>

      <FormModal open={dlg?.kind === "edit"} title="Edit job details" onClose={close} onSubmit={(v: { name: string; mobile: string; place: string; complaint: string }) => run(() => updateServiceDetails(user.id, job!.id, v), "Job updated.")}>
        <div className="form-grid">
          <Field label="Customer name" name="name" required defaultValue={job?.name} autoFocus />
          <Field label="Mobile" name="mobile" type="tel" defaultValue={job?.mobile} />
          <Field label="Place" name="place" defaultValue={job?.place} />
        </div>
        <Field label="Complaint / job details" name="complaint" type="textarea" required defaultValue={job?.complaint} />
      </FormModal>

      <FormModal open={dlg?.kind === "success"} title={`Mark job done - ${job?.name ?? ""}`} onClose={close} onSubmit={(v: { final: string; remarks: string }) => run(() => markSuccess(user.id, job!.id, v.final, v.remarks), "Job marked as done.")}>
        <p>
          Advance received: <strong>{formatMoney(job?.advance)}</strong>. Balance = final amount - advance.
        </p>
        <Field label="Final amount (total bill)" name="final" type="number" min="0.01" required defaultValue={job?.final || undefined} autoFocus />
        <Field label="Remarks" name="remarks" type="textarea" defaultValue={job?.remarks} />
      </FormModal>

      <FormModal open={dlg?.kind === "deliver"} title={`Deliver - ${job?.name ?? ""}`} onClose={close} onSubmit={(v: { paid: string; remarks: string }) => run(() => deliver(user.id, job!.id, v.paid, v.remarks), "Delivered.")}>
        <p>
          Balance due: <strong>{formatMoney(job?.balance)}</strong>
        </p>
        <Field label="Amount received now" name="paid" type="number" required defaultValue={job?.balance} max={job?.balance} autoFocus />
        <Field label="Remarks" name="remarks" type="textarea" />
      </FormModal>

      <FormModal open={dlg?.kind === "return"} title={`Cannot repair - ${job?.name ?? ""}`} onClose={close} onSubmit={(v: { remarks: string }) => run(() => markReturn(user.id, job!.id, v.remarks), "Marked for return.")}>
        <p>The final bill and balance are set to zero. Hand the item back afterwards to refund any advance.</p>
        <Field label="Remarks" name="remarks" type="textarea" />
      </FormModal>

      <FormModal open={dlg?.kind === "returnDelivery"} title={`Hand back - ${job?.name ?? ""}`} onClose={close} onSubmit={(v: { refund: string; remarks: string }) => run(() => returnDelivery(user.id, job!.id, v.refund, v.remarks), "Returned to customer.")}>
        <p>
          Advance held: <strong>{formatMoney(job?.advance)}</strong>
        </p>
        <Field label="Amount refunded" name="refund" type="number" required defaultValue={job?.advance} max={job?.advance} autoFocus />
        <Field label="Remarks" name="remarks" type="textarea" />
      </FormModal>

      <FormModal open={dlg?.kind === "remark"} title={`Add remark - ${job?.name ?? ""}`} onClose={close} onSubmit={(v: { remarks: string }) => run(() => addServiceRemark(user.id, job!.id, v.remarks), "Remark saved.")}>
        <Field label="Remark" name="remarks" type="textarea" required defaultValue={job?.remarks} autoFocus />
      </FormModal>

      <Modal open={dlg?.kind === "history"} title={`Job history - ${job?.name ?? ""}`} onClose={close} wide>
        <DataTable
          rows={hist}
          rowKey={(h) => h.id}
          emptyTitle="No history"
          columns={[
            { header: "Date", cell: (h) => formatDate(h.date) },
            { header: "Status", cell: (h) => <StatusBadge status={h.status} /> },
            { header: "Received", cell: (h) => formatMoney(h.paid), className: "right" },
            { header: "Refunded", cell: (h) => formatMoney(h.returnAmount), className: "right" },
            { header: "Balance", cell: (h) => formatMoney(h.balance), className: "right" },
            { header: "Remarks", cell: (h) => h.remarks || "\u2014" },
          ]}
        />
      </Modal>
    </>
  );
}
