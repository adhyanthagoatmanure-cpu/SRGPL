import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import { UiProvider } from "./context/UiContext";
import { db } from "./db/db";
import "./styles/index.css";

const root = createRoot(document.getElementById("root")!);

function DbError({ message }: { message: string }) {
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <h1>Storage is not available</h1>
        <div className="notice bad" role="alert">
          This app keeps all data in your browser&apos;s IndexedDB, but it could not be opened ({message}).
        </div>
        <p>
          Private/incognito windows, blocked site data, or a full disk can cause this. Allow site data for this site, free some disk space and reload. Your existing
          data is not deleted by this error.
        </p>
        <button className="btn primary" onClick={() => location.reload()}>
          Reload
        </button>
      </div>
    </div>
  );
}

db.open().then(
  () =>
    root.render(
      <StrictMode>
        <UiProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </UiProvider>
      </StrictMode>,
    ),
  (err: unknown) => root.render(<DbError message={err instanceof Error ? err.message : "unknown error"} />),
);
