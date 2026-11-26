import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { errorMessage } from "../lib/errors";
import { Modal } from "../components/Modal";

type ToastKind = "success" | "error" | "info";
interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
}

export interface ConfirmOptions {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
}

interface UiApi {
  toast: (text: string, kind?: ToastKind) => void;
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  /** Run an async action; shows a success toast or the error message. Returns true when it succeeded. */
  run: (fn: () => Promise<unknown>, successText?: string) => Promise<boolean>;
}

const Ctx = createContext<UiApi | null>(null);

export function UiProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [pending, setPending] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback(
    (text: string, kind: ToastKind = "info") => {
      const id = nextId.current++;
      setToasts((t) => [...t.slice(-3), { id, kind, text }]);
      setTimeout(() => dismiss(id), kind === "error" ? 8000 : 4000);
    },
    [dismiss],
  );
  const confirm = useCallback((opts: ConfirmOptions) => new Promise<boolean>((resolve) => setPending({ ...opts, resolve })), []);
  const run = useCallback(
    async (fn: () => Promise<unknown>, successText?: string) => {
      try {
        await fn();
        if (successText) toast(successText, "success");
        return true;
      } catch (err) {
        toast(errorMessage(err), "error");
        return false;
      }
    },
    [toast],
  );

  const api = useMemo<UiApi>(() => ({ toast, confirm, run }), [toast, confirm, run]);
  const answer = (v: boolean) => {
    pending?.resolve(v);
    setPending(null);
  };

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            <span>{t.text}</span>
            <button type="button" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
              &times;
            </button>
          </div>
        ))}
      </div>
      <Modal
        open={pending !== null}
        title={pending?.title ?? ""}
        onClose={() => answer(false)}
        footer={
          <>
            <button type="button" className="btn" onClick={() => answer(false)}>
              Cancel
            </button>
            <button type="button" className={`btn ${pending?.danger ? "danger" : "primary"}`} onClick={() => answer(true)}>
              {pending?.confirmLabel ?? "Confirm"}
            </button>
          </>
        }
      >
        {pending?.message}
      </Modal>
    </Ctx.Provider>
  );
}

export function useUi(): UiApi {
  const v = useContext(Ctx);
  if (!v) throw new Error("useUi must be used inside UiProvider");
  return v;
}
