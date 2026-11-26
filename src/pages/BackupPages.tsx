import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { Field } from "../components/Field";
import { PageHeader } from "../components/ui";
import { useAuth, useUser } from "../context/AuthContext";
import { useUi } from "../context/UiContext";
import { downloadText } from "../lib/csv";
import { formatBytes, formatDateTime } from "../lib/format";
import { getStorageStatus, requestPersistentStorage, type StorageStatus } from "../lib/storage";
import {
  CSV_TABLES, MAX_BACKUP_BYTES, clearUserData, createBackup, exportCsv, importBackup, validateBackup, type ImportMode, type PreviewResult,
} from "../services/backup";
import { DEFAULT_BACKUP_REMINDER_DAYS, SETTING_KEYS, getSetting, setSetting } from "../services/settings";
import { AuthShell } from "./AuthPages";

/** File chooser -> validation preview -> confirmed import. Used on the Backup page and on the empty-device restore screen. */
function RestoreForm({ targetUserId, onDone }: { targetUserId: string | null; onDone: () => void }) {
  const { run, confirm, toast } = useUi();
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [mode, setMode] = useState<ImportMode>("skip");
  const [checking, setChecking] = useState(false);

  async function pick(file: File | undefined) {
    setPreview(null);
    if (!file) return;
    if (file.size > MAX_BACKUP_BYTES) {
      toast("That file is too large to be a backup of this app.", "error");
      return;
    }
    setChecking(true);
    try {
      setPreview(await validateBackup(await file.text()));
    } catch {
      toast("The file could not be read.", "error");
    } finally {
      setChecking(false);
    }
  }

  async function doImport() {
    if (!preview?.ok) return;
    const msg =
      mode === "replace" ? (
        <p>
          <strong>Replace</strong> deletes all current data in this account first, then loads the backup. This cannot be undone.
        </p>
      ) : mode === "overwrite" ? (
        <p>
          Records that exist in both will be <strong>overwritten</strong> with the backup version ({preview.duplicates} matching records).
        </p>
      ) : (
        <p>Records that already exist ({preview.duplicates}) will be kept; only missing records are added.</p>
      );
    const ok = await confirm({
      title: "Restore this backup?",
      message: (
        <>
          <p>
            {preview.summary?.total} records from a backup made {preview.exportedAt ? formatDateTime(Date.parse(preview.exportedAt)) : "at an unknown time"}.
          </p>
          {msg}
          <p className="muted">The import is all-or-nothing: if anything fails, no data is changed. Download a backup of the current data first if unsure.</p>
        </>
      ),
      confirmLabel: "Restore",
      danger: mode === "replace",
    });
    if (!ok) return;
    let summary = "";
    const done = await run(async () => {
      const r = await importBackup(preview, mode, targetUserId);
      summary = `Restore complete: ${r.added} added, ${r.updated} updated, ${r.skipped} skipped.`;
    });
    if (done) {
      toast(summary, "success");
      setPreview(null);
      onDone();
    }
  }

  return (
    <div>
      <input
        type="file"
        accept="application/json,.json"
        aria-label="Choose backup file"
        onChange={(e) => {
          void pick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {checking && <p className="muted">Checking file...</p>}
      {preview && !preview.ok && (
        <div className="notice bad mt" role="alert">
          <strong>This file cannot be imported.</strong>
          <ul>{preview.errors.map((m, i) => <li key={i}>{m}</li>)}</ul>
        </div>
      )}
      {preview?.ok && (
        <div className="mt">
          <div className="notice ok">
            Valid backup ({preview.scope === "device" ? "all accounts" : "one account"}), exported {preview.exportedAt ? formatDateTime(Date.parse(preview.exportedAt)) : "(unknown date)"}.
            {" "}Contains {preview.summary?.total} records; {preview.duplicates} already exist on this device.
            {preview.userEmails && preview.userEmails.length > 0 && <> Accounts: {preview.userEmails.join(", ")}.</>}
          </div>
          {preview.errors.length > 0 && (
            <div className="notice warn">
              <ul>{preview.errors.map((m, i) => <li key={i}>{m}</li>)}</ul>
            </div>
          )}
          <fieldset style={{ border: 0, padding: 0, margin: "0 0 1rem" }}>
            <legend style={{ fontWeight: 600, marginBottom: ".4rem" }}>If a record already exists</legend>
            {(
              [
                ["skip", "Keep existing records, add only missing ones (safest)"],
                ["overwrite", "Overwrite existing records with the backup version"],
                ...(targetUserId ? [["replace", "Replace everything in this account with the backup"]] : []),
              ] as Array<[ImportMode, string]>
            ).map(([v, label]) => (
              <label key={v} className="check">
                <input type="radio" name="mode" checked={mode === v} onChange={() => setMode(v)} /> {label}
              </label>
            ))}
          </fieldset>
          <button type="button" className="btn primary" onClick={doImport}>
            Restore backup
          </button>
        </div>
      )}
    </div>
  );
}

export function RestorePage() {
  const { userCount, loading, reloadCount } = useAuth();
  const nav = useNavigate();
  if (loading) return null;
  if (userCount > 0) return <Navigate to="/login" replace />;
  return (
    <AuthShell title="Restore from backup">
      <p>
        Choose a backup file exported from this app. It restores the account(s) and all data so you can log in with the
        same email and password.
      </p>
      <RestoreForm
        targetUserId={null}
        onDone={() => {
          void reloadCount().then(() => nav("/login"));
        }}
      />
    </AuthShell>
  );
}

export function BackupPage() {
  const user = useUser();
  const { run, confirm, toast } = useUi();
  const { logout } = useAuth();
  const [storage, setStorage] = useState<StorageStatus | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [eraseText, setEraseText] = useState("");

  const last = useLiveQuery(() => getSetting<number | null>(user.id, SETTING_KEYS.lastBackupAt, null), [user.id, reloadKey]);
  const days = useLiveQuery(() => getSetting<number>(user.id, SETTING_KEYS.backupReminderDays, DEFAULT_BACKUP_REMINDER_DAYS), [user.id]);
  useEffect(() => {
    void getStorageStatus().then(setStorage);
  }, [reloadKey]);

  async function download(scope: "user" | "device") {
    setBusy(true);
    await run(async () => {
      const b = await createBackup(user.id, scope);
      downloadText(b.filename, b.json, "application/json");
      toast(`Backup downloaded (${b.summary.total} records). Keep the file somewhere safe, such as cloud storage or a USB drive.`, "success");
      setReloadKey((k) => k + 1);
    });
    setBusy(false);
  }

  async function csv(table: (typeof CSV_TABLES)[number]) {
    await run(async () => {
      const text = await exportCsv(user.id, table.table);
      downloadText(`srgpl-${table.table}.csv`, text, "text/csv", true);
    });
  }

  async function persist() {
    const ok = await requestPersistentStorage();
    toast(ok ? "Persistent storage granted." : "The browser did not grant persistent storage. Keep regular backups.", ok ? "success" : "info");
    setReloadKey((k) => k + 1);
  }

  async function erase() {
    const ok = await confirm({
      title: "Erase all my data?",
      danger: true,
      confirmLabel: "Erase everything",
      message: <p>All customers, sales, stock, credits and every other record in this account will be permanently deleted from this device. Your login stays.</p>,
    });
    if (!ok) return;
    if (await run(() => clearUserData(user.id), "All data erased.")) setEraseText("");
  }

  const stale = last === null || (last !== undefined && Date.now() - last > (days ?? DEFAULT_BACKUP_REMINDER_DAYS) * 86_400_000);

  return (
    <>
      <PageHeader title="Backup & Restore" subtitle="Your data lives only in this browser. Backups are your safety net." />

      <div className={`notice ${stale ? "warn" : "ok"}`}>
        {last ? <>Last backup: {formatDateTime(last)}.</> : <>No backup has been made yet.</>}
        {stale && " A new backup is recommended."}
      </div>

      <div className="card">
        <h2>Download a backup</h2>
        <p>
          A single JSON file with all your records. It includes your account login (as a salted password hash, never the
          plain password) so it can be restored on another device. Treat the file as private.
        </p>
        <div className="row">
          <button type="button" className="btn primary" disabled={busy} onClick={() => download("user")}>
            Download my backup
          </button>
          {user.role === "owner" && (
            <button type="button" className="btn" disabled={busy} onClick={() => download("device")}>
              Download all accounts on this device
            </button>
          )}
        </div>
        <div className="row mt" style={{ maxWidth: 360 }}>
          <Field
            label="Remind me after (days)"
            name="days"
            type="number"
            step="1"
            min={1}
            value={String(days ?? DEFAULT_BACKUP_REMINDER_DAYS)}
            onChange={(v) => {
              const n = Math.max(1, Math.min(365, Math.floor(Number(v) || DEFAULT_BACKUP_REMINDER_DAYS)));
              void setSetting(user.id, SETTING_KEYS.backupReminderDays, n);
            }}
          />
        </div>
      </div>

      <div className="card">
        <h2>Restore a backup</h2>
        <p>Import a backup file into this account. The file is validated and previewed first; nothing changes until you confirm.</p>
        <RestoreForm targetUserId={user.id} onDone={() => setReloadKey((k) => k + 1)} />
      </div>

      <div className="card">
        <h2>Export to CSV (Excel)</h2>
        <p className="muted">CSV files are for reading in a spreadsheet. They cannot be restored; use the JSON backup for that.</p>
        <div className="row">
          {CSV_TABLES.map((t) => (
            <button key={t.table} type="button" className="btn sm" onClick={() => csv(t)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>Storage on this device</h2>
        {storage && !storage.supported && <p>This browser does not report storage information.</p>}
        {storage?.supported && (
          <dl className="kv">
            <dt>Protected from automatic clean-up</dt>
            <dd>{storage.persisted ? "Yes" : "No"}</dd>
            <dt>Used</dt>
            <dd>
              {formatBytes(storage.usage)} of about {formatBytes(storage.quota)}
            </dd>
          </dl>
        )}
        {storage && !storage.persisted && (
          <p className="mt">
            Without protection the browser may delete the data when the device is low on space.{" "}
            <button type="button" className="btn sm" onClick={persist}>
              Request persistent storage
            </button>
          </p>
        )}
        <div className="notice warn mt">
          Data can still be lost if you clear browser data, use a private window, uninstall the browser or reset the device.
          It is <strong>not</strong> synced to any server.
        </div>
      </div>

      <div className="card">
        <h2>Danger zone</h2>
        <p>
          Erase all records in this account (customers, sales, stock...). Type <strong>ERASE</strong> to enable the button.
        </p>
        <div className="row">
          <input aria-label="Type ERASE to confirm" style={{ maxWidth: 200 }} value={eraseText} onChange={(e) => setEraseText(e.target.value)} />
          <button type="button" className="btn danger" disabled={eraseText !== "ERASE"} onClick={erase}>
            Erase my data
          </button>
          <button type="button" className="btn" onClick={logout}>
            Log out
          </button>
        </div>
      </div>
    </>
  );
}
