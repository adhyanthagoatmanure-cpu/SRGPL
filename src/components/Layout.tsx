import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth, useUser } from "../context/AuthContext";
import { PwaStatus } from "./PwaStatus";

interface NavItem {
  to: string;
  label: string;
  ownerOnly?: boolean;
}

const NAV: Array<{ group: string; items: NavItem[] }> = [
  { group: "Overview", items: [{ to: "/", label: "Dashboard" }, { to: "/overview", label: "Daily Overview" }] },
  {
    group: "Sales",
    items: [
      { to: "/sales", label: "Sales" },
      { to: "/returns", label: "Sale Returns" },
      { to: "/stocks", label: "Stocks" },
      { to: "/orders", label: "Orders" },
      { to: "/customers", label: "Customers" },
    ],
  },
  {
    group: "Money",
    items: [
      { to: "/credits", label: "Credits" },
      { to: "/purchases", label: "Purchases" },
      { to: "/expenses", label: "Expenses" },
      { to: "/cash", label: "Cash in Hand" },
    ],
  },
  {
    group: "Recharge & Services",
    items: [
      { to: "/recharge", label: "Recharge" },
      { to: "/daily", label: "Daily Transactions" },
      { to: "/withdraw", label: "UPI Withdraw" },
      { to: "/services", label: "Service Jobs" },
    ],
  },
  {
    group: "Account",
    items: [
      { to: "/backup", label: "Backup & Restore" },
      { to: "/profile", label: "Profile" },
      { to: "/accounts", label: "Accounts", ownerOnly: true },
    ],
  },
];

export function Layout() {
  const user = useUser();
  const { logout } = useAuth();
  const [open, setOpen] = useState(false);
  const loc = useLocation();

  useEffect(() => setOpen(false), [loc.pathname]);

  return (
    <div className="shell">
      <aside className={`sidebar${open ? " open" : ""}`} aria-label="Main navigation">
        <div className="brand">
          <img src="/logo.png" alt="" />
          <span>SRGPL Manager</span>
        </div>
        <nav>
          <ul className="nav">
            {NAV.map((g) => {
              const items = g.items.filter((i) => !i.ownerOnly || user.role === "owner");
              return (
                <li key={g.group}>
                  <div className="group">{g.group}</div>
                  <ul className="nav">
                    {items.map((i) => (
                      <li key={i.to}>
                        <NavLink to={i.to} end={i.to === "/"}>
                          {i.label}
                        </NavLink>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>
      <div className={`scrim${open ? " open" : ""}`} onClick={() => setOpen(false)} aria-hidden="true" />
      <div className="main">
        <PwaStatus />
        <header className="topbar">
          <button type="button" className="btn menu-btn" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)}>
            Menu
          </button>
          <div className="who">
            <strong>{user.shopName}</strong>
            <br />
            <span className="muted">{user.email}</span>
          </div>
          <button type="button" className="btn sm" onClick={logout}>
            Log out
          </button>
        </header>
        <main className="content" id="main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
