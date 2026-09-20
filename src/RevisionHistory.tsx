import { useEffect, useState } from "react";
import {
  Archive,
  Camera,
  Download,
  LockKeyhole,
  MessageSquare,
  RefreshCw,
} from "lucide-react";
import type {
  CaseStatus,
  ReceivingCase,
  Reconciliation,
} from "../shared/types";
import { api, date, errorMessage, money } from "./api";
import { ErrorBox, EvidencePreview, Spinner, Status } from "./ui";

interface SnapshotMetadata {
  snapshotId: string;
  revision: number;
  savedAt: string;
  action: string;
  status: CaseStatus;
  lineCount: number;
  evidenceCount: number;
  responseCount: number;
  isCurrent: boolean;
  legacyBaseline?: boolean;
}
interface Snapshot {
  snapshotId: string;
  savedAt: string;
  record: ReceivingCase;
  reconciliation: Reconciliation;
  notice: string;
}
const actionLabel = (value: string) =>
  value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());

export default function RevisionHistory({
  caseId,
  updatedAt,
}: {
  caseId: string;
  updatedAt: string;
}) {
  const [entries, setEntries] = useState<SnapshotMetadata[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    api<{ revisions: SnapshotMetadata[]; notice: string }>(
      `/cases/${caseId}/revisions`,
    )
      .then((result) => {
        if (!active) return;
        setEntries(result.revisions);
        setNotice(result.notice);
        setSelectedId(result.revisions[0]?.snapshotId || "");
        if (!result.revisions.length) setLoading(false);
      })
      .catch((error) => {
        if (active) {
          setError(errorMessage(error));
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [caseId, updatedAt, refreshKey]);
  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    setLoading(true);
    setError("");
    setSnapshot(null);
    api<Snapshot>(
      `/cases/${caseId}/revisions/${encodeURIComponent(selectedId)}`,
    )
      .then((result) => {
        if (active) setSnapshot(result);
      })
      .catch((error) => {
        if (active) setError(errorMessage(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [caseId, selectedId, refreshKey]);
  const metadata = entries.find((entry) => entry.snapshotId === selectedId);
  function downloadSnapshot() {
    if (!snapshot) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(snapshot, null, 2)], {
        type: "application/json",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `${snapshot.record.caseNumber}-revision-${snapshot.record.revision}-${snapshot.snapshotId}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section className="panel revision-panel">
      <div className="panel-heading">
        <div>
          <h2>
            <Archive size={18} />
            Every saved version, in context.
          </h2>
          <p>
            Read the quantities, evidence and supplier responses preserved at
            each point.
          </p>
        </div>
        <button
          className="icon-button"
          aria-label="Refresh revision history"
          onClick={() => setRefreshKey((value) => value + 1)}
          disabled={loading}
        >
          <RefreshCw size={17} />
        </button>
      </div>
      {entries.length > 0 && (
        <div className="revision-picker">
          <label>
            Saved version
            <select
              value={selectedId}
              onChange={(event) => setSelectedId(event.target.value)}
            >
              {entries.map((entry) => (
                <option key={entry.snapshotId} value={entry.snapshotId}>
                  Revision {entry.revision} · {actionLabel(entry.action)} ·{" "}
                  {date(entry.savedAt, true)}
                  {entry.isCurrent ? " · Latest" : ""} · {entry.responseCount}{" "}
                  response{entry.responseCount === 1 ? "" : "s"}
                </option>
              ))}
            </select>
          </label>
          <span className="readonly-label">
            <LockKeyhole size={14} />
            Read-only snapshot
          </span>
        </div>
      )}
      {error && (
        <ErrorBox
          error={error}
          retry={() => setRefreshKey((value) => value + 1)}
        />
      )}
      {loading ? (
        <div className="detail-loading">
          <Spinner label="Loading saved version…" />
        </div>
      ) : snapshot ? (
        <div className="revision-content">
          <div className="revision-summary">
            <div>
              <span className="eyebrow">
                REVISION {snapshot.record.revision}
              </span>
              <h3>{snapshot.record.supplier}</h3>
              <p>
                {snapshot.record.invoiceNumber || "No invoice number"} ·{" "}
                {snapshot.record.shopName} · Saved{" "}
                {date(snapshot.savedAt, true)}
              </p>
            </div>
            <Status status={snapshot.record.status} />
            <button
              className="button button-secondary"
              onClick={downloadSnapshot}
            >
              <Download size={15} />
              Export this version
            </button>
          </div>
          {metadata?.legacyBaseline && (
            <div className="notice notice-warning">
              <p>
                This is the earliest retained snapshot for this older record.
                Versions before it are not available.
              </p>
            </div>
          )}
          <div className="revision-table-wrap">
            <table className="revision-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Billed</th>
                  <th>Pack size</th>
                  <th>Received</th>
                  <th>Damaged / wrong</th>
                  <th>Discrepancy</th>
                  <th>Reviewed</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.record.lines.map((line, index) => (
                  <tr key={line.id}>
                    <td>
                      <strong>{line.description || "Unnamed item"}</strong>
                      {line.note && <small>{line.note}</small>}
                    </td>
                    <td>
                      {line.billedQty ?? "Unknown"}{" "}
                      {line.billedUnit === "unknown"
                        ? "· unit unknown"
                        : line.billedUnit}
                      <small>{money(line.unitPriceMinor)} / billed unit</small>
                    </td>
                    <td>{line.packSize ?? "—"}</td>
                    <td>{line.receivedQty ?? "Not counted"}</td>
                    <td>
                      {line.damagedQty} / {line.wrongQty}
                    </td>
                    <td>
                      {snapshot.reconciliation.lines[index]?.discrepancyUnits ??
                        0}{" "}
                      units
                      <small>
                        {money(
                          snapshot.reconciliation.lines[index]
                            ?.discrepancyMinor,
                        )}
                      </small>
                    </td>
                    <td>{line.confirmed ? "Confirmed" : "Needs review"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!snapshot.record.lines.length && (
            <p className="revision-empty">
              No invoice items had been added at this point.
            </p>
          )}
          <div className="revision-section-heading">
            <MessageSquare size={18} />
            <h3>Supplier responses at this point</h3>
            <span className="count-badge">
              {snapshot.record.responses.length}
            </span>
          </div>
          {snapshot.record.responses.length ? (
            <div className="revision-responses">
              {snapshot.record.responses.map((response, index) => (
                <article
                  key={`${response.lineId}-${index}`}
                  className={`historical-response ${response.decision}`}
                >
                  <div>
                    <strong>
                      {snapshot.record.lines.find(
                        (line) => line.id === response.lineId,
                      )?.description || "Item from this version"}
                    </strong>
                    <span>
                      {response.decision === "acknowledged"
                        ? "Acknowledged"
                        : "Disputed"}
                    </span>
                  </div>
                  <p>{response.note || "No written note provided."}</p>
                  <small>
                    {response.actor} · {date(response.at, true)} · revision{" "}
                    {response.revision}
                  </small>
                </article>
              ))}
            </div>
          ) : (
            <p className="revision-empty">
              No supplier responses had been saved at this point.
            </p>
          )}
          <div className="revision-section-heading">
            <Camera size={18} />
            <h3>Evidence in this version</h3>
            <span className="count-badge">
              {snapshot.record.evidence.length}
            </span>
          </div>
          {snapshot.record.evidence.length ? (
            <div className="revision-evidence">
              {snapshot.record.evidence.map((evidence) => (
                <article key={evidence.id}>
                  <EvidencePreview evidence={evidence} compact />
                  <strong>{evidence.fileName}</strong>
                  <small>
                    {evidence.kind === "invoice"
                      ? "Original invoice"
                      : "Delivery photograph"}{" "}
                    · {date(evidence.createdAt, true)}
                  </small>
                </article>
              ))}
            </div>
          ) : (
            <p className="revision-empty">
              No files had been attached at this point.
            </p>
          )}
          {(notice || snapshot.notice) && (
            <p className="field-hint revision-notice">
              {snapshot.notice || notice}
            </p>
          )}
        </div>
      ) : (
        !error && (
          <div className="empty-state">
            <Archive size={28} />
            <h3>No snapshots available yet.</h3>
            <p>Saved versions will appear here as this record changes.</p>
          </div>
        )
      )}
    </section>
  );
}
