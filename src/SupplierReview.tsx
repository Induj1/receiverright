import { useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Camera,
  Check,
  CheckCheck,
  ChevronDown,
  ClipboardCheck,
  FileText,
  LockKeyhole,
  PackageCheck,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { ReceivingCase } from "../shared/types";
import { reconcileCase } from "../shared/domain";
import { api, date, errorMessage, money, post } from "./api";
import { ErrorBox, EvidencePreview, Modal, Spinner, Status } from "./ui";

export default function SupplierReview({
  shareId,
  notify,
}: {
  shareId: string;
  notify: (text: string) => void;
}) {
  const [pin, setPin] = useState("");
  const [token, setToken] = useState("");
  const [record, setRecord] = useState<ReceivingCase | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [choices, setChoices] = useState<
    Record<string, { decision: "acknowledged" | "disputed"; note: string }>
  >({});
  const [success, setSuccess] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);
  useEffect(() => {
    setRecord(null);
    setToken("");
    setPin("");
    setError("");
    setSuccess(false);
    setChoices({});
  }, [shareId]);
  async function open(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await post<{ token: string; case: ReceivingCase }>(
        `/shares/${shareId}/open`,
        { pin },
        "",
      );
      setToken(result.token);
      setRecord(result.case);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const reconciliation = record ? reconcileCase(record) : null;
  const discrepancies =
    reconciliation?.lines.filter((line) => line.discrepancyUnits > 0) || [];
  const closed = record?.status === "closed";
  const complete =
    !closed &&
    !!name.trim() &&
    discrepancies.length > 0 &&
    discrepancies.every(
      (line) =>
        choices[line.lineId] &&
        (choices[line.lineId].decision !== "disputed" ||
          choices[line.lineId].note.trim()),
    );
  async function respond() {
    if (!record || record.status === "closed") return;
    setBusy(true);
    setError("");
    try {
      const next = await post<ReceivingCase>(
        `/shares/${shareId}/respond`,
        {
          revision: record.revision,
          name: name.trim(),
          responses: discrepancies.map((line) => ({
            lineId: line.lineId,
            ...choices[line.lineId],
          })),
        },
        token,
      );
      setRecord(next);
      setSuccess(true);
      setConfirm(false);
    } catch (e) {
      setError(errorMessage(e));
      setConfirm(false);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="supplier-shell">
      <header className="supplier-header">
        <a href="/" className="brand">
          <span className="brand-mark">
            <PackageCheck size={23} strokeWidth={1.7} />
          </span>
          <span>
            Receive<span className="brand-light">Right</span>
          </span>
        </a>
        <span>
          <LockKeyhole size={14} />
          Protected supplier review
        </span>
      </header>
      {!record ? (
        <main className="supplier-login">
          <div className="supplier-login-art" aria-hidden="true">
            <div className="supplier-envelope">
              <FileText size={50} strokeWidth={1} />
              <span>
                <ShieldCheck size={24} />
              </span>
            </div>
          </div>
          <div className="eyebrow">ONE DELIVERY. ONE SHARED RECORD.</div>
          <h1>Let’s get on the same page.</h1>
          <p>
            A receiving record has been shared with you. Enter the six-digit PIN
            provided by the receiver to review the invoice and observations.
          </p>
          <form onSubmit={open}>
            <label htmlFor="supplier-pin">Your access PIN</label>
            <input
              id="supplier-pin"
              className="pin-input"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              autoComplete="one-time-code"
              placeholder="000000"
              value={pin}
              onChange={(e) =>
                setPin(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              required
              autoFocus
            />
            {error && <ErrorBox error={error} />}
            <button
              className="button button-primary full-width"
              disabled={pin.length !== 6 || busy}
            >
              {busy ? (
                <Spinner label="Opening record…" />
              ) : (
                <>
                  Open receiving record <ArrowRight size={17} />
                </>
              )}
            </button>
          </form>
          <div className="supplier-login-note">
            <ShieldCheck size={17} />
            <span>
              Access is limited to this delivery. Ask the receiver for a new
              link if this one has expired.
            </span>
          </div>
        </main>
      ) : (
        <main className="supplier-content">
          <div className="supplier-page-heading">
            <div className="eyebrow">SUPPLIER REVIEW · {record.caseNumber}</div>
            <h1>A clear view of the delivery.</h1>
            <p>
              Review the receiver’s observations and respond to each affected
              item.
            </p>
          </div>
          {closed && (
            <div className="notice notice-success">
              <CheckCheck size={18} />
              <span>
                This receiving record is closed and read-only. Acknowledgment
                does not confirm a refund.
              </span>
            </div>
          )}
          {record.isDemo && (
            <div className="sample-banner">
              <Sparkles size={15} />
              <strong>Sample delivery</strong>
              <span>
                All names, invoices, and evidence in this record are synthetic.
              </span>
            </div>
          )}
          {success && (
            <div className="response-success" role="status">
              <span>
                <CheckCheck size={28} />
              </span>
              <div>
                <h2>Your response is on the record.</h2>
                <p>
                  The receiver can now see your decisions and notes. Thank you
                  for helping resolve the delivery clearly.
                </p>
              </div>
            </div>
          )}
          {error && <ErrorBox error={error} />}
          <div className="supplier-overview">
            <div>
              <span>FROM</span>
              <strong>{record.shopName || "Receiving store"}</strong>
            </div>
            <div>
              <span>SUPPLIER</span>
              <strong>{record.supplier}</strong>
            </div>
            <div>
              <span>INVOICE</span>
              <strong>{record.invoiceNumber || "Not specified"}</strong>
            </div>
            <div>
              <span>ITEM-VALUE DISCREPANCY</span>
              <strong className="amount-warning">
                {money(reconciliation?.totalDiscrepancyMinor)}
              </strong>
            </div>
          </div>
          <div className="supplier-proof-bar">
            <span>
              <ShieldCheck size={16} />
              Reviewing saved revision {record.revision}
            </span>
            <button
              className="text-button"
              onClick={() => setShowEvidence(!showEvidence)}
            >
              <Camera size={15} />
              {showEvidence ? "Hide" : "View"} invoice & evidence{" "}
              <ChevronDown size={13} />
            </button>
          </div>
          {showEvidence && (
            <section className="supplier-evidence-grid">
              {record.evidence.length ? (
                record.evidence.map((evidence) => (
                  <article className="panel" key={evidence.id}>
                    <EvidencePreview
                      evidence={evidence}
                      token={token}
                      compact
                    />
                    <div className="supplier-evidence-caption">
                      <strong>{evidence.fileName}</strong>
                      <span>
                        {evidence.lineId
                          ? record.lines.find(
                              (line) => line.id === evidence.lineId,
                            )?.description
                          : "Delivery evidence"}
                      </span>
                    </div>
                  </article>
                ))
              ) : (
                <p>No supporting files were attached to this record.</p>
              )}
            </section>
          )}
          <div className="supplier-review-grid">
            <section>
              <div className="section-heading">
                <div>
                  <h2>
                    {discrepancies.length} item
                    {discrepancies.length !== 1 ? "s" : ""} to review
                  </h2>
                  <p>Item values exclude taxes and discounts.</p>
                </div>
              </div>
              {discrepancies.length === 0 && (
                <div className="panel empty-state">
                  <PackageCheck size={33} />
                  <h3>This delivery has no discrepancies.</h3>
                  <p>The receiver’s confirmed counts match the invoice.</p>
                </div>
              )}
              {discrepancies.map((result) => {
                const line = record.lines.find(
                  (item) => item.id === result.lineId,
                )!;
                const previous = record.responses.find(
                  (response) =>
                    response.lineId === line.id &&
                    response.revision === record.revision,
                );
                const choice = choices[line.id];
                return (
                  <article className="supplier-item panel" key={line.id}>
                    <div className="supplier-item-heading">
                      <span className="supplier-icon">
                        <PackageCheck size={20} />
                      </span>
                      <div>
                        <h3>{line.description}</h3>
                        <span>
                          {line.billedQty} {line.billedUnit}
                          {line.packSize
                            ? ` × ${line.packSize} units`
                            : ""}{" "}
                          billed · {money(line.unitPriceMinor)} per{" "}
                          {line.billedUnit}
                        </span>
                      </div>
                      <strong>{money(result.discrepancyMinor)}</strong>
                    </div>
                    <div className="supplier-counts">
                      <div>
                        <span>Expected</span>
                        <strong>{result.expectedUnits}</strong>
                      </div>
                      <div>
                        <span>Received</span>
                        <strong>{line.receivedQty}</strong>
                      </div>
                      <div>
                        <span>Missing</span>
                        <strong>{result.shortage}</strong>
                      </div>
                      <div>
                        <span>Damaged</span>
                        <strong>{result.damaged}</strong>
                      </div>
                      <div>
                        <span>Wrong</span>
                        <strong>{result.wrong}</strong>
                      </div>
                    </div>
                    {line.note && (
                      <div className="receiver-note">
                        <span>RECEIVER’S OBSERVATION</span>
                        <p>{line.note}</p>
                      </div>
                    )}
                    {previous && (
                      <div className={`supplier-response ${previous.decision}`}>
                        <CheckCheck size={17} />
                        <div>
                          <strong>
                            {previous.decision === "acknowledged"
                              ? "Acknowledged"
                              : "Disputed"}{" "}
                            by {previous.actor}
                          </strong>
                          <p>{previous.note || "No additional note."}</p>
                          <small>
                            {date(previous.at, true)} · Name supplied by
                            responder
                          </small>
                        </div>
                      </div>
                    )}
                    {!success && !closed && (
                      <>
                        <fieldset className="response-options">
                          <legend>Your response</legend>
                          <label
                            className={
                              choice?.decision === "acknowledged"
                                ? "checked acknowledged"
                                : ""
                            }
                          >
                            <input
                              type="radio"
                              name={`decision-${line.id}`}
                              checked={choice?.decision === "acknowledged"}
                              onChange={() =>
                                setChoices({
                                  ...choices,
                                  [line.id]: {
                                    decision: "acknowledged",
                                    note: choice?.note || "",
                                  },
                                })
                              }
                            />
                            <Check size={17} />
                            <span>Acknowledge</span>
                          </label>
                          <label
                            className={
                              choice?.decision === "disputed"
                                ? "checked disputed"
                                : ""
                            }
                          >
                            <input
                              type="radio"
                              name={`decision-${line.id}`}
                              checked={choice?.decision === "disputed"}
                              onChange={() =>
                                setChoices({
                                  ...choices,
                                  [line.id]: {
                                    decision: "disputed",
                                    note: choice?.note || "",
                                  },
                                })
                              }
                            />
                            <AlertCircle size={17} />
                            <span>Dispute</span>
                          </label>
                        </fieldset>
                        {choice && (
                          <label className="response-note">
                            {choice.decision === "disputed"
                              ? "Explain the disagreement"
                              : "Add a note"}{" "}
                            <span className="optional">
                              {choice.decision === "disputed"
                                ? "Required"
                                : "Optional"}
                            </span>
                            <textarea
                              rows={2}
                              maxLength={500}
                              value={choice.note}
                              placeholder={
                                choice.decision === "disputed"
                                  ? "What should the receiver know?"
                                  : "e.g. We will review this for the next credit note."
                              }
                              onChange={(e) =>
                                setChoices({
                                  ...choices,
                                  [line.id]: {
                                    ...choice,
                                    note: e.target.value,
                                  },
                                })
                              }
                            />
                          </label>
                        )}
                      </>
                    )}
                  </article>
                );
              })}
            </section>
            <aside>
              <section className="panel supplier-submit">
                <span className="panel-icon">
                  <ClipboardCheck size={24} />
                </span>
                <h2>
                  {closed
                    ? "This record is closed."
                    : success
                      ? "Thank you for the clarity."
                      : "Your response matters."}
                </h2>
                <p>
                  {closed
                    ? "You can review the final evidence and responses. Further changes are disabled."
                    : success
                      ? "Your response has been saved against this exact revision of the delivery."
                      : "Acknowledge the observed discrepancy, or explain where your records differ."}
                </p>
                {!success && !closed && discrepancies.length > 0 && (
                  <>
                    <label>
                      Your name
                      <input
                        maxLength={80}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Name of the person responding"
                      />
                    </label>
                    <p className="field-hint">
                      This name is self-reported and recorded with your
                      response.
                    </p>
                    <div className="response-progress">
                      <span>
                        {
                          discrepancies.filter((line) => choices[line.lineId])
                            .length
                        }{" "}
                        / {discrepancies.length} decisions selected
                      </span>
                      <strong>
                        {Math.round(
                          (discrepancies.filter((line) => choices[line.lineId])
                            .length /
                            discrepancies.length) *
                            100,
                        )}
                        %
                      </strong>
                    </div>
                    <button
                      className="button button-primary full-width"
                      disabled={!complete || busy}
                      onClick={() => setConfirm(true)}
                    >
                      {busy ? (
                        <Spinner label="Saving response…" />
                      ) : (
                        <>
                          Review & submit <ArrowRight size={16} />
                        </>
                      )}
                    </button>
                  </>
                )}
                <div className="supplier-disclaimer">
                  <ShieldCheck size={16} />
                  <span>
                    Acknowledging a discrepancy records agreement with the
                    observation. It does not issue a credit, transfer money, or
                    confirm a refund.
                  </span>
                </div>
              </section>
            </aside>
          </div>
          <div className="supplier-bottom-note">
            <LockKeyhole size={14} />
            This review is limited to one saved delivery. A changed or expired
            link requires a new invitation.
          </div>
        </main>
      )}
      <footer className="supplier-footer">
        <PackageCheck size={15} />
        ReceiveRight
        <span>Clear counts. Shared evidence. Better conversations.</span>
      </footer>
      {confirm && (
        <Modal
          title="Submit these responses?"
          eyebrow="CONFIRM SUPPLIER RESPONSE"
          onClose={() => {
            if (!busy) setConfirm(false);
          }}
        >
          <p className="modal-description">
            Your decisions and notes will be saved against revision{" "}
            {record?.revision}, with the name <strong>{name.trim()}</strong>.
          </p>
          <div className="response-confirm">
            <span>
              <CheckCheck size={19} />
              Acknowledging{" "}
              {
                Object.values(choices).filter(
                  (choice) => choice.decision === "acknowledged",
                ).length
              }{" "}
              item(s)
            </span>
            <span>
              <AlertCircle size={19} />
              Disputing{" "}
              {
                Object.values(choices).filter(
                  (choice) => choice.decision === "disputed",
                ).length
              }{" "}
              item(s)
            </span>
          </div>
          <div className="modal-actions">
            <button
              className="button button-secondary"
              disabled={busy}
              onClick={() => setConfirm(false)}
            >
              Keep reviewing
            </button>
            <button
              className="button button-primary"
              disabled={busy}
              onClick={respond}
            >
              {busy ? (
                <Spinner label="Submitting…" />
              ) : (
                <>
                  <Check size={17} />
                  Submit response
                </>
              )}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
