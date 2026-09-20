import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  AlertCircle,
  ArrowUpRight,
  Check,
  CheckCheck,
  Clock3,
  FileCheck2,
  FileText,
  LoaderCircle,
  PackageCheck,
  Send,
  X,
} from "lucide-react";
import type { CaseStatus, Evidence, InvoiceLine } from "../shared/types";
import { readSession } from "./api";

export const statusLabels: Record<CaseStatus, string> = {
  draft: "Needs review",
  ready: "Ready to share",
  shared: "Awaiting supplier",
  responded: "Response received",
  closed: "Acknowledged",
};
export function Status({ status }: { status: CaseStatus }) {
  const Icon = {
    draft: Clock3,
    ready: FileCheck2,
    shared: Send,
    responded: CheckCheck,
    closed: PackageCheck,
  }[status];
  return (
    <span className={`status status-${status}`}>
      <Icon size={13} />
      {statusLabels[status]}
    </span>
  );
}
export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <span className="loading-inline" role="status">
      <LoaderCircle size={18} className="spin" />
      {label}
    </span>
  );
}
export function ErrorBox({
  error,
  retry,
}: {
  error: string;
  retry?: () => void;
}) {
  return (
    <div className="notice notice-error" role="alert">
      <AlertCircle size={19} />
      <div>
        {error}
        {retry && (
          <button className="text-button" onClick={retry}>
            Try again <ArrowUpRight size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
export function Modal({
  title,
  eyebrow,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    dialog.current?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);
  return (
    <dialog
      className={`modal ${wide ? "modal-wide" : ""}`}
      ref={dialog}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target !== e.currentTarget) return;
        const rect = e.currentTarget.getBoundingClientRect();
        if (
          e.clientX < rect.left ||
          e.clientX > rect.right ||
          e.clientY < rect.top ||
          e.clientY > rect.bottom
        )
          onClose();
      }}
      aria-labelledby={titleId}
    >
      <div className="modal-heading">
        <div>
          {eyebrow && <div className="eyebrow">{eyebrow}</div>}
          <h2 id={titleId}>{title}</h2>
        </div>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function CopyButton({
  value,
  label = "Copy",
}: {
  value: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <button
      className="button button-secondary"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          setFailed(true);
        }
      }}
    >
      {copied ? (
        <>
          <Check size={16} />
          Copied
        </>
      ) : failed ? (
        "Select and copy the text"
      ) : (
        label
      )}
    </button>
  );
}
export function EvidencePreview({
  evidence,
  line,
  token,
  compact = false,
}: {
  evidence?: Evidence;
  line?: InvoiceLine;
  token?: string;
  compact?: boolean;
}) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    let objectUrl = "";
    setUrl("");
    setError("");
    if (!evidence) return;
    if (evidence.url.startsWith("/sample-")) {
      setUrl(evidence.url);
      return;
    }
    fetch(`/api/evidence/${evidence.id}`, {
      headers: { Authorization: `Bearer ${token || readSession()?.token}` },
    })
      .then(async (r) => {
        if (!r.ok) throw new Error("Preview unavailable");
        return r.blob();
      })
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        if (alive) setUrl(objectUrl);
      })
      .catch(() => {
        if (alive) setError("This file could not be previewed.");
      });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [evidence?.id, evidence?.url, token]);
  if (!evidence)
    return (
      <div className="preview-empty">
        <FileText size={32} strokeWidth={1.2} />
        <h4>Every detail, backed by evidence.</h4>
        <p>
          Upload the original invoice to keep the document alongside your
          receiving record.
        </p>
      </div>
    );
  if (error)
    return (
      <div className="preview-empty">
        <AlertCircle size={24} />
        <p>{error}</p>
      </div>
    );
  if (!url)
    return (
      <div className="preview-empty">
        <Spinner label="Loading document…" />
      </div>
    );
  return (
    <div className={`evidence-preview ${compact ? "compact" : ""}`}>
      {evidence.mimeType === "application/pdf" ? (
        <>
          <iframe title={evidence.fileName} src={url} />
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="text-button"
          >
            Open PDF <ArrowUpRight size={13} />
          </a>
        </>
      ) : (
        <div className="image-source">
          <img
            src={url}
            alt={evidence.fileName}
            onError={() =>
              setError(
                "This image could not be displayed. Try refreshing the record.",
              )
            }
          />
          {line?.source && (
            <div
              className="source-box"
              title={
                evidence.url.startsWith("/sample-")
                  ? "Synthetic sample source row"
                  : `Source row · ${Math.round(line.source.confidence)}% extraction confidence`
              }
              style={{
                left: `${line.source.left * 100}%`,
                top: `${line.source.top * 100}%`,
                width: `${line.source.width * 100}%`,
                height: `${line.source.height * 100}%`,
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
