import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Camera,
  Check,
  CheckCheck,
  ChevronDown,
  ClipboardCheck,
  Cloud,
  Download,
  FileCheck2,
  FileText,
  History,
  ImagePlus,
  Link,
  LoaderCircle,
  LockKeyhole,
  Mail,
  MoreHorizontal,
  Package,
  Plus,
  Printer,
  RefreshCw,
  Save,
  ScanLine,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import type {
  Evidence,
  ExtractionResult,
  Health,
  InvoiceLine,
  ReceivingCase,
  ShareResult,
} from "../shared/types";
import { reconcileCase, requiresPackSize } from "../shared/domain";
import RevisionHistory from "./RevisionHistory";
import {
  api,
  ApiError,
  date,
  downloadCase,
  errorMessage,
  money,
  post,
  uploadFile,
} from "./api";
import {
  CopyButton,
  ErrorBox,
  EvidencePreview,
  Modal,
  Spinner,
  Status,
} from "./ui";

const editable = (record: ReceivingCase) => ({
  supplier: record.supplier,
  supplierEmail: record.supplierEmail,
  shopName: record.shopName,
  invoiceNumber: record.invoiceNumber,
  invoiceDate: record.invoiceDate,
  lines: record.lines,
});
const emptyLine = (): InvoiceLine => ({
  id: crypto.randomUUID(),
  description: "",
  sku: "",
  billedQty: null,
  billedUnit: "unknown",
  packSize: null,
  receivedQty: null,
  damagedQty: 0,
  wrongQty: 0,
  unitPriceMinor: null,
  confirmed: false,
  note: "",
});

export default function CaseDetail({
  caseId,
  onChange,
  navigate,
  notify,
  health,
}: {
  caseId: string;
  onChange: (record: ReceivingCase) => void;
  navigate: (to: string, discardConfirmed?: boolean) => void;
  notify: (text: string) => void;
  health: Health | null;
}) {
  const [saved, setSaved] = useState<ReceivingCase | null>(null);
  const [draft, setDraft] = useState<ReceivingCase | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [tab, setTab] = useState("review");
  const [selected, setSelected] = useState<string | null>(null);
  const [share, setShare] = useState<ShareResult | null>(null);
  const [extraction, setExtraction] = useState<ExtractionResult | null>(null);
  const [summary, setSummary] = useState<{
    summary: string;
    provider: string;
  } | null>(null);
  const [fileKind, setFileKind] = useState<"invoice" | "photo">("invoice");
  const [fileLine, setFileLine] = useState<string | undefined>();
  const [metadata, setMetadata] = useState(false);
  const [removeLine, setRemoveLine] = useState<string | null>(null);
  const [leaveTo, setLeaveTo] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [showValidation, setShowValidation] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const closed = saved?.status === "closed";
  const dirty = !!(
    draft &&
    saved &&
    JSON.stringify(editable(draft)) !== JSON.stringify(editable(saved))
  );
  const reconciliation = useMemo(
    () => (draft ? reconcileCase(draft) : null),
    [draft],
  );
  function accept(record: ReceivingCase) {
    setSaved(record);
    setDraft(record);
    onChange(record);
  }
  async function refresh() {
    const record = await api<ReceivingCase>(`/cases/${caseId}`);
    accept(record);
    return record;
  }
  useEffect(() => {
    setSaved(null);
    setDraft(null);
    setError("");
    setSummary(null);
    refresh().catch((e) => setError(errorMessage(e)));
  }, [caseId]);
  useEffect(() => {
    if (!dirty) return;
    const listener = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    addEventListener("beforeunload", listener);
    return () => removeEventListener("beforeunload", listener);
  }, [dirty]);
  useEffect(() => {
    if (!dirty) return;
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<{ to: string; probe?: boolean }>)
        .detail;
      const destination = detail?.to;
      if (!destination) return;
      event.preventDefault();
      if (detail.probe) return;
      setLeaveTo(destination);
    };
    window.addEventListener("receiverright:navigate", listener);
    return () => window.removeEventListener("receiverright:navigate", listener);
  }, [dirty]);
  function updateLine(
    id: string,
    values: Partial<InvoiceLine>,
    keepConfirm = false,
  ) {
    setDraft((previous) =>
      previous && previous.status !== "closed"
        ? {
            ...previous,
            lines: previous.lines.map((line) =>
              line.id === id
                ? {
                    ...line,
                    ...values,
                    ...(!keepConfirm ? { confirmed: false } : {}),
                  }
                : line,
            ),
          }
        : previous,
    );
  }
  async function save(): Promise<ReceivingCase> {
    if (!draft || !saved) throw new Error("The record has not loaded.");
    if (!dirty) return saved;
    if (saved.status === "closed")
      throw new Error(
        "Closed records are read-only. Export or review this saved record.",
      );
    const record = await api<ReceivingCase>(`/cases/${caseId}`, {
      method: "PUT",
      body: JSON.stringify({ revision: saved.revision, ...editable(draft) }),
    });
    accept(record);
    return record;
  }
  async function run(name: string, action: () => Promise<void>) {
    setError("");
    setBusy(name);
    try {
      await action();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409)
        setError(
          "This record changed in another window. Your edits are still here. Copy anything you need, then reload the latest record before saving.",
        );
      else setError(errorMessage(e));
    } finally {
      setBusy("");
    }
  }
  function chooseFile(kind: "invoice" | "photo", lineId?: string) {
    if (closed) return;
    setFileKind(kind);
    setFileLine(lineId);
    if (input.current) {
      input.current.value = "";
      input.current.click();
    }
  }
  async function upload(file: File) {
    await run("upload", async () => {
      const record = await save();
      await uploadFile(record.id, file, fileKind, fileLine);
      await refresh();
      notify("Evidence uploaded and attached to the record.");
    });
  }
  if (!draft || !saved || !reconciliation)
    return (
      <>
        {error ? (
          <ErrorBox
            error={error}
            retry={() => refresh().catch((e) => setError(errorMessage(e)))}
          />
        ) : (
          <div className="detail-loading">
            <Spinner label="Opening receiving record…" />
          </div>
        )}
      </>
    );
  const invoice = draft.evidence
    .filter((item) => item.kind === "invoice")
    .at(-1);
  const chosenLine = draft.lines.find((line) => line.id === selected);
  const sampleSource =
    invoice?.mimeType === "image/svg+xml" ||
    !!invoice?.url.startsWith("/sample-");
  const canExtract =
    !closed && !!invoice && !sampleSource && health?.extraction === "textract";
  const confirmed = draft.lines.filter((line) => line.confirmed).length;
  const canClose = reconciliation.lines
    .filter((line) => line.discrepancyUnits > 0)
    .every((line) =>
      saved.responses.some(
        (response) =>
          response.lineId === line.lineId &&
          response.decision === "acknowledged" &&
          response.revision === saved.revision,
      ),
    );
  const go = (to: string) => {
    if (dirty) setLeaveTo(to);
    else navigate(to);
  };
  return (
    <>
      <div className="detail-breadcrumb">
        <button className="text-button" onClick={() => go("/cases")}>
          <ArrowLeft size={16} />
          Receiving records
        </button>
        <span>/</span>
        <span>{draft.caseNumber}</span>
        {draft.isDemo && <span className="sample-tag">SAMPLE DELIVERY</span>}
        <span className="revision-label">Revision {saved.revision}</span>
      </div>
      <div className="detail-heading">
        <div>
          <div className="eyebrow">RECEIVING RECORD</div>
          <h1>{draft.supplier || "New delivery"}</h1>
          <div className="detail-meta">
            <span>
              <FileText size={14} />
              {draft.invoiceNumber || "No invoice number"}
            </span>
            <span>{date(draft.createdAt)}</span>
            <Status status={saved.status} />
          </div>
        </div>
        <div className="detail-actions">
          <button
            className="button button-secondary"
            onClick={() =>
              run("refresh", async () => {
                if (dirty) {
                  setLeaveTo("refresh");
                  return;
                }
                await refresh();
                notify("Record refreshed.");
              })
            }
            disabled={!!busy}
            title="Refresh supplier responses"
          >
            <RefreshCw size={16} className={busy === "refresh" ? "spin" : ""} />
            <span className="hide-small">Refresh</span>
          </button>
          <div className="export-menu">
            <button
              className="button button-secondary"
              onClick={() => setExportOpen(!exportOpen)}
              aria-expanded={exportOpen}
            >
              <Download size={16} />
              <span className="hide-small">Export</span>
              <ChevronDown size={13} />
            </button>
            {exportOpen && (
              <div className="dropdown">
                <button
                  onClick={() => {
                    setExportOpen(false);
                    run("export", async () => {
                      await save();
                      await downloadCase(caseId, "csv");
                    });
                  }}
                >
                  <FileText size={16} />
                  Download CSV
                </button>
                <button
                  onClick={() => {
                    setExportOpen(false);
                    run("export", async () => {
                      await save();
                      await downloadCase(caseId, "json");
                    });
                  }}
                >
                  <Download size={16} />
                  Download JSON
                </button>
                <button
                  onClick={() => {
                    setExportOpen(false);
                    window.print();
                  }}
                >
                  <Printer size={16} />
                  Print / save PDF
                </button>
              </div>
            )}
          </div>
          <button
            className="button button-primary"
            onClick={() =>
              run("save", async () => {
                await save();
                notify("Receiving record saved.");
              })
            }
            disabled={!!busy || !dirty || closed}
          >
            {busy === "save" ? (
              <Spinner label="Saving…" />
            ) : (
              <>
                <Save size={16} />
                Save changes
              </>
            )}
          </button>
        </div>
      </div>
      {draft.isDemo && (
        <div className="sample-banner">
          <Sparkles size={15} />
          <strong>You’re exploring a sample delivery.</strong>
          <span>
            All names, invoices, and photographs in this record are synthetic.
          </span>
        </div>
      )}
      {error && (
        <div className="detail-error">
          <ErrorBox error={error} />
          {error.includes("another window") && (
            <button
              className="button button-secondary"
              onClick={() => setLeaveTo("refresh")}
            >
              <RefreshCw size={15} />
              Reload latest version
            </button>
          )}
        </div>
      )}
      {saved.status === "closed" && (
        <div className="notice notice-success">
          <CheckCheck size={20} />
          <div>
            <strong>This record is acknowledged.</strong>
            <p>
              All discrepancy lines were acknowledged by the supplier. This
              status does not confirm a refund or credit.
            </p>
          </div>
        </div>
      )}
      {dirty && (saved.responses.length > 0 || saved.status === "shared") && (
        <div className="notice notice-warning">
          <History size={18} />
          <p>
            Saving edits creates a new revision and retires the current review
            link. Earlier responses stay in Saved versions. Share the updated
            record for a fresh response.
          </p>
        </div>
      )}
      <div
        className="detail-tabs"
        role="tablist"
        aria-label="Receiving record sections"
      >
        {[
          ["review", ClipboardCheck, "Verify delivery"],
          ["evidence", Camera, "Evidence", draft.evidence.length],
          ["activity", History, "Activity", draft.history.length],
          ["revisions", FileText, "Saved versions"],
        ].map(([value, Icon, label, count]) => {
          const I = Icon as typeof ClipboardCheck;
          return (
            <button
              key={value as string}
              role="tab"
              aria-selected={tab === value}
              className={tab === value ? "active" : ""}
              onClick={() => setTab(value as string)}
            >
              <I size={17} />
              {label as string}
              {typeof count === "number" && <span>{count}</span>}
            </button>
          );
        })}
        <div className={`save-state ${dirty ? "unsaved" : ""}`}>
          <span />
          {dirty ? "Unsaved changes" : "All changes saved"}
        </div>
      </div>
      <input
        ref={input}
        type="file"
        hidden
        disabled={closed}
        accept={
          fileKind === "invoice"
            ? "image/jpeg,image/png,application/pdf"
            : "image/jpeg,image/png"
        }
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      {tab === "review" && (
        <div className="review-layout">
          <fieldset
            className="review-main"
            disabled={closed}
            style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
          >
            <section className="panel invoice-details">
              <div className="panel-heading">
                <h2>
                  <FileText size={18} />
                  Invoice details
                </h2>
                <button
                  className="text-button"
                  onClick={() => setMetadata(!metadata)}
                >
                  {metadata ? "Collapse details" : "Edit details"}
                  <ChevronDown size={14} className={metadata ? "rotate" : ""} />
                </button>
              </div>
              <div className="invoice-meta-grid">
                <div>
                  <span>SUPPLIER</span>
                  <strong>{draft.supplier || "—"}</strong>
                </div>
                <div>
                  <span>INVOICE NUMBER</span>
                  <strong>{draft.invoiceNumber || "Not added"}</strong>
                </div>
                <div>
                  <span>RECEIVING AT</span>
                  <strong>{draft.shopName || "My store"}</strong>
                </div>
              </div>
              {metadata && (
                <div className="metadata-form form-grid">
                  <label>
                    Supplier
                    <input
                      maxLength={200}
                      value={draft.supplier}
                      onChange={(e) =>
                        setDraft({ ...draft, supplier: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Invoice number
                    <input
                      maxLength={100}
                      value={draft.invoiceNumber}
                      onChange={(e) =>
                        setDraft({ ...draft, invoiceNumber: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Shop name
                    <input
                      maxLength={200}
                      value={draft.shopName}
                      onChange={(e) =>
                        setDraft({ ...draft, shopName: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Invoice date
                    <input
                      type="date"
                      value={draft.invoiceDate?.slice(0, 10)}
                      onChange={(e) =>
                        setDraft({ ...draft, invoiceDate: e.target.value })
                      }
                    />
                  </label>
                  <label className="span-2">
                    Supplier email <span className="optional">Optional</span>
                    <input
                      type="email"
                      maxLength={254}
                      value={draft.supplierEmail}
                      onChange={(e) =>
                        setDraft({ ...draft, supplierEmail: e.target.value })
                      }
                    />
                  </label>
                </div>
              )}
            </section>
            <section className="panel line-items">
              <div className="panel-heading">
                <div>
                  <h2>
                    Match the invoice to the delivery
                    <span className="count-badge">{draft.lines.length}</span>
                  </h2>
                  <p>
                    Enter physical unit counts. Include damaged and wrong items
                    in the received total.
                  </p>
                </div>
              </div>
              <div className="line-progress">
                <div>
                  <span
                    style={{
                      width: `${draft.lines.length ? (confirmed / draft.lines.length) * 100 : 0}%`,
                    }}
                  />
                </div>
                <span>
                  {confirmed} of {draft.lines.length} lines confirmed
                </span>
              </div>
              {draft.lines.length === 0 ? (
                <div className="empty-state line-empty">
                  <div className="empty-icon">
                    <ScanLine size={27} />
                  </div>
                  <h3>Bring the invoice into the record.</h3>
                  <p>
                    {invoice && health?.extraction === "textract"
                      ? "Extract the invoice, then check every suggested field."
                      : "Add the items from your invoice to start verifying this delivery."}
                  </p>
                  <div className="button-row">
                    <button
                      className="button button-primary"
                      onClick={() => {
                        const line = emptyLine();
                        setDraft({ ...draft, lines: [line] });
                        setSelected(line.id);
                      }}
                    >
                      <Plus size={16} />
                      Add first item
                    </button>
                    {!invoice && (
                      <button
                        className="button button-secondary"
                        disabled={closed}
                        onClick={() => chooseFile("invoice")}
                      >
                        <Upload size={16} />
                        Upload invoice
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="item-list">
                  {draft.lines.map((line, index) => {
                    const result = reconciliation.lines[index];
                    const responses = saved.responses.filter(
                      (response) =>
                        response.lineId === line.id &&
                        response.revision === saved.revision,
                    );
                    return (
                      <article
                        key={line.id}
                        className={`item-card ${selected === line.id ? "is-selected" : ""} ${line.confirmed ? "is-confirmed" : ""}`}
                        onFocus={() => setSelected(line.id)}
                      >
                        <div className="item-heading">
                          <span className="line-number">
                            {String(index + 1).padStart(2, "0")}
                          </span>
                          <div className="item-title">
                            <label
                              className="sr-only"
                              htmlFor={`description-${line.id}`}
                            >
                              Item {index + 1} description
                            </label>
                            <input
                              id={`description-${line.id}`}
                              className="item-name"
                              placeholder="Item description"
                              maxLength={300}
                              value={line.description}
                              onChange={(e) =>
                                updateLine(line.id, {
                                  description: e.target.value,
                                })
                              }
                            />
                            <div>
                              <span>{line.sku || "No item code"}</span>
                              {line.source && (
                                <button
                                  className="source-link"
                                  onClick={() => setSelected(line.id)}
                                >
                                  <ScanLine size={12} />
                                  {sampleSource
                                    ? "View sample source"
                                    : `View source · ${Math.round(line.source.confidence)}%`}
                                </button>
                              )}
                            </div>
                          </div>
                          <button
                            className="icon-button delete-line"
                            aria-label={`Remove item ${index + 1}`}
                            onClick={() => setRemoveLine(line.id)}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                        {(line.billedQty == null ||
                          line.billedUnit === "unknown") && (
                          <div className="item-uncertainty">
                            <AlertCircle size={15} />
                            <span>
                              Check the invoice:{" "}
                              {line.billedQty == null &&
                              line.billedUnit === "unknown"
                                ? "quantity and unit are unknown"
                                : line.billedQty == null
                                  ? "quantity is unknown"
                                  : "billed unit is unknown"}
                              . Calculation waits for your entry.
                            </span>
                          </div>
                        )}
                        <div className="item-fields">
                          <label>
                            Billed quantity
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={line.billedQty ?? ""}
                              placeholder="Unknown"
                              aria-invalid={line.billedQty == null}
                              onChange={(e) =>
                                updateLine(line.id, {
                                  billedQty:
                                    e.target.value === ""
                                      ? null
                                      : Number(e.target.value),
                                })
                              }
                            />
                          </label>
                          <label>
                            Billed unit
                            <select
                              value={line.billedUnit}
                              aria-invalid={line.billedUnit === "unknown"}
                              onChange={(e) =>
                                updateLine(line.id, {
                                  billedUnit: e.target.value,
                                  packSize: null,
                                })
                              }
                            >
                              <option value="unknown">Choose unit</option>
                              {![
                                "unknown",
                                "piece",
                                "unit",
                                "bottle",
                                "packet",
                                "carton",
                                "pack",
                                "box",
                                "case",
                                "dozen",
                              ].includes(line.billedUnit) && (
                                <option value={line.billedUnit}>
                                  {line.billedUnit}
                                </option>
                              )}
                              {[
                                "piece",
                                "unit",
                                "bottle",
                                "packet",
                                "carton",
                                "pack",
                                "box",
                                "case",
                                "dozen",
                              ].map((unit) => (
                                <option key={unit} value={unit}>
                                  {unit}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Price / billed unit
                            <span className="currency-input">
                              <span>₹</span>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="0.00"
                                value={
                                  line.unitPriceMinor == null
                                    ? ""
                                    : line.unitPriceMinor / 100
                                }
                                onChange={(e) =>
                                  updateLine(line.id, {
                                    unitPriceMinor:
                                      e.target.value === ""
                                        ? null
                                        : Math.round(
                                            Number(e.target.value) * 100,
                                          ),
                                  })
                                }
                              />
                            </span>
                          </label>
                          <label className="received-field">
                            Received units
                            <input
                              type="number"
                              min="0"
                              step="1"
                              placeholder="Count all"
                              value={line.receivedQty ?? ""}
                              onChange={(e) =>
                                updateLine(line.id, {
                                  receivedQty:
                                    e.target.value === ""
                                      ? null
                                      : Number(e.target.value),
                                })
                              }
                            />
                          </label>
                          <label>
                            Damaged units
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={line.damagedQty}
                              onChange={(e) =>
                                updateLine(line.id, {
                                  damagedQty: Number(e.target.value),
                                })
                              }
                            />
                          </label>
                          <label>
                            Wrong units
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={line.wrongQty}
                              onChange={(e) =>
                                updateLine(line.id, {
                                  wrongQty: Number(e.target.value),
                                })
                              }
                            />
                          </label>
                        </div>
                        {requiresPackSize(line.billedUnit) && (
                          <div
                            className={`pack-conversion ${!line.packSize ? "needs-pack" : ""}`}
                          >
                            <Package size={18} />
                            <div>
                              <strong>
                                How many individual units in one{" "}
                                {line.billedUnit}?
                              </strong>
                              <span>
                                Confirm the conversion before calculating a
                                discrepancy.
                              </span>
                            </div>
                            <input
                              aria-label={`Units per ${line.billedUnit} for item ${index + 1}`}
                              type="number"
                              min="1"
                              step="1"
                              placeholder="e.g. 12"
                              value={line.packSize ?? ""}
                              onChange={(e) =>
                                updateLine(line.id, {
                                  packSize:
                                    e.target.value === ""
                                      ? null
                                      : Number(e.target.value),
                                })
                              }
                            />
                          </div>
                        )}
                        <div className="line-calculation">
                          <span>
                            Expected{" "}
                            <strong>{result.expectedUnits ?? "—"}</strong>
                          </span>
                          <span>
                            Accepted{" "}
                            <strong>{result.acceptedUnits ?? "—"}</strong>
                          </span>
                          <span
                            className={result.shortage ? "amount-warning" : ""}
                          >
                            Missing <strong>{result.shortage}</strong>
                          </span>
                          {result.excess > 0 && (
                            <span>
                              Excess <strong>{result.excess}</strong>
                            </span>
                          )}
                          <span
                            className={`line-value ${result.discrepancyUnits ? "amount-warning" : ""}`}
                          >
                            {result.discrepancyUnits
                              ? `${result.discrepancyUnits} affected · `
                              : ""}
                            <strong>{money(result.discrepancyMinor)}</strong>
                          </span>
                        </div>
                        <details className="line-notes">
                          <summary>
                            Add a note or item code <ChevronDown size={12} />
                          </summary>
                          <div className="form-grid">
                            <label>
                              Item code
                              <input
                                value={line.sku}
                                maxLength={100}
                                onChange={(e) =>
                                  updateLine(
                                    line.id,
                                    { sku: e.target.value },
                                    true,
                                  )
                                }
                              />
                            </label>
                            <label>
                              Receiving note
                              <input
                                value={line.note}
                                maxLength={500}
                                placeholder="What did you observe?"
                                onChange={(e) =>
                                  updateLine(
                                    line.id,
                                    { note: e.target.value },
                                    true,
                                  )
                                }
                              />
                            </label>
                          </div>
                        </details>
                        {showValidation &&
                          result.issues.filter(
                            (issue) => !issue.startsWith("Confirm the invoice"),
                          ).length > 0 && (
                            <div className="line-issues">
                              <AlertCircle size={15} />
                              <span>
                                {result.issues
                                  .filter(
                                    (issue) =>
                                      !issue.startsWith("Confirm the invoice"),
                                  )
                                  .join(" ")}
                              </span>
                            </div>
                          )}
                        <div className="item-bottom">
                          <label className="check-label">
                            <input
                              type="checkbox"
                              checked={line.confirmed}
                              onChange={(e) =>
                                updateLine(
                                  line.id,
                                  { confirmed: e.target.checked },
                                  true,
                                )
                              }
                            />
                            <span>
                              I checked this line against the invoice and
                              delivery.
                            </span>
                          </label>
                          <button
                            className="text-button"
                            disabled={!!busy || closed}
                            onClick={() => chooseFile("photo", line.id)}
                          >
                            <Camera size={14} />
                            {draft.evidence.filter(
                              (item) => item.lineId === line.id,
                            ).length
                              ? `${draft.evidence.filter((item) => item.lineId === line.id).length} photo(s)`
                              : "Add photo"}
                          </button>
                        </div>
                        {responses.map((response, i) => (
                          <div
                            className={`supplier-response ${response.decision}`}
                            key={i}
                          >
                            <CheckCheck size={16} />
                            <div>
                              <strong>
                                {response.decision === "acknowledged"
                                  ? "Acknowledged"
                                  : "Disputed"}{" "}
                                by {response.actor}
                              </strong>
                              <p>{response.note || "No additional note."}</p>
                              <small>
                                {date(response.at, true)} · Name supplied by
                                responder
                              </small>
                            </div>
                          </div>
                        ))}
                      </article>
                    );
                  })}
                </div>
              )}
              {draft.lines.length > 0 && (
                <button
                  className="add-line"
                  disabled={draft.lines.length >= 100}
                  onClick={() => {
                    const line = emptyLine();
                    setDraft({ ...draft, lines: [...draft.lines, line] });
                    setSelected(line.id);
                  }}
                >
                  <Plus size={16} />
                  Add another item
                </button>
              )}
            </section>
          </fieldset>
          <aside className="review-aside">
            <section className="panel source-panel">
              <div className="panel-heading">
                <h2>
                  <FileText size={17} />
                  Original invoice
                </h2>
                <button
                  className="icon-button"
                  aria-label="Upload invoice"
                  onClick={() => chooseFile("invoice")}
                  disabled={!!busy || closed}
                >
                  <Upload size={16} />
                </button>
              </div>
              <EvidencePreview evidence={invoice} line={chosenLine} />
              <div className="source-footer">
                <span>
                  <span className="connection-dot" />
                  {draft.extractionProvider === "textract"
                    ? "Textract suggestions requested"
                    : draft.extractionProvider === "sample"
                      ? "Synthetic sample invoice"
                      : "Manual invoice entry"}
                </span>
                {invoice && (
                  <button
                    className="text-button"
                    disabled={!!busy || !canExtract}
                    title={
                      sampleSource
                        ? "This is an illustrative sample source. Upload a printed invoice to request Textract suggestions."
                        : health?.extraction !== "textract"
                          ? "Connect AWS Textract to enable extraction. Manual entry is available."
                          : "Suggest invoice fields using AWS Textract"
                    }
                    onClick={() =>
                      run("extract", async () => {
                        await save();
                        const result = await post<ExtractionResult>(
                          `/cases/${caseId}/extract`,
                          { evidenceId: invoice.id },
                        );
                        await refresh();
                        setExtraction(result);
                      })
                    }
                  >
                    {busy === "extract" ? (
                      <Spinner label="Extracting…" />
                    ) : (
                      <>
                        <ScanLine size={14} />
                        Extract invoice
                      </>
                    )}
                  </button>
                )}
              </div>
              {health?.extraction !== "textract" && (
                <p className="source-hint">
                  Manual entry is available. AWS extraction is not configured in
                  this environment.
                </p>
              )}
            </section>
            <section className="panel reconciliation-card">
              <div className="eyebrow">DELIVERY RECONCILIATION</div>
              <div className="reconciliation-value">
                {money(reconciliation.totalDiscrepancyMinor)}
              </div>
              <p>Calculated discrepancy · item value only</p>
              <div className="reconciliation-breakdown">
                <div>
                  <span>Missing units</span>
                  <strong>
                    {reconciliation.lines.reduce(
                      (sum, line) => sum + line.shortage,
                      0,
                    )}
                  </strong>
                </div>
                <div>
                  <span>Damaged units</span>
                  <strong>
                    {reconciliation.lines.reduce(
                      (sum, line) => sum + line.damaged,
                      0,
                    )}
                  </strong>
                </div>
                <div>
                  <span>Wrong units</span>
                  <strong>
                    {reconciliation.lines.reduce(
                      (sum, line) => sum + line.wrong,
                      0,
                    )}
                  </strong>
                </div>
                <div className="total">
                  <span>Total affected units</span>
                  <strong>{reconciliation.totalDiscrepancyUnits}</strong>
                </div>
              </div>
              {reconciliation.hasUnpricedDiscrepancies && (
                <div className="notice notice-warning">
                  <AlertCircle size={16} />
                  <span>
                    Some affected items are unpriced. The value above is
                    incomplete.
                  </span>
                </div>
              )}
              <div
                className={`verification-state ${reconciliation.ready ? "verified" : ""}`}
              >
                {reconciliation.ready ? (
                  <ShieldCheck size={18} />
                ) : (
                  <ClipboardCheck size={18} />
                )}
                <div>
                  <strong>
                    {reconciliation.ready
                      ? "Every line is confirmed"
                      : "A few details to confirm"}
                  </strong>
                  <span>
                    {closed
                      ? "This record is closed and read-only."
                      : reconciliation.ready
                        ? "This record is ready for supplier review."
                        : `${draft.lines.length - confirmed} unconfirmed · complete all fields before sharing.`}
                  </span>
                </div>
              </div>
              <button
                className="button button-primary full-width"
                disabled={!!busy || saved.status === "closed"}
                onClick={() => {
                  setShowValidation(true);
                  if (!reconciliation.ready) {
                    notify(
                      "Check the highlighted item details before sharing.",
                    );
                    return;
                  }
                  void run("share", async () => {
                    let record = await save();
                    if (record.status === "draft") {
                      record = await post<ReceivingCase>(
                        `/cases/${caseId}/ready`,
                        { revision: record.revision },
                      );
                      accept(record);
                    }
                    const result = await post<ShareResult>(
                      `/cases/${caseId}/share`,
                      { revision: record.revision },
                    );
                    setShare(result);
                    await refresh();
                  });
                }}
              >
                {busy === "share" ? (
                  <Spinner label="Preparing review…" />
                ) : (
                  <>
                    <Send size={16} />
                    {saved.status === "closed"
                      ? "Record acknowledged"
                      : "Share with supplier"}
                    <ArrowRight size={15} />
                  </>
                )}
              </button>
              {saved.responses.length > 0 && saved.status !== "closed" && (
                <button
                  className="button button-secondary full-width"
                  disabled={!!busy || !canClose || dirty}
                  onClick={() =>
                    run("close", async () => {
                      accept(
                        await post<ReceivingCase>(`/cases/${caseId}/close`, {
                          revision: saved.revision,
                        }),
                      );
                      notify(
                        "All discrepancy lines acknowledged. Record closed.",
                      );
                    })
                  }
                >
                  <CheckCheck size={16} />
                  Close acknowledged record
                </button>
              )}
              <p className="privacy-footnote">
                <LockKeyhole size={12} />
                Protected link + a separate six-digit PIN
              </p>
              {showValidation && !reconciliation.ready && (
                <div className="validation-summary" role="alert">
                  <strong>Before sharing:</strong>
                  <ul>
                    {reconciliation.issues.slice(0, 8).map((issue, i) => (
                      <li key={i}>{issue}</li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
            <button
              className="summary-trigger"
              disabled={!!busy}
              onClick={() =>
                run("summary", async () => {
                  await save();
                  setSummary(
                    await post<{ summary: string; provider: string }>(
                      `/cases/${caseId}/summary`,
                    ),
                  );
                })
              }
            >
              <Sparkles size={18} />
              <span>
                <strong>Prepare a case summary</strong>
                <small>
                  {health?.summaries === "bedrock"
                    ? "Drafted with Amazon Bedrock"
                    : reconciliation.ready
                      ? "Built from receiver-confirmed details"
                      : "Provisional summary · review incomplete"}
                </small>
              </span>
              {busy === "summary" ? (
                <LoaderCircle size={16} className="spin" />
              ) : (
                <ArrowUpRight size={16} />
              )}
            </button>
          </aside>
        </div>
      )}
      {tab === "evidence" && (
        <section className="panel evidence-panel">
          <div className="panel-heading">
            <div>
              <h2>The evidence stays together.</h2>
              <p>
                Original invoices and receiving observations attached to this
                record.
              </p>
            </div>
            <button
              className="button button-primary"
              disabled={!!busy || closed}
              onClick={() => chooseFile("photo")}
            >
              <ImagePlus size={16} />
              Add evidence
            </button>
          </div>
          {draft.evidence.length ? (
            <div className="evidence-grid">
              {draft.evidence.map((item) => (
                <article className="evidence-card" key={item.id}>
                  <EvidencePreview evidence={item} compact />
                  <div>
                    <span className="eyebrow">
                      {item.kind === "invoice"
                        ? "ORIGINAL INVOICE"
                        : "RECEIVING OBSERVATION"}
                    </span>
                    <h3>{item.fileName}</h3>
                    <p>
                      {item.lineId
                        ? draft.lines.find((line) => line.id === item.lineId)
                            ?.description || "Linked item"
                        : "Whole delivery"}{" "}
                      · {date(item.createdAt)}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <Camera size={35} strokeWidth={1.3} />
              <h3>Document what you observed.</h3>
              <p>
                Add an invoice or receiving photograph to support the record.
              </p>
              <button
                className="button button-secondary"
                disabled={closed}
                onClick={() => chooseFile("invoice")}
              >
                <Upload size={16} />
                Add an invoice
              </button>
            </div>
          )}
        </section>
      )}
      {tab === "revisions" && (
        <RevisionHistory caseId={caseId} updatedAt={saved.updatedAt} />
      )}
      {tab === "activity" && (
        <section className="panel activity-panel">
          <div className="panel-heading">
            <div>
              <h2>A clear record of what happened.</h2>
              <p>
                Saved changes and supplier responses, recorded as they happen.
              </p>
            </div>
            <span className="revision-label">
              Current revision {saved.revision}
            </span>
          </div>
          <div className="timeline">
            {[...draft.history].reverse().map((event, index) => (
              <div className="timeline-event" key={event.id}>
                <span className={`timeline-dot ${index === 0 ? "latest" : ""}`}>
                  <Check size={13} />
                </span>
                <div>
                  <div className="timeline-heading">
                    <strong>{event.action.replaceAll("_", " ")}</strong>
                    <span>{date(event.at, true)}</span>
                  </div>
                  <p>
                    {draft.lines.reduce(
                      (detail, line) =>
                        detail.replaceAll(
                          line.id,
                          line.description || "Unnamed item",
                        ),
                      event.detail,
                    )}
                  </p>
                  <small>
                    {event.actor} · revision {event.revision}
                  </small>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
      <div className="print-summary">
        <h2>Receiving summary</h2>
        <p>
          {draft.caseNumber} · {draft.invoiceNumber} · {draft.supplier}
        </p>
        <p>
          Calculated discrepancy: {money(reconciliation.totalDiscrepancyMinor)}{" "}
          · {reconciliation.totalDiscrepancyUnits} affected units
        </p>
        <p>
          Values exclude taxes and discounts. Supplier acknowledgment is not
          proof of reimbursement.
        </p>
      </div>
      {busy === "upload" && (
        <div className="upload-overlay" role="status">
          <Spinner label="Uploading and attaching evidence…" />
        </div>
      )}
      {share && (
        <Modal
          title="Give your supplier the full picture."
          eyebrow="PROTECTED SUPPLIER REVIEW"
          onClose={() => setShare(null)}
        >
          <p className="modal-description">
            Share the review link and send the PIN separately. The supplier can
            respond to this saved revision.
          </p>
          <label className="share-label">
            Review link
            <div className="share-value">
              <input
                readOnly
                value={new URL(share.url, location.origin).href}
                onFocus={(e) => e.target.select()}
              />
              <CopyButton value={new URL(share.url, location.origin).href} />
            </div>
          </label>
          <div className="pin-card">
            <div>
              <span>SEPARATE ACCESS PIN</span>
              <strong>{share.pin}</strong>
            </div>
            <CopyButton value={share.pin} label="Copy PIN" />
          </div>
          <div className="notice">
            <ShieldCheck size={18} />
            <p>
              Expires {date(share.expiresAt, true)}. Editing the record
              invalidates this review link. The responder’s name is
              self-reported.
            </p>
          </div>
          <div className="modal-actions">
            <a
              className="button button-secondary"
              target="_blank"
              rel="noreferrer"
              href={new URL(share.url, location.origin).href}
            >
              Open supplier view <ArrowUpRight size={15} />
            </a>
            <button
              className="button button-primary"
              onClick={() => setShare(null)}
            >
              <Check size={16} />
              Done
            </button>
          </div>
        </Modal>
      )}
      {extraction && (
        <Modal
          title="Check the suggested invoice fields."
          eyebrow="AWS TEXTRACT SUGGESTIONS"
          wide
          onClose={() => setExtraction(null)}
        >
          <p className="modal-description">
            Check quantities and units against the invoice. Unknown fields stay
            blank until you fill them. Applying suggestions replaces the current
            invoice lines; receiving counts still need your confirmation.
          </p>
          {extraction.warnings.length > 0 && (
            <div className="notice notice-warning">
              <AlertCircle size={18} />
              <div>
                {extraction.warnings.map((warning, i) => (
                  <p key={i}>{warning}</p>
                ))}
              </div>
            </div>
          )}
          <div className="extraction-preview">
            <div>
              <span>Supplier</span>
              <strong>{extraction.supplier || "Not identified"}</strong>
            </div>
            <div>
              <span>Invoice</span>
              <strong>{extraction.invoiceNumber || "Not identified"}</strong>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Quantity</th>
                  <th>Billed unit</th>
                  <th>Price / unit</th>
                </tr>
              </thead>
              <tbody>
                {extraction.lines.map((line, index) => (
                  <tr key={line.id}>
                    <td>
                      {line.description || (
                        <span className="unknown-label">
                          Description unknown
                        </span>
                      )}
                    </td>
                    <td>
                      <input
                        className="extraction-number"
                        aria-label={`Suggested quantity for item ${index + 1}`}
                        aria-invalid={line.billedQty == null}
                        type="number"
                        min="0"
                        step="1"
                        placeholder="Unknown"
                        value={line.billedQty ?? ""}
                        onChange={(event) =>
                          setExtraction({
                            ...extraction,
                            lines: extraction.lines.map((item) =>
                              item.id === line.id
                                ? {
                                    ...item,
                                    billedQty:
                                      event.target.value === ""
                                        ? null
                                        : Number(event.target.value),
                                    confirmed: false,
                                  }
                                : item,
                            ),
                          })
                        }
                      />
                    </td>
                    <td>
                      <select
                        aria-label={`Suggested unit for item ${index + 1}`}
                        aria-invalid={line.billedUnit === "unknown"}
                        value={line.billedUnit}
                        onChange={(event) =>
                          setExtraction({
                            ...extraction,
                            lines: extraction.lines.map((item) =>
                              item.id === line.id
                                ? {
                                    ...item,
                                    billedUnit: event.target.value,
                                    packSize: null,
                                    confirmed: false,
                                  }
                                : item,
                            ),
                          })
                        }
                      >
                        <option value="unknown">Unknown — choose</option>
                        {![
                          "unknown",
                          "piece",
                          "unit",
                          "bottle",
                          "packet",
                          "carton",
                          "pack",
                          "box",
                          "case",
                          "dozen",
                        ].includes(line.billedUnit) && (
                          <option value={line.billedUnit}>
                            {line.billedUnit}
                          </option>
                        )}
                        {[
                          "piece",
                          "unit",
                          "bottle",
                          "packet",
                          "carton",
                          "pack",
                          "box",
                          "case",
                          "dozen",
                        ].map((unit) => (
                          <option key={unit} value={unit}>
                            {unit}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>{money(line.unitPriceMinor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="modal-actions">
            <button
              className="button button-secondary"
              onClick={() => setExtraction(null)}
            >
              Keep my current lines
            </button>
            <button
              className="button button-primary"
              disabled={!extraction.lines.length || closed}
              onClick={() => {
                setDraft({
                  ...draft,
                  supplier: extraction.supplier || draft.supplier,
                  invoiceNumber:
                    extraction.invoiceNumber || draft.invoiceNumber,
                  invoiceDate: extraction.invoiceDate || draft.invoiceDate,
                  lines: extraction.lines,
                });
                setExtraction(null);
                setShowValidation(true);
                notify("Suggestions applied. Review and save each item.");
              }}
            >
              Apply {extraction.lines.length} suggested items{" "}
              <ArrowRight size={16} />
            </button>
          </div>
        </Modal>
      )}
      {summary && (
        <Modal
          title="A clear summary, ready to share."
          eyebrow={
            summary.provider === "bedrock"
              ? "AMAZON BEDROCK DRAFT"
              : "RECORD SUMMARY"
          }
          onClose={() => setSummary(null)}
        >
          <p className="modal-description">
            Review this summary before using it. The saved line items remain the
            source of truth.
          </p>
          <div className="summary-text">{summary.summary}</div>
          <div className="modal-actions">
            <CopyButton value={summary.summary} label="Copy summary" />
            <button
              className="button button-primary"
              onClick={() => setSummary(null)}
            >
              Done
            </button>
          </div>
        </Modal>
      )}
      {removeLine && (
        <Modal
          title="Remove this invoice item?"
          onClose={() => setRemoveLine(null)}
        >
          <p className="modal-description">
            {draft.lines.find((line) => line.id === removeLine)?.description ||
              "This item"}{" "}
            will be removed when you save the record.
          </p>
          <div className="modal-actions">
            <button
              className="button button-secondary"
              onClick={() => setRemoveLine(null)}
            >
              Keep item
            </button>
            <button
              className="button button-danger"
              disabled={closed}
              onClick={() => {
                setDraft({
                  ...draft,
                  lines: draft.lines.filter((line) => line.id !== removeLine),
                });
                setRemoveLine(null);
              }}
            >
              Remove item
            </button>
          </div>
        </Modal>
      )}
      {leaveTo && (
        <Modal
          title="You have unsaved changes."
          onClose={() => setLeaveTo(null)}
        >
          <p className="modal-description">
            Keep your edits by saving first, or discard them and continue.
            Reloading the latest version will replace your local edits.
          </p>
          <div className="modal-actions">
            <button
              className="button button-secondary"
              onClick={() => setLeaveTo(null)}
            >
              Keep editing
            </button>
            <button
              className="button button-danger"
              onClick={() => {
                const destination = leaveTo;
                setLeaveTo(null);
                if (destination === "refresh")
                  void run("refresh", async () => {
                    await refresh();
                  });
                else navigate(destination, true);
              }}
            >
              Discard and continue
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
