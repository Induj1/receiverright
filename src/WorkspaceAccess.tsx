import { useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  Download,
  KeyRound,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import type { Session } from "../shared/types";
import { api, date, errorMessage, post } from "./api";
import { CopyButton, ErrorBox, Modal, Spinner } from "./ui";

export interface WorkspaceAccessStatus {
  recoveryEnabled: boolean;
  recoveryUpdatedAt?: string;
  sessionExpiresAt: string;
}

export function RestoreWorkspace({
  onClose,
  onRestored,
}: {
  onClose: () => void;
  onRestored: (session: Session) => Promise<void>;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal
      title="Return to your receiving desk."
      eyebrow="RESTORE WORKSPACE"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <p className="modal-description">
        Enter the recovery code you saved in Workspace settings. Your records,
        evidence and supplier responses will come with you.
      </p>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError("");
          try {
            const session = await post<Session>(
              "/sessions/recover",
              { recoveryCode: code.trim() },
              "",
            );
            await onRestored(session);
          } catch (error) {
            setError(errorMessage(error));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="full-label">
          Recovery code
          <input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            type="password"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            required
            autoFocus
            placeholder="RR-…"
            disabled={busy}
          />
        </label>
        <p className="field-hint">
          The code is case-sensitive. Your current workspace stays open if
          restoration fails.
        </p>
        {error && <ErrorBox error={error} />}
        <div className="modal-actions">
          <button
            type="button"
            className="button button-secondary"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            className="button button-primary"
            disabled={busy || !code.trim()}
          >
            {busy ? (
              <Spinner label="Restoring…" />
            ) : (
              <>
                Restore workspace <ArrowRight size={16} />
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function WorkspaceSettings({
  session,
  onClose,
  onChange,
  onRestore,
  onAccessChange,
}: {
  session: Session | null;
  onClose: () => void;
  onChange: (session: Session) => Promise<void>;
  onRestore: () => void;
  onAccessChange: (status: WorkspaceAccessStatus) => void;
}) {
  const [name, setName] = useState(session?.name || "My store");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState<WorkspaceAccessStatus | null>(null);
  const [recoveryCode, setRecoveryCode] = useState("");
  const [codeSaved, setCodeSaved] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);
  useEffect(() => {
    let active = true;
    api<WorkspaceAccessStatus>("/workspace")
      .then((result) => {
        if (active) setStatus(result);
      })
      .catch((error) => {
        if (active) setError(errorMessage(error));
      });
    return () => {
      active = false;
    };
  }, []);
  function mayLeave() {
    if (busy) return false;
    if (recoveryCode && !codeSaved) {
      setError(
        "Save the new recovery code and tick the confirmation before closing this window.",
      );
      return false;
    }
    return true;
  }
  async function generateCode() {
    setBusy("recovery");
    setError("");
    try {
      const result = await post<{ recoveryCode: string; createdAt: string }>(
        "/workspace/recovery",
      );
      setRecoveryCode(result.recoveryCode);
      setCodeSaved(false);
      setConfirmRotate(false);
      const next = await api<WorkspaceAccessStatus>("/workspace");
      setStatus(next);
      onAccessChange(next);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy("");
    }
  }
  function downloadCode() {
    const text = `ReceiveRight workspace recovery\n\nWorkspace: ${name}\nRecovery code: ${recoveryCode}\n\nRestore at ${location.origin} using Workspace settings > Restore a workspace.\nAnyone with this code can access this workspace. Store it somewhere private, separately from this browser.\nA newly generated recovery code replaces this one.\n`;
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "ReceiveRight-Recovery-Code.txt";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <Modal
      title="A desk you can come back to."
      eyebrow="WORKSPACE SETTINGS"
      onClose={() => {
        if (mayLeave()) onClose();
      }}
    >
      <label className="full-label">
        Workspace display name
        <input
          maxLength={80}
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={!!busy}
        />
      </label>
      <p className="field-hint">
        Saved on this browser. Existing records keep their original shop name.
      </p>
      <section className="recovery-section" aria-labelledby="recovery-heading">
        <div className="recovery-heading">
          <span className="recovery-icon">
            <KeyRound size={20} />
          </span>
          <div>
            <h3 id="recovery-heading">Keep access to your records</h3>
            <p>
              {status?.recoveryEnabled
                ? "Recovery is set up for this workspace."
                : "Save a recovery code before changing devices or clearing your browser."}
            </p>
          </div>
        </div>
        {recoveryCode ? (
          <>
            <label className="full-label">
              Your new recovery code{" "}
              <span className="optional">Shown only here</span>
              <textarea
                className="recovery-code"
                readOnly
                rows={3}
                value={recoveryCode}
                onFocus={(event) => event.target.select()}
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <div className="button-row">
              <CopyButton value={recoveryCode} label="Copy code" />
              <button
                className="button button-secondary"
                onClick={downloadCode}
              >
                <Download size={15} />
                Download code
              </button>
            </div>
            <p className="field-hint">
              Anyone with this code can open your workspace. Save it privately,
              separately from this browser.
            </p>
            <label className="recovery-confirm">
              <input
                type="checkbox"
                checked={codeSaved}
                onChange={(event) => setCodeSaved(event.target.checked)}
              />
              I saved my recovery code somewhere safe.
            </label>
          </>
        ) : status ? (
          <>
            {status.recoveryUpdatedAt && (
              <p className="field-hint">
                Last generated {date(status.recoveryUpdatedAt, true)}. The saved
                code cannot be displayed again.
              </p>
            )}
            {confirmRotate ? (
              <div className="notice notice-warning">
                <div>
                  <strong>Replace the current recovery code?</strong>
                  <p>
                    The old code will stop working. Devices already signed in
                    will stay connected.
                  </p>
                  <div className="button-row">
                    <button
                      className="button button-primary"
                      onClick={generateCode}
                      disabled={!!busy}
                    >
                      {busy === "recovery"
                        ? "Generating…"
                        : "Replace recovery code"}
                    </button>
                    <button
                      className="text-button"
                      onClick={() => setConfirmRotate(false)}
                      disabled={!!busy}
                    >
                      Keep current code
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <button
                className="button button-secondary"
                onClick={() =>
                  status.recoveryEnabled
                    ? setConfirmRotate(true)
                    : void generateCode()
                }
                disabled={!!busy}
              >
                <KeyRound size={15} />
                {busy === "recovery"
                  ? "Generating…"
                  : status.recoveryEnabled
                    ? "Replace recovery code"
                    : "Create recovery code"}
              </button>
            )}
          </>
        ) : (
          !error && <Spinner label="Checking workspace access…" />
        )}
      </section>
      {status && (
        <div className="session-access">
          <ShieldCheck size={17} />
          <div>
            <strong>This device is connected</strong>
            <small>
              Session expires {date(status.sessionExpiresAt, true)}. Active
              sessions renew automatically.
            </small>
          </div>
          <button
            className="text-button"
            disabled={!!busy || (!!recoveryCode && !codeSaved)}
            onClick={async () => {
              setBusy("renew");
              setError("");
              try {
                const renewed = await post<Session>("/sessions/renew");
                await onChange({
                  ...renewed,
                  name: session?.name || renewed.name,
                });
              } catch (error) {
                setError(errorMessage(error));
              } finally {
                setBusy("");
              }
            }}
          >
            <RefreshCw size={14} />
            Renew
          </button>
        </div>
      )}
      {error && <ErrorBox error={error} />}
      <div className="modal-actions">
        <button
          className="button button-secondary"
          onClick={() => {
            if (mayLeave()) onClose();
          }}
          disabled={!!busy}
        >
          Close
        </button>
        <button
          className="button button-primary"
          disabled={!name.trim() || !!busy || (!!recoveryCode && !codeSaved)}
          onClick={async () => {
            if (!session) return;
            setBusy("save");
            setError("");
            try {
              await onChange({ ...session, name: name.trim() });
            } catch (error) {
              setError(errorMessage(error));
            } finally {
              setBusy("");
            }
          }}
        >
          <Check size={16} />
          Save preferences
        </button>
      </div>
      <div className="settings-new">
        <h3>Use another workspace</h3>
        <p>
          Restore a saved workspace with its recovery code, or start a separate
          empty desk.
        </p>
        <div className="button-row">
          <button
            className="button button-secondary"
            disabled={!!busy}
            onClick={() => {
              if (mayLeave()) onRestore();
            }}
          >
            Restore a workspace
          </button>
          <button
            className="text-button"
            disabled={!!busy}
            onClick={() => {
              if (mayLeave()) setConfirmNew(true);
            }}
          >
            Create another workspace
          </button>
        </div>
        {confirmNew && (
          <div className="notice notice-warning">
            <div>
              <p>
                Save this workspace’s recovery code before switching. Without
                it, clearing this device’s access can leave your records
                inaccessible.
              </p>
              <div className="button-row">
                <button
                  className="button button-secondary"
                  disabled={!!busy}
                  onClick={async () => {
                    setBusy("new");
                    setError("");
                    try {
                      await onChange(
                        await post<Session>("/sessions", {
                          name: name.trim() || "My store",
                        }),
                      );
                    } catch (error) {
                      setError(errorMessage(error));
                    } finally {
                      setBusy("");
                    }
                  }}
                >
                  {busy === "new" ? "Creating…" : "Create and switch workspace"}
                </button>
                <button
                  className="text-button"
                  disabled={!!busy}
                  onClick={() => setConfirmNew(false)}
                >
                  Stay here
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
