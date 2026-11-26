import { useEffect, useId, useRef, type FormEvent, type ReactNode } from "react";

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}

/** Native <dialog> modal: focus trapping, Escape to close and inert background are handled by the browser. */
export function Modal({ open, title, onClose, children, footer, wide }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  if (!open) return <dialog ref={ref} className="modal" aria-hidden="true" />;
  return (
    <dialog
      ref={ref}
      className={`modal${wide ? " wide" : ""}`}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="modal-head">
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
          &times;
        </button>
      </div>
      <div className="modal-body">{children}</div>
      {footer && <div className="modal-foot">{footer}</div>}
    </dialog>
  );
}

interface FormModalProps<T> {
  open: boolean;
  title: string;
  onClose: () => void;
  /** Receives the raw form values. Return true (or resolve true) to close the dialog. */
  onSubmit: (values: T) => Promise<boolean> | boolean;
  submitLabel?: string;
  children: ReactNode;
  wide?: boolean;
}

export function formValues(form: HTMLFormElement): Record<string, string> {
  const out: Record<string, string> = {};
  new FormData(form).forEach((v, k) => {
    if (typeof v === "string") out[k] = v;
  });
  return out;
}

/** A modal containing a form. Prevents double submits; the dialog stays open when the action fails. */
export function FormModal<T extends object = Record<string, string>>({ open, title, onClose, onSubmit, submitLabel = "Save", children, wide }: FormModalProps<T>) {
  const busy = useRef(false);
  const formId = useId();
  async function handle(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy.current) return;
    busy.current = true;
    const btn = e.currentTarget.querySelector<HTMLButtonElement>("button[type=submit]") ?? document.querySelector<HTMLButtonElement>(`button[form="${formId}"]`);
    if (btn) btn.disabled = true;
    try {
      if (await onSubmit(formValues(e.currentTarget) as T)) onClose();
    } finally {
      busy.current = false;
      if (btn) btn.disabled = false;
    }
  }
  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      wide={wide}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form={formId} className="btn primary">
            {submitLabel}
          </button>
        </>
      }
    >
      <form id={formId} onSubmit={handle} noValidate={false} autoComplete="off">
        {children}
      </form>
    </Modal>
  );
}
