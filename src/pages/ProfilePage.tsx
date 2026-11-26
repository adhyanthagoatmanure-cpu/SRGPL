import { useState } from "react";
import { Field } from "../components/Field";
import { PageHeader } from "../components/ui";
import { useAuth, useUser } from "../context/AuthContext";
import { useUi } from "../context/UiContext";
import { formatDateTime } from "../lib/format";
import { AppError } from "../lib/errors";
import { changePassword, updateProfile } from "../services/auth";

export default function ProfilePage() {
  const user = useUser();
  const { setUser } = useAuth();
  const { run } = useUi();
  const [busy, setBusy] = useState(false);

  return (
    <>
      <PageHeader title="Profile" subtitle={`${user.email} - ${user.role === "owner" ? "Owner account" : "Staff account"}`} />
      <div className="card">
        <h2>Shop details</h2>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
            setBusy(true);
            await run(async () => setUser(await updateProfile(user.id, { shopName: f.shopName, mobile: f.mobile, address: f.address, pincode: f.pincode })), "Profile updated.");
            setBusy(false);
          }}
        >
          <div className="form-grid">
            <Field label="Shop name" name="shopName" required defaultValue={user.shopName} />
            <Field label="Mobile" name="mobile" type="tel" required defaultValue={user.mobile} />
            <Field label="Address" name="address" required defaultValue={user.address} />
            <Field label="Pincode" name="pincode" required defaultValue={user.pincode} />
          </div>
          <p className="muted">Email: {user.email} (cannot be changed). Last login: {formatDateTime(user.lastLoginAt)}</p>
          <button className="btn primary" disabled={busy}>
            Save profile
          </button>
        </form>
      </div>
      <div className="card">
        <h2>Change password</h2>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const f = Object.fromEntries(new FormData(form)) as Record<string, string>;
            if (f.next !== f.confirm) {
              await run(async () => {
                throw new AppError("The new passwords do not match.");
              });
              return;
            }
            if (await run(() => changePassword(user.id, f.current, f.next), "Password changed.")) form.reset();
          }}
        >
          <div className="form-grid">
            <Field label="Current password" name="current" type="password" required autoComplete="current-password" />
            <Field label="New password" name="next" type="password" required autoComplete="new-password" hint="At least 8 characters with a letter and a number." />
            <Field label="Confirm new password" name="confirm" type="password" required autoComplete="new-password" />
          </div>
          <button className="btn primary">Change password</button>
        </form>
        <div className="notice warn mt">There is no password reset by email. If you forget your password, the owner of this device can set a new one, or you can restore a backup.</div>
      </div>
    </>
  );
}
