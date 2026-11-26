import { useEffect, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

/** Offline indicator, "update available" prompt, "ready to work offline" notice and install button. */
export function PwaStatus() {
  const online = useOnline();
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      // Look for a new version every hour while the app stays open.
      if (reg) setInterval(() => void reg.update().catch(() => undefined), 60 * 60 * 1000);
    },
  });
  const [installEvt, setInstallEvt] = useState<InstallEvent | null>(null);

  useEffect(() => {
    const h = (e: Event) => {
      e.preventDefault();
      setInstallEvt(e as InstallEvent);
    };
    const done = () => setInstallEvt(null);
    window.addEventListener("beforeinstallprompt", h);
    window.addEventListener("appinstalled", done);
    return () => {
      window.removeEventListener("beforeinstallprompt", h);
      window.removeEventListener("appinstalled", done);
    };
  }, []);

  return (
    <div>
      {!online && (
        <div className="banner offline" role="status">
          You are offline. The app keeps working and all data is saved on this device.
        </div>
      )}
      {needRefresh && (
        <div className="banner update" role="alert">
          A new version is available. Your data is stored on this device and is not affected by the update.
          <button type="button" className="btn" onClick={() => void updateServiceWorker(true)}>
            Update now
          </button>
          <button type="button" className="btn" onClick={() => setNeedRefresh(false)}>
            Later
          </button>
        </div>
      )}
      {offlineReady && (
        <div className="banner ready" role="status">
          Ready to work offline.
          <button type="button" className="btn" onClick={() => setOfflineReady(false)}>
            OK
          </button>
        </div>
      )}
      {installEvt && (
        <div className="banner ready">
          Install this app on your device for quick access.
          <button
            type="button"
            className="btn"
            onClick={async () => {
              await installEvt.prompt();
              await installEvt.userChoice;
              setInstallEvt(null);
            }}
          >
            Install
          </button>
          <button type="button" className="btn" onClick={() => setInstallEvt(null)}>
            Not now
          </button>
        </div>
      )}
    </div>
  );
}
