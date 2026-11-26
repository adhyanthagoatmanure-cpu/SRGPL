import { useState } from "react";
import { DataTable } from "../components/DataTable";
import { Field } from "../components/Field";
import { FormModal } from "../components/Modal";
import { PageHeader, StatusBadge } from "../components/ui";
import { useUser } from "../context/AuthContext";
import { useUi } from "../context/UiContext";
import type { User } from "../db/types";
import { useLive } from "../hooks";
import { formatDateTime } from "../lib/format";
import { approveUser, deleteUserAndData, listUsers, rejectUser, resetUserPassword } from "../services/auth";

export default function AccountsPage() {
  const me = useUser();
  const { run, confirm } = useUi();
  const users = useLive(listUsers);
  const [reset, setReset] = useState<User | null>(null);
  const pending = users?.filter((u) => u.status === "pending").length ?? 0;

  if (me.role !== "owner") return <div className="notice bad">Only the owner account can manage accounts.</div>;

  return (
    <>
      <PageHeader title="Accounts" subtitle="Everyone who has registered on this device" />
      {pending > 0 && <div className="notice warn">{pending} registration request(s) waiting for approval.</div>}
      <DataTable
        rows={users}
        rowKey={(u) => u.id}
        columns={[
          { header: "Shop", cell: (u) => <strong>{u.shopName}</strong> },
          { header: "Email", cell: (u) => u.email },
          { header: "Mobile", cell: (u) => u.mobile },
          { header: "Role", cell: (u) => (u.role === "owner" ? "Owner" : "Staff") },
          { header: "Status", cell: (u) => <StatusBadge status={u.status} /> },
          { header: "Last login", cell: (u) => formatDateTime(u.lastLoginAt) },
        ]}
        actions={(u) =>
          u.id === me.id ? (
            <span className="muted">You</span>
          ) : u.status === "pending" ? (
            <>
              <button className="btn sm primary" onClick={() => run(() => approveUser(me.id, u.id), "Account approved.")}>
                Approve
              </button>
              <button
                className="btn sm danger"
                onClick={async () => {
                  if (await confirm({ title: "Reject request", message: <p>Reject and remove the request from {u.email}?</p>, danger: true, confirmLabel: "Reject" })) {
                    await run(() => rejectUser(me.id, u.id), "Request rejected.");
                  }
                }}
              >
                Reject
              </button>
            </>
          ) : (
            <>
              <button className="btn sm" onClick={() => setReset(u)}>
                Reset password
              </button>
              <button
                className="btn sm danger"
                onClick={async () => {
                  if (
                    await confirm({
                      title: "Delete account and all its data",
                      danger: true,
                      confirmLabel: "Delete everything",
                      message: <p>Permanently delete <strong>{u.shopName}</strong> ({u.email}) and every record it owns from this device? This cannot be undone.</p>,
                    })
                  ) {
                    await run(() => deleteUserAndData(me.id, u.id), "Account deleted.");
                  }
                }}
              >
                Delete
              </button>
            </>
          )
        }
      />
      <FormModal open={reset !== null} title={`Reset password - ${reset?.email ?? ""}`} onClose={() => setReset(null)} onSubmit={(v: { password: string }) => run(() => resetUserPassword(me.id, reset!.id, v.password), "Password reset. Tell the user their new password.")}>
        <Field label="New password" name="password" type="password" required autoComplete="new-password" hint="At least 8 characters with a letter and a number." autoFocus />
      </FormModal>
    </>
  );
}
