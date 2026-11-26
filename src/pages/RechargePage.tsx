import { useState } from "react";
import { DataTable } from "../components/DataTable";
import { Field } from "../components/Field";
import { FormModal } from "../components/Modal";
import { ConfirmDeleteText, PageHeader, RangeFilter, SearchBox, Tabs, useRange } from "../components/ui";
import { useUser } from "../context/AuthContext";
import { useUi } from "../context/UiContext";
import type { Network, Recharge } from "../db/types";
import { useLive } from "../hooks";
import { formatDate, formatMoney, matches, sum } from "../lib/format";
import { today } from "../lib/ids";
import { round2 } from "../lib/validation";
import {
  NETWORK_LABEL, NETWORK_TYPES, addRecharge, commissionReport, createNetwork, deleteNetwork, deleteRecharge, listNetworks, listRecharges, renameNetwork, updateRecharge, type RechargeInput,
} from "../services/network";

type Tab = "recharges" | "networks" | "commission";

function RechargeForm({ networks, rc }: { networks: Network[]; rc?: Recharge }) {
  const [amount, setAmount] = useState(rc ? String(rc.amount) : "");
  const [oldB, setOldB] = useState(rc ? String(rc.oldBalance) : "");
  const [newB, setNewB] = useState(rc ? String(rc.newBalance) : "");
  const commission = amount && oldB !== "" && newB !== "" ? round2(Number(newB) + Number(amount) - Number(oldB)) : null;
  return (
    <>
      {rc ? (
        <p>
          <strong>{rc.network}</strong>
        </p>
      ) : (
        <Field label="Network" name="networkId" type="select" options={networks.map((n) => ({ value: n.id, label: `${n.name} (${NETWORK_LABEL[n.type]})` }))} />
      )}
      <div className="form-grid">
        <Field label="Mobile / DTH / customer number" name="number" required defaultValue={rc?.number} maxLength={40} />
        <Field label="Recharge amount" name="amount" type="number" min="0.01" required value={amount} onChange={setAmount} />
        <Field label="Wallet balance before" name="oldBalance" type="number" required value={oldB} onChange={setOldB} />
        <Field label="Wallet balance after" name="newBalance" type="number" required value={newB} onChange={setNewB} />
        <Field label="Date" name="date" type="date" required defaultValue={rc?.date ?? today()} />
      </div>
      <div className={`notice ${commission !== null && commission < 0 ? "warn" : "info"}`}>
        Commission = balance after + amount - balance before ={" "}
        <strong>{commission === null ? "..." : formatMoney(commission)}</strong>
        {commission !== null && commission < 0 && " (negative: please check the balances)"}
      </div>
    </>
  );
}

export default function RechargePage() {
  const user = useUser();
  const { run, confirm } = useUi();
  const [tab, setTab] = useState<Tab>("recharges");
  const [range, setRange] = useRange("today");
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<Recharge | "new" | null>(null);
  const [netEdit, setNetEdit] = useState<Network | "new" | null>(null);

  const nets = useLive(listNetworks);
  const rows = useLive((id) => listRecharges(id, range), [range.from, range.to]);
  const comm = useLive((id) => commissionReport(id, range), [range.from, range.to]);
  const shown = rows?.filter((r) => matches(q, r.network, r.number));
  const cur = edit && edit !== "new" ? edit : undefined;
  const curNet = netEdit && netEdit !== "new" ? netEdit : undefined;

  return (
    <>
      <PageHeader title="Recharge" subtitle="Mobile, DTH and other recharges with automatic commission">
        <button className="btn primary" disabled={!nets?.length} onClick={() => setEdit("new")}>
          New recharge
        </button>
      </PageHeader>
      {nets && nets.length === 0 && (
        <div className="notice info">
          Add your networks first (Networks tab), e.g. Jio, Airtel, Tata Play. They are also used by Daily Transactions.
        </div>
      )}
      <Tabs
        tabs={[{ id: "recharges", label: "Recharges" }, { id: "commission", label: "Commission" }, { id: "networks", label: "Networks" }]}
        value={tab}
        onChange={setTab}
      />

      {tab !== "networks" && <RangeFilter range={range} onChange={setRange} />}

      {tab === "recharges" && (
        <>
          <div className="toolbar">
            <SearchBox value={q} onChange={setQ} />
          </div>
          <DataTable
            rows={shown}
            rowKey={(r) => r.id}
            emptyTitle="No recharges in this period"
            columns={[
              { header: "Date", cell: (r) => formatDate(r.date) },
              { header: "Network", cell: (r) => <><strong>{r.network}</strong> <span className="badge">{NETWORK_LABEL[r.networkType]}</span></> },
              { header: "Number", cell: (r) => r.number },
              { header: "Amount", cell: (r) => formatMoney(r.amount), className: "right", footer: formatMoney(sum(shown ?? [], (r) => r.amount)) },
              { header: "Balance before", cell: (r) => formatMoney(r.oldBalance), className: "right" },
              { header: "Balance after", cell: (r) => formatMoney(r.newBalance), className: "right" },
              { header: "Commission", cell: (r) => formatMoney(r.commission), className: "right", footer: formatMoney(sum(shown ?? [], (r) => r.commission)) },
            ]}
            actions={(r) => (
              <>
                <button className="btn sm" onClick={() => setEdit(r)}>
                  Edit
                </button>
                <button
                  className="btn sm danger"
                  onClick={async () => {
                    if (await confirm({ title: "Delete recharge", message: <ConfirmDeleteText what={`${r.network} ${r.number} ${formatMoney(r.amount)}`} />, danger: true, confirmLabel: "Delete" })) {
                      await run(() => deleteRecharge(user.id, r.id), "Recharge deleted.");
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

      {tab === "commission" && (
        <>
          <p className="muted">
            Commission per network for the selected dates = sum of the commission of every recharge. Networks of type &quot;Other&quot; are not included.
          </p>
          <DataTable
            rows={comm}
            rowKey={(c) => c.networkId}
            emptyTitle="No commission in this period"
            columns={[
              { header: "Network", cell: (c) => <strong>{c.network}</strong> },
              { header: "Type", cell: (c) => NETWORK_LABEL[c.type] },
              { header: "Recharges", cell: (c) => c.count, className: "right" },
              { header: "Amount", cell: (c) => formatMoney(c.amount), className: "right", footer: formatMoney(sum(comm ?? [], (c) => c.amount)) },
              { header: "Commission", cell: (c) => formatMoney(c.commission), className: "right", footer: formatMoney(sum(comm ?? [], (c) => c.commission)) },
            ]}
          />
        </>
      )}

      {tab === "networks" && (
        <>
          <div className="toolbar">
            <button className="btn primary" onClick={() => setNetEdit("new")}>
              Add network
            </button>
          </div>
          <DataTable
            rows={nets}
            rowKey={(n) => n.id}
            emptyTitle="No networks yet"
            columns={[
              { header: "ID", cell: (n) => n.code },
              { header: "Network", cell: (n) => <strong>{n.name}</strong> },
              { header: "Type", cell: (n) => NETWORK_LABEL[n.type] },
            ]}
            actions={(n) => (
              <>
                <button className="btn sm" onClick={() => setNetEdit(n)}>
                  Rename
                </button>
                <button
                  className="btn sm danger"
                  onClick={async () => {
                    if (await confirm({ title: "Delete network", message: <><ConfirmDeleteText what={n.name} /><p>Its daily transaction rows are deleted too. Past recharges keep the network name.</p></>, danger: true, confirmLabel: "Delete" })) {
                      await run(() => deleteNetwork(user.id, n.id), "Network deleted.");
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
        title={cur ? "Edit recharge" : "New recharge"}
        onClose={() => setEdit(null)}
        onSubmit={(v: RechargeInput) => run(() => (cur ? updateRecharge(user.id, cur.id, v) : addRecharge(user.id, v)), cur ? "Recharge updated." : "Recharge saved.")}
      >
        <RechargeForm networks={nets ?? []} rc={cur} />
      </FormModal>

      <FormModal
        open={netEdit !== null}
        title={curNet ? "Rename network" : "Add network"}
        onClose={() => setNetEdit(null)}
        onSubmit={(v: { name: string; type: string }) => run(() => (curNet ? renameNetwork(user.id, curNet.id, v.name) : createNetwork(user.id, v)), "Saved.")}
      >
        <Field label="Network name" name="name" required defaultValue={curNet?.name} autoFocus />
        {curNet ? (
          <p className="muted">Type: {NETWORK_LABEL[curNet.type]} (cannot be changed)</p>
        ) : (
          <Field label="Type" name="type" type="select" options={NETWORK_TYPES.map((t) => ({ value: t, label: NETWORK_LABEL[t] }))} />
        )}
      </FormModal>
    </>
  );
}
