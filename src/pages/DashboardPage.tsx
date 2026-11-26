import { useEffect } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "../components/ui";
import { useUser } from "../context/AuthContext";
import { useLive } from "../hooks";
import { formatMoney } from "../lib/format";
import { today } from "../lib/ids";
import { requestPersistentStorage } from "../lib/storage";
import { dashboardStats } from "../services/overview";
import { DEFAULT_BACKUP_REMINDER_DAYS, SETTING_KEYS, getSetting, setSetting } from "../services/settings";

const QUICK = [
  { to: "/sales", label: "New sale" },
  { to: "/recharge", label: "New recharge" },
  { to: "/withdraw", label: "UPI withdraw" },
  { to: "/expenses", label: "New expense" },
  { to: "/orders", label: "New order" },
  { to: "/services", label: "New service job" },
  { to: "/credits", label: "Credits" },
  { to: "/stocks", label: "Stocks" },
];

export default function DashboardPage() {
  const user = useUser();
  const date = today();
  useEffect(() => {
    (async () => {
      if (await getSetting(user.id, SETTING_KEYS.persistRequested, false)) return;
      await requestPersistentStorage();
      await setSetting(user.id, SETTING_KEYS.persistRequested, true);
    })().catch(() => undefined);
  }, [user.id]);
  const stats = useLive((id) => dashboardStats(id, date), [date]);
  const backup = useLive(async (id) => ({
    last: await getSetting<number | null>(id, SETTING_KEYS.lastBackupAt, null),
    days: await getSetting<number>(id, SETTING_KEYS.backupReminderDays, DEFAULT_BACKUP_REMINDER_DAYS),
  }));
  const stale = backup && (backup.last === null || Date.now() - backup.last > backup.days * 86_400_000);

  return (
    <>
      <PageHeader title={`Welcome, ${user.shopName}`} subtitle="Today's snapshot. Everything is stored on this device." />
      {stale && stats?.hasAnyData && (
        <div className="notice warn" role="alert">
          {backup.last === null ? "You have not made a backup yet." : "Your last backup is older than your reminder limit."} Data is stored only in this browser, so please{" "}
          <Link to="/backup">download a backup</Link>.
        </div>
      )}
      {stats && !stats.hasAnyData && (
        <div className="notice info">
          Nothing recorded yet. Start by adding <Link to="/stocks">stock items</Link>, <Link to="/recharge">networks</Link> or <Link to="/customers">customers</Link>.
        </div>
      )}
      <div className="stats">
        <div className="stat accent">
          <div className="label">Today&apos;s total</div>
          <div className="value">{stats ? formatMoney(stats.overview.total) : "\u2026"}</div>
        </div>
        <div className="stat good">
          <div className="label">Sales today</div>
          <div className="value">{stats ? formatMoney(stats.salesToday) : "\u2026"}</div>
        </div>
        <div className="stat bad">
          <div className="label">Expenses today</div>
          <div className="value">{stats ? formatMoney(stats.expensesToday) : "\u2026"}</div>
        </div>
        <div className="stat">
          <div className="label">To collect (credits)</div>
          <div className="value">{stats ? formatMoney(stats.creditOutstanding) : "\u2026"}</div>
        </div>
        <div className="stat">
          <div className="label">Owed to shops</div>
          <div className="value">{stats ? formatMoney(stats.purchaseOwed) : "\u2026"}</div>
        </div>
        <div className="stat">
          <div className="label">Open orders</div>
          <div className="value">{stats?.pendingOrders ?? "\u2026"}</div>
        </div>
        <div className="stat">
          <div className="label">Open service jobs</div>
          <div className="value">{stats?.openServices ?? "\u2026"}</div>
        </div>
        <div className={`stat${stats && stats.lowStock > 0 ? " bad" : ""}`}>
          <div className="label">Low stock items</div>
          <div className="value">{stats?.lowStock ?? "\u2026"}</div>
        </div>
        <div className="stat">
          <div className="label">Customers</div>
          <div className="value">{stats?.customers ?? "\u2026"}</div>
        </div>
      </div>
      <div className="card">
        <h2>Quick actions</h2>
        <div className="row">
          {QUICK.map((q) => (
            <Link key={q.to} className="btn" to={q.to}>
              {q.label}
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
