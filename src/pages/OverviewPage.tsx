import { DataTable } from "../components/DataTable";
import { PageHeader, RangeFilter, useRange } from "../components/ui";
import { useLive } from "../hooks";
import { formatDate, formatMoney, sum } from "../lib/format";
import { listExpenses } from "../services/expenses";
import { computeOverview } from "../services/overview";
import { purchaseHistory } from "../services/purchases";
import { listSales } from "../services/sales";
import { serviceHistory } from "../services/jobs";

export default function OverviewPage() {
  const [range, setRange] = useRange("today");
  const ov = useLive((id) => computeOverview(id, range.from, range.to), [range.from, range.to]);
  const sales = useLive((id) => listSales(id, range), [range.from, range.to]);
  const expenses = useLive((id) => listExpenses(id, range), [range.from, range.to]);
  const purchases = useLive(async (id) => (await purchaseHistory(id)).filter((h) => h.kind === "purchase" && (!range.from || h.date >= range.from) && (!range.to || h.date <= range.to)), [range.from, range.to]);
  const services = useLive(async (id) => (await serviceHistory(id)).filter((h) => (h.paid > 0 || h.returnAmount > 0) && (!range.from || h.date >= range.from) && (!range.to || h.date <= range.to)), [range.from, range.to]);

  return (
    <>
      <PageHeader title="Daily Overview" subtitle="Money position for the selected dates" />
      <RangeFilter range={range} onChange={setRange} />
      <div className="card">
        <h2>Cash summary</h2>
        {!ov ? (
          <div className="loading"><div className="spinner" /></div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <tbody>
                {ov.lines.map((l) => (
                  <tr key={l.key}>
                    <td>{l.label}</td>
                    <td className={`right ${l.amount ? (l.sign > 0 ? "line-pos" : "line-neg") : ""}`}>
                      {l.sign > 0 ? "+" : "\u2212"} {formatMoney(l.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td className="right overview-total">{formatMoney(ov.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <p className="muted mt">
          Total = sales &minus; expenses + service money received &minus; service refunds &minus; purchases paid + credit collected &minus; credit given + cash in hand &minus; sale returns + recharge amount + cash commission &minus; bank commission &minus; UPI withdrawals.
        </p>
      </div>

      <h2>Sales</h2>
      <DataTable
        rows={sales}
        rowKey={(s) => s.id}
        emptyTitle="No sales"
        columns={[
          { header: "Date", cell: (s) => formatDate(s.date) },
          { header: "Item", cell: (s) => s.itemName },
          { header: "Qty", cell: (s) => s.quantity, className: "right" },
          { header: "Amount", cell: (s) => formatMoney(s.price), className: "right", footer: formatMoney(sum(sales ?? [], (s) => s.price)) },
        ]}
      />
      <h2 className="mt">Expenses</h2>
      <DataTable
        rows={expenses}
        rowKey={(e) => e.id}
        emptyTitle="No expenses"
        columns={[
          { header: "Date", cell: (e) => formatDate(e.date) },
          { header: "Category", cell: (e) => e.itemName },
          { header: "Amount", cell: (e) => formatMoney(e.amount), className: "right", footer: formatMoney(sum(expenses ?? [], (e) => e.amount)) },
        ]}
      />
      <h2 className="mt">Purchases (bought on credit)</h2>
      <DataTable
        rows={purchases}
        rowKey={(p) => p.id}
        emptyTitle="No purchases"
        columns={[
          { header: "Date", cell: (p) => formatDate(p.date) },
          { header: "Shop", cell: (p) => p.shopName },
          { header: "Details", cell: (p) => p.particular || "\u2014" },
          { header: "Amount", cell: (p) => formatMoney(p.amount), className: "right", footer: formatMoney(sum(purchases ?? [], (p) => p.amount)) },
        ]}
      />
      <h2 className="mt">Service jobs</h2>
      <DataTable
        rows={services}
        rowKey={(s) => s.id}
        emptyTitle="No service payments"
        columns={[
          { header: "Date", cell: (s) => formatDate(s.date) },
          { header: "Customer", cell: (s) => s.customerName },
          { header: "Status", cell: (s) => s.status },
          { header: "Received", cell: (s) => formatMoney(s.paid), className: "right", footer: formatMoney(sum(services ?? [], (s) => s.paid)) },
          { header: "Refunded", cell: (s) => formatMoney(s.returnAmount), className: "right", footer: formatMoney(sum(services ?? [], (s) => s.returnAmount)) },
        ]}
      />
    </>
  );
}
