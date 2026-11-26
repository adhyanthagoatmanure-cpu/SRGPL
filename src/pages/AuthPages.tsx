import { useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate } from "react-router-dom";
import { Field } from "../components/Field";
import { useAuth } from "../context/AuthContext";
import { errorMessage } from "../lib/errors";

export function LocalAuthNotice() {
  return (
    <div className="notice warn">
      <strong>About this login:</strong> accounts and data are stored only in this browser on this device. There is no
      cloud account, no password reset by email and no sync between devices. Clearing browser data, or a browser
      storage clean-up, can erase everything. Use <em>Backup &amp; Restore</em> regularly and keep the backup files safe.
    </div>
  );
}

function AuthShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="auth">
      <div className="auth-card">
        <img className="logo" src="/logo.png" alt="SRGPL" />
        <h1>{title}</h1>
        {children}
      </div>
    </div>
  );
}

export function LoginPage() {
  const { user, userCount, login, loading } = useAuth();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (loading) return null;
  if (user) return <Navigate to="/" replace />;
  if (userCount === 0) return <Navigate to="/register" replace />;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      await login(String(f.get("email")), String(f.get("password")), f.get("remember") === "on");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Log in">
      <form onSubmit={submit}>
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        <Field label="Email" name="email" type="email" required autoComplete="username" autoFocus />
        <Field label="Password" name="password" type="password" required autoComplete="current-password" />
        <label className="check" style={{ marginBottom: ".85rem" }}>
          <input type="checkbox" name="remember" defaultChecked /> Keep me signed in on this device
        </label>
        <button className="btn primary block" disabled={busy}>
          {busy ? "Checking..." : "Log in"}
        </button>
      </form>
      <p className="mt muted" style={{ textAlign: "center" }}>
        New here? <Link to="/register">Create an account</Link>
      </p>
      <LocalAuthNotice />
      <div className="notice info">
        Forgot your password? There is no email reset. Ask the owner account of this device to reset it from
        <em> Accounts</em>, or restore a backup. The owner password cannot be recovered without a backup.
      </div>
    </AuthShell>
  );
}

export function RegisterPage() {
  const { user, userCount, register, loading } = useAuth();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<"owner" | "pending" | null>(null);
  if (loading) return null;
  if (user) return <Navigate to="/" replace />;
  const first = userCount === 0;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    if (f.password !== f.confirm) {
      setError("The two passwords do not match.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const u = await register({ shopName: f.shopName, email: f.email, mobile: f.mobile, address: f.address, pincode: f.pincode, password: f.password });
      setDone(u.role === "owner" ? "owner" : "pending");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <AuthShell title="Account created">
        <div className="notice ok">
          {done === "owner"
            ? "Your owner account is ready. You can log in now."
            : "Your registration was saved on this device. The owner account must approve it before you can log in."}
        </div>
        <Link className="btn primary block" to="/login">
          Go to log in
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={first ? "Set up your shop" : "Create account"}>
      {first ? (
        <div className="notice info">
          This is the first account on this device, so it becomes the <strong>owner</strong> and can approve other accounts.
        </div>
      ) : (
        <div className="notice info">New accounts must be approved by the owner account of this device before they can log in.</div>
      )}
      <form onSubmit={submit}>
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        <Field label="Shop name" name="shopName" required maxLength={80} autoFocus />
        <Field label="Email" name="email" type="email" required autoComplete="username" />
        <Field label="Mobile number" name="mobile" type="tel" required autoComplete="tel" />
        <Field label="Address" name="address" required maxLength={200} />
        <Field label="Pincode" name="pincode" required maxLength={10} />
        <Field label="Password" name="password" type="password" required autoComplete="new-password" hint="At least 8 characters with a letter and a number." />
        <Field label="Confirm password" name="confirm" type="password" required autoComplete="new-password" />
        <button className="btn primary block" disabled={busy}>
          {busy ? "Creating..." : "Create account"}
        </button>
      </form>
      <p className="mt muted" style={{ textAlign: "center" }}>
        {first ? (
          <>
            Moving from another device? <Link to="/restore">Restore from a backup file</Link>
          </>
        ) : (
          <>
            Already registered? <Link to="/login">Log in</Link>
          </>
        )}
      </p>
      <LocalAuthNotice />
    </AuthShell>
  );
}

export { AuthShell };
