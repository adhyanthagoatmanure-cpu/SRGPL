import { Suspense, lazy } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Loading } from "./components/ui";
import { useAuth } from "./context/AuthContext";
import { BackupPage, RestorePage } from "./pages/BackupPages";
import { LoginPage, RegisterPage } from "./pages/AuthPages";

const Dashboard = lazy(() => import("./pages/DashboardPage"));
const Customers = lazy(() => import("./pages/CustomersPage"));
const Orders = lazy(() => import("./pages/OrdersPage"));
const Sales = lazy(() => import("./pages/SalesPage"));
const Returns = lazy(() => import("./pages/ReturnsPage"));
const Stocks = lazy(() => import("./pages/StocksPage"));
const Expenses = lazy(() => import("./pages/ExpensesPage"));
const Purchases = lazy(() => import("./pages/PurchasesPage"));
const Credits = lazy(() => import("./pages/CreditsPage"));
const Services = lazy(() => import("./pages/ServicesPage"));
const Recharge = lazy(() => import("./pages/RechargePage"));
const Daily = lazy(() => import("./pages/DailyPage"));
const Withdraw = lazy(() => import("./pages/WithdrawPage"));
const Cash = lazy(() => import("./pages/CashPage"));
const Overview = lazy(() => import("./pages/OverviewPage"));
const Profile = lazy(() => import("./pages/ProfilePage"));
const Accounts = lazy(() => import("./pages/AccountsPage"));

function Protected() {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  return <Layout />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/restore" element={<RestorePage />} />
          <Route element={<Protected />}>
            <Route index element={<Dashboard />} />
            <Route path="customers" element={<Customers />} />
            <Route path="orders" element={<Orders />} />
            <Route path="sales" element={<Sales />} />
            <Route path="returns" element={<Returns />} />
            <Route path="stocks" element={<Stocks />} />
            <Route path="expenses" element={<Expenses />} />
            <Route path="purchases" element={<Purchases />} />
            <Route path="credits" element={<Credits />} />
            <Route path="services" element={<Services />} />
            <Route path="recharge" element={<Recharge />} />
            <Route path="daily" element={<Daily />} />
            <Route path="withdraw" element={<Withdraw />} />
            <Route path="cash" element={<Cash />} />
            <Route path="overview" element={<Overview />} />
            <Route path="backup" element={<BackupPage />} />
            <Route path="profile" element={<Profile />} />
            <Route path="accounts" element={<Accounts />} />
            <Route path="*" element={<div className="empty card"><strong>Page not found</strong></div>} />
          </Route>
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
