import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Bell,
  BookOpen,
  Boxes,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  Cloud,
  FileCheck2,
  FilePlus2,
  FileText,
  FolderOpen,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Package,
  PackageCheck,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import type { Health, ReceivingCase, Session } from "../shared/types";
import { reconcileCase } from "../shared/domain";
import {
  api,
  ApiError,
  date,
  errorMessage,
  money,
  post,
  readSession,
  storeSession,
  uploadFile,
  validateUpload,
} from "./api";
import { ErrorBox, Modal, Spinner, Status, statusLabels } from "./ui";
import CaseDetail from "./CaseDetail";
import SupplierReview from "./SupplierReview";
import WorkspaceSettings, {
  RestoreWorkspace,
  type WorkspaceAccessStatus,
} from "./WorkspaceAccess";

export default function App() {
  const [path, setPath] = useState(location.pathname);
  const pathRef = useRef(path);
  const [session, setSession] = useState<Session | null>(readSession);
  const [health, setHealth] = useState<Health | null>(null);
  const [cases, setCases] = useState<ReceivingCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sessionExpired, setSessionExpired] = useState(false);
  const [newCase, setNewCase] = useState(false);
  const [settings, setSettings] = useState(false);
  const [restore, setRestore] = useState(false);
  const [access, setAccess] = useState<WorkspaceAccessStatus | null>(null);
  const [toast, setToast] = useState("");
  const [busySample, setBusySample] = useState(false);
  const sessionPromise = useRef<Promise<Session> | null>(null);
  const supplierId = path.match(/^\/review\/([^/]+)/)?.[1];
  const caseId = path.match(/^\/cases\/([^/]+)/)?.[1];
  const view =
    path === "/help" ? "help" : path === "/cases" ? "cases" : "dashboard";
  useEffect(() => {
    pathRef.current = path;
  }, [path]);
  useEffect(() => {
    const listener = () => {
      const destination = location.pathname;
      const navigation = new CustomEvent("receiverright:navigate", {
        detail: { to: destination },
        cancelable: true,
      });
      window.dispatchEvent(navigation);
      if (navigation.defaultPrevented) {
        history.pushState({}, "", pathRef.current);
        return;
      }
      setPath(destination);
    };
    addEventListener("popstate", listener);
    return () => removeEventListener("popstate", listener);
  }, []);
  useEffect(() => {
    api<Health>("/health")
      .then(setHealth)
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4200);
    return () => clearTimeout(timer);
  }, [toast]);
  async function loadCases(token?: string) {
    const result = await api<{ cases: ReceivingCase[] }>("/cases", {}, token);
    setCases(result.cases);
  }
  useEffect(() => {
    if (supplierId) {
      setLoading(false);
      return;
    }
    let active = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        let current = readSession();
        if (!current) {
          sessionPromise.current ||= post<Session>("/sessions", {
            name: "My store",
          });
          current = await sessionPromise.current;
          storeSession(current);
        }
        if (active) {
          setSession(current);
          await loadCases(current.token);
          const workspace = await api<WorkspaceAccessStatus>(
            "/workspace",
            {},
            current.token,
          );
          if (!active) return;
          setAccess(workspace);
          if (
            new Date(workspace.sessionExpiresAt).getTime() - Date.now() <
            24 * 60 * 60 * 1000
          ) {
            const renewed = await post<Session>(
              "/sessions/renew",
              {},
              current.token,
            );
            if (!active) return;
            current = { ...renewed, name: current.name };
            storeSession(current);
            setSession(current);
            setAccess(
              await api<WorkspaceAccessStatus>("/workspace", {}, current.token),
            );
          }
        }
      } catch (e) {
        if (active) {
          setError(errorMessage(e));
          if (e instanceof ApiError && e.status === 401)
            setSessionExpired(true);
        }
        sessionPromise.current = null;
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [Boolean(supplierId)]);
  useEffect(() => {
    const expired = () => {
      if (pathRef.current.startsWith("/cases/")) {
        setRestore(true);
        setError(
          "Workspace access expired. Restore access with your recovery code to keep working.",
        );
      } else setSessionExpired(true);
    };
    window.addEventListener("receiverright:session-expired", expired);
    return () =>
      window.removeEventListener("receiverright:session-expired", expired);
  }, []);
  useEffect(() => {
    if (!access || !session || sessionExpired || supplierId) return;
    let active = true;
    const delay = Math.max(
      1000,
      new Date(access.sessionExpiresAt).getTime() -
        Date.now() -
        24 * 60 * 60 * 1000,
    );
    const timer = setTimeout(async () => {
      try {
        const next = await post<Session>("/sessions/renew", {}, session.token);
        if (!active || readSession()?.token !== session.token) return;
        const current = { ...next, name: readSession()?.name || next.name };
        storeSession(current);
        setSession(current);
        const workspace = await api<WorkspaceAccessStatus>(
          "/workspace",
          {},
          current.token,
        );
        if (readSession()?.token === current.token) setAccess(workspace);
      } catch {
        // Authentication failures display the restore screen through the API event.
      }
    }, delay);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [
    access?.sessionExpiresAt,
    session?.token,
    sessionExpired,
    Boolean(supplierId),
  ]);
  async function changeWorkspace(next: Session) {
    if (session?.workspaceId === next.workspaceId) {
      const workspace = await api<WorkspaceAccessStatus>(
        "/workspace",
        {},
        next.token,
      );
      if (sessionExpired) await loadCases(next.token);
      storeSession(next);
      setSession(next);
      setAccess(workspace);
      setSettings(false);
      setRestore(false);
      setSessionExpired(false);
      setError("");
      setToast(
        next.token !== session.token
          ? "Workspace access restored. Your record stays open."
          : "Workspace preferences saved.",
      );
      return;
    }
    const navigation = new CustomEvent("receiverright:navigate", {
      detail: { to: "/", probe: true },
      cancelable: true,
    });
    window.dispatchEvent(navigation);
    if (navigation.defaultPrevented)
      throw new Error(
        "Save or discard your current record changes before switching workspaces.",
      );
    const result = await api<{ cases: ReceivingCase[] }>(
      "/cases",
      {},
      next.token,
    );
    const workspace = await api<WorkspaceAccessStatus>(
      "/workspace",
      {},
      next.token,
    );
    storeSession(next);
    setSession(next);
    setCases(result.cases);
    setAccess(workspace);
    setSessionExpired(false);
    setError("");
    setSettings(false);
    setRestore(false);
    navigate("/", true);
    setToast("Workspace opened. Your saved records are ready.");
  }
  const navigate = (to: string, discardConfirmed = false) => {
    if (!discardConfirmed) {
      const navigation = new CustomEvent("receiverright:navigate", {
        detail: { to },
        cancelable: true,
      });
      window.dispatchEvent(navigation);
      if (navigation.defaultPrevented) return;
    }
    history.pushState({}, "", to);
    setPath(to);
    window.scrollTo({ top: 0 });
  };
  const changed = (record: ReceivingCase) =>
    setCases((previous) =>
      [record, ...previous.filter((c) => c.id !== record.id)].sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt),
      ),
    );
  async function startAfterExpiry() {
    setLoading(true);
    try {
      const next = await post<Session>(
        "/sessions",
        { name: session?.name || "My store" },
        "",
      );
      const workspace = await api<WorkspaceAccessStatus>(
        "/workspace",
        {},
        next.token,
      );
      storeSession(next);
      setSession(next);
      setAccess(workspace);
      setCases([]);
      setSessionExpired(false);
      setError("");
      navigate("/");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }
  async function sample() {
    setBusySample(true);
    try {
      const record = await post<ReceivingCase>("/cases/sample");
      changed(record);
      setNewCase(false);
      navigate(`/cases/${record.id}`);
      setToast("Sample delivery created. All sample data is synthetic.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusySample(false);
    }
  }
  if (supplierId)
    return <SupplierReview shareId={supplierId} notify={setToast} />;
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className="sidebar">
        <button
          className="brand"
          onClick={() => navigate("/")}
          aria-label="ReceiveRight home"
        >
          <span className="brand-mark">
            <PackageCheck size={23} strokeWidth={1.7} />
          </span>
          <span>
            Receive<span className="brand-light">Right</span>
            <small>EVERY DELIVERY ACCOUNTED FOR.</small>
          </span>
        </button>
        <button className="workspace-switch" onClick={() => setSettings(true)}>
          <span className="workspace-avatar">
            {(session?.name || "M").slice(0, 1).toUpperCase()}
          </span>
          <span>
            <strong>{session?.name || "Your workspace"}</strong>
            <small>Receiving workspace</small>
          </span>
          <ChevronDown size={15} />
        </button>
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          <button
            className={view === "dashboard" && !caseId ? "active" : ""}
            onClick={() => navigate("/")}
          >
            <LayoutDashboard size={19} />
            Overview
          </button>
          <button
            className={view === "cases" || caseId ? "active" : ""}
            onClick={() => navigate("/cases")}
          >
            <FolderOpen size={19} />
            Receiving records<span className="nav-count">{cases.length}</span>
          </button>
          <button
            className={view === "help" ? "active" : ""}
            onClick={() => navigate("/help")}
          >
            <BookOpen size={19} />
            How it works
          </button>
        </nav>
        <div className="sidebar-tip">
          <div className="tip-icon">
            <ShieldCheck size={21} />
          </div>
          <strong>A little proof. A lot of clarity.</strong>
          <p>Keep the invoice, counts, and supplier response in one place.</p>
          <button onClick={() => navigate("/help")}>
            Explore the workflow <ArrowUpRight size={14} />
          </button>
        </div>
        <div className="sidebar-bottom">
          <button onClick={() => setSettings(true)}>
            <Settings2 size={18} />
            Workspace settings
          </button>
          <div className="connection">
            <span
              className={health ? "connection-dot" : "connection-dot offline"}
            />
            {health?.storage === "dynamodb"
              ? "Connected to AWS"
              : health
                ? "Local workspace connected"
                : "Connecting to workspace"}
            <Cloud size={14} />
          </div>
          <div className="sidebar-footer">BUILT FOR THE EVERYDAY DELIVERY.</div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <span className="mobile-brand">
              <PackageCheck size={22} />
            </span>
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>
              {caseId
                ? "Receiving record"
                : view === "help"
                  ? "Guide & architecture"
                  : view === "cases"
                    ? "Receiving records"
                    : "Overview"}
            </strong>
          </div>
          <div className="topbar-right">
            <span className="private-label">
              <ShieldCheck size={14} />
              Private workspace
            </span>
            <button
              className="icon-button"
              aria-label="Help and architecture"
              onClick={() => navigate("/help")}
            >
              <CircleHelp size={20} />
            </button>
            <button
              className="user-avatar"
              aria-label="Workspace settings"
              onClick={() => setSettings(true)}
            >
              {(session?.name || "M").slice(0, 1).toUpperCase()}
            </button>
          </div>
        </header>
        <main
          id="main-content"
          className={caseId ? "content detail-content" : "content"}
        >
          {!loading &&
            !sessionExpired &&
            access &&
            !access.recoveryEnabled &&
            !caseId && (
              <div className="workspace-reminder">
                <ShieldCheck size={18} />
                <div>
                  <strong>Keep your records within reach.</strong>
                  <span>Save a recovery code to return on another device.</span>
                </div>
                <button
                  className="text-button"
                  onClick={() => setSettings(true)}
                >
                  Set up recovery <ArrowRight size={14} />
                </button>
              </div>
            )}
          {loading ? (
            <LoadingPage />
          ) : sessionExpired ? (
            <section className="panel empty-state">
              <ShieldCheck size={30} />
              <h2>Your workspace access has expired.</h2>
              <p>
                Restore your saved records with your recovery code. If you have
                another connected device, create a code in its Workspace
                settings first.
              </p>
              <ErrorBox error={error} />
              <div className="button-row">
                <button
                  className="button button-primary"
                  onClick={() => setRestore(true)}
                >
                  Restore my workspace <ArrowRight size={16} />
                </button>
                <button
                  className="button button-secondary"
                  onClick={startAfterExpiry}
                >
                  Start an empty workspace
                </button>
              </div>
            </section>
          ) : error && !session ? (
            <ErrorBox error={error} retry={() => location.reload()} />
          ) : caseId ? (
            <CaseDetail
              caseId={caseId}
              onChange={changed}
              navigate={navigate}
              notify={setToast}
              health={health}
            />
          ) : view === "help" ? (
            <Help health={health} onNew={() => setNewCase(true)} />
          ) : (
            <Dashboard
              records={cases}
              allRecords={view === "cases"}
              onNew={() => setNewCase(true)}
              onSample={sample}
              sampleBusy={busySample}
              navigate={navigate}
            />
          )}
          {error && session && !caseId && !sessionExpired && (
            <div className="page-error">
              <ErrorBox
                error={error}
                retry={() => {
                  setError("");
                  void loadCases().catch((e) => {
                    setError(errorMessage(e));
                    if (e instanceof ApiError && e.status === 401)
                      setSessionExpired(true);
                  });
                }}
              />
            </div>
          )}
        </main>
        <footer className="main-footer">
          <span>
            <PackageCheck size={14} /> ReceiveRight
          </span>
          <span>
            Human-confirmed counts. Clear calculations. Shared evidence.
          </span>
          <button onClick={() => navigate("/help")}>
            Built with AWS <ArrowUpRight size={12} />
          </button>
        </footer>
      </div>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        <button
          className={view === "dashboard" && !caseId ? "active" : ""}
          onClick={() => navigate("/")}
        >
          <LayoutDashboard size={20} />
          Overview
        </button>
        <button
          className={view === "cases" || caseId ? "active" : ""}
          onClick={() => navigate("/cases")}
        >
          <FolderOpen size={20} />
          Records
        </button>
        <button onClick={() => setNewCase(true)}>
          <Plus size={22} />
          New record
        </button>
        <button onClick={() => navigate("/help")}>
          <BookOpen size={20} />
          Guide
        </button>
      </nav>
      {newCase && (
        <NewCase
          onClose={() => setNewCase(false)}
          onSample={sample}
          sampleBusy={busySample}
          onCreated={(record) => {
            changed(record);
            setNewCase(false);
            navigate(`/cases/${record.id}`);
          }}
        />
      )}
      {settings && (
        <WorkspaceSettings
          session={session}
          onClose={() => setSettings(false)}
          onChange={changeWorkspace}
          onAccessChange={setAccess}
          onRestore={() => {
            setSettings(false);
            setRestore(true);
          }}
        />
      )}
      {restore && (
        <RestoreWorkspace
          onClose={() => setRestore(false)}
          onRestored={changeWorkspace}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <span>
            <Check size={17} />
          </span>
          {toast}
          <button aria-label="Dismiss message" onClick={() => setToast("")}>
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

function Dashboard({
  records,
  allRecords,
  onNew,
  onSample,
  sampleBusy,
  navigate,
}: {
  records: ReceivingCase[];
  allRecords: boolean;
  onNew: () => void;
  onSample: () => void;
  sampleBusy: boolean;
  navigate: (to: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const totals = useMemo(() => {
    const active = records.filter((c) => !c.isDemo);
    const sample = records.filter((c) => c.isDemo);
    const source = active.length ? active : sample;
    return {
      count: source.length,
      sample: active.length === 0 && sample.length > 0,
      open: source.filter((c) => c.status !== "closed").length,
      amount: source
        .filter((c) => c.status !== "closed")
        .reduce((sum, c) => sum + reconcileCase(c).totalDiscrepancyMinor, 0),
      acknowledged: source.filter((c) => c.status === "closed").length,
    };
  }, [records]);
  const filtered = records.filter(
    (record) =>
      (filter === "all" ||
        (filter === "open"
          ? record.status !== "closed"
          : record.status === filter)) &&
      `${record.supplier} ${record.invoiceNumber} ${record.caseNumber}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            {allRecords
              ? "YOUR RECEIVING DESK"
              : "A CLEARER VIEW OF EVERY DELIVERY"}
          </div>
          <h1>
            {allRecords ? "Receiving records" : "Good deliveries start here."}
          </h1>
          <p>
            {allRecords
              ? "Every invoice, observation, and response. Together."
              : "Know what arrived. Resolve what didn’t."}
          </p>
        </div>
        <button className="button button-primary" onClick={onNew}>
          <Plus size={18} />
          New receiving record
        </button>
      </div>
      {!allRecords && (
        <>
          <div className="metrics">
            <Metric
              label="Deliveries recorded"
              value={String(totals.count).padStart(2, "0")}
              foot={
                totals.sample
                  ? "Sample workspace activity"
                  : "Sample deliveries excluded"
              }
              icon={<Package size={20} />}
            />
            <Metric
              label="Open records"
              value={String(totals.open).padStart(2, "0")}
              foot="Still being verified or resolved"
              icon={<ClipboardCheck size={20} />}
            />
            <Metric
              label="Open discrepancy value"
              value={money(totals.amount)}
              foot="Item value · excludes taxes"
              icon={<ArrowDownLeft size={20} />}
              accent
            />
            <Metric
              label="Acknowledged records"
              value={String(totals.acknowledged).padStart(2, "0")}
              foot="Supplier agreed · not a refund"
              icon={<FileCheck2 size={20} />}
            />
          </div>
          <div className="welcome-panel">
            <div className="welcome-copy">
              <div className="eyebrow">
                <span className="small-dot" /> FROM DOORSTEP TO RESOLUTION
              </div>
              <h2>
                The right record.
                <br />
                Before the delivery leaves.
              </h2>
              <p>
                Capture the invoice, confirm the count, and give your supplier
                the full picture.
              </p>
              <button
                className="button button-cream"
                onClick={records.length ? onNew : onSample}
                disabled={sampleBusy}
              >
                {sampleBusy ? (
                  <Spinner label="Preparing…" />
                ) : records.length ? (
                  <>
                    Start a delivery <ArrowRight size={16} />
                  </>
                ) : (
                  <>
                    Explore a sample delivery <ArrowRight size={16} />
                  </>
                )}
              </button>
              <span className="sample-note">
                {records.length
                  ? "A few details now. Fewer questions later."
                  : "Try the full workflow with clearly marked synthetic data."}
              </span>
            </div>
            <div className="delivery-illustration" aria-hidden="true">
              <div className="illustration-lines" />
              <div className="package-back">
                <span />
              </div>
              <div className="package-front">
                <span className="package-tape" />
                <span className="package-label">
                  <i />
                  <i />
                  <i />
                  <strong>RR</strong>
                </span>
              </div>
              <div className="floating-receipt">
                <span className="receipt-heading">
                  <PackageCheck size={16} />
                  DELIVERY CHECK
                </span>
                <span>
                  <i />
                  Invoice captured
                  <Check size={12} />
                </span>
                <span>
                  <i />
                  Items confirmed
                  <Check size={12} />
                </span>
                <span>
                  <i />
                  Evidence attached
                  <Check size={12} />
                </span>
                <div className="receipt-total">
                  One clear record.
                  <ShieldCheck size={16} />
                </div>
              </div>
              <div className="illustration-badge">
                <Check size={19} />
              </div>
            </div>
          </div>
        </>
      )}
      <section className="records-section">
        <div className="section-heading">
          <div>
            <h2>
              {allRecords ? "All records" : "Recent receiving records"}
              <span className="count-badge">{records.length}</span>
            </h2>
            <p>Keep every delivery moving towards a clear outcome.</p>
          </div>
          {!allRecords && (
            <button className="text-button" onClick={() => navigate("/cases")}>
              View all records <ArrowUpRight size={15} />
            </button>
          )}
        </div>
        <div className="records-toolbar">
          <div
            className="filter-tabs"
            role="group"
            aria-label="Filter receiving records"
          >
            {[
              ["all", "All records"],
              ["open", "Open"],
              ["shared", "Awaiting supplier"],
              ["closed", "Acknowledged"],
            ].map(([value, label]) => (
              <button
                key={value}
                className={filter === value ? "selected" : ""}
                onClick={() => setFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="search-box">
            <Search size={16} />
            <input
              aria-label="Search receiving records"
              placeholder="Search supplier or invoice…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button aria-label="Clear search" onClick={() => setQuery("")}>
                <X size={14} />
              </button>
            )}
          </label>
        </div>
        {!filtered.length ? (
          <div className="empty-state">
            <div className="empty-icon">
              <FolderOpen size={30} strokeWidth={1.4} />
            </div>
            <h3>
              {records.length
                ? "No records match this view."
                : "Your first delivery starts a better habit."}
            </h3>
            <p>
              {records.length
                ? "Try another supplier, invoice number, or status."
                : "Bring the invoice, counts, and evidence together in a single receiving record."}
            </p>
            {records.length ? (
              <button
                className="button button-secondary"
                onClick={() => {
                  setQuery("");
                  setFilter("all");
                }}
              >
                Clear filters
              </button>
            ) : (
              <div className="button-row">
                <button className="button button-primary" onClick={onNew}>
                  <Plus size={16} />
                  Create a record
                </button>
                <button
                  className="button button-secondary"
                  onClick={onSample}
                  disabled={sampleBusy}
                >
                  Try a sample <ArrowRight size={15} />
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="table-scroll">
            <table className="records-table">
              <thead>
                <tr>
                  <th>Supplier & invoice</th>
                  <th>Recorded</th>
                  <th>Items</th>
                  <th>Discrepancy value</th>
                  <th>Status</th>
                  <th>
                    <span className="sr-only">Open record</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, allRecords ? 1000 : 6).map((record) => {
                  const result = reconcileCase(record);
                  return (
                    <tr key={record.id}>
                      <td>
                        <button
                          className="record-link"
                          onClick={() => navigate(`/cases/${record.id}`)}
                        >
                          <span className="supplier-icon">
                            <Boxes size={19} strokeWidth={1.5} />
                          </span>
                          <span>
                            <strong>
                              {record.supplier || "Unnamed supplier"}
                              {record.isDemo && (
                                <em className="sample-tag">SAMPLE</em>
                              )}
                            </strong>
                            <small>
                              {record.invoiceNumber || "No invoice number"}{" "}
                              <span>·</span> {record.caseNumber}
                            </small>
                          </span>
                        </button>
                      </td>
                      <td>
                        {date(record.createdAt)}
                        <small className="cell-small">
                          {date(record.createdAt, true).split(",").pop()}
                        </small>
                      </td>
                      <td>
                        {record.lines.length}
                        <span className="muted"> lines</span>
                      </td>
                      <td>
                        <strong
                          className={
                            result.totalDiscrepancyMinor > 0
                              ? "amount-warning"
                              : ""
                          }
                        >
                          {money(result.totalDiscrepancyMinor)}
                        </strong>
                        {result.hasUnpricedDiscrepancies && (
                          <small className="cell-small">
                            Some items unpriced
                          </small>
                        )}
                      </td>
                      <td>
                        <Status status={record.status} />
                      </td>
                      <td>
                        <button
                          className="icon-button table-arrow"
                          aria-label={`Open ${record.caseNumber}`}
                          onClick={() => navigate(`/cases/${record.id}`)}
                        >
                          <ArrowUpRight size={17} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="table-footer">
          <span>
            <ShieldCheck size={13} />
            Only your workspace can see these records until you share.
          </span>
          <span>
            {filtered.length} record{filtered.length !== 1 ? "s" : ""}
            {totals.sample ? " · Sample data" : ""}
          </span>
        </div>
      </section>
      {!allRecords && (
        <div className="workflow-strip">
          {[
            [
              FileText,
              "01",
              "Capture the invoice",
              "Keep the original in view.",
            ],
            [
              ClipboardCheck,
              "02",
              "Confirm the delivery",
              "Count what actually arrived.",
            ],
            [
              PackageCheck,
              "03",
              "Resolve with clarity",
              "Share evidence, get a response.",
            ],
          ].map(([Icon, number, title, description], index) => {
            const I = Icon as typeof FileText;
            return (
              <div className="workflow-step" key={index}>
                <span className="step-icon">
                  <I size={20} />
                </span>
                <div>
                  <span className="step-kicker">STEP {number as string}</span>
                  <h3>{title as string}</h3>
                  <p>{description as string}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function Metric({
  label,
  value,
  foot,
  icon,
  accent = false,
}: {
  label: string;
  value: string;
  foot: string;
  icon: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div className={`metric ${accent ? "metric-accent" : ""}`}>
      <div className="metric-top">
        <span>{label}</span>
        <span className="metric-icon">{icon}</span>
      </div>
      <div className="metric-value">{value}</div>
      <div className="metric-foot">
        {accent && <span className="amber-dot" />}
        {foot}
      </div>
    </div>
  );
}
function LoadingPage() {
  return (
    <div className="loading-page" aria-label="Loading workspace" role="status">
      <div className="skeleton skeleton-heading" />
      <div className="skeleton skeleton-subheading" />
      <div className="metrics">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton skeleton-card" />
        ))}
      </div>
      <div className="skeleton skeleton-banner" />
      <Spinner label="Opening your receiving desk…" />
    </div>
  );
}

function NewCase({
  onClose,
  onCreated,
  onSample,
  sampleBusy,
}: {
  onClose: () => void;
  onCreated: (record: ReceivingCase) => void;
  onSample: () => void;
  sampleBusy: boolean;
}) {
  const [supplier, setSupplier] = useState("");
  const [invoice, setInvoice] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [createdRecord, setCreatedRecord] = useState<ReceivingCase | null>(
    null,
  );
  const uploadedFile = useRef<File | null>(null);
  const input = useRef<HTMLInputElement>(null);
  function leave() {
    if (busy) return;
    if (createdRecord) onCreated(createdRecord);
    else onClose();
  }
  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    let record = createdRecord;
    try {
      if (file) validateUpload(file);
      if (!record) {
        record = await post<ReceivingCase>("/cases", {
          supplier: supplier.trim(),
          invoiceNumber: invoice.trim(),
          shopName: readSession()?.name || "My store",
          invoiceDate: new Date().toISOString().slice(0, 10),
          lines: [],
        });
        setCreatedRecord(record);
      }
      if (file && uploadedFile.current !== file) {
        await uploadFile(record.id, file, "invoice");
        uploadedFile.current = file;
      }
      onCreated(await api<ReceivingCase>(`/cases/${record.id}`));
    } catch (e) {
      setError(
        record
          ? `Your receiving record is saved. ${errorMessage(e)} Retry continues the same record, or open it to add the invoice later.`
          : errorMessage(e),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={
        createdRecord
          ? "Your record is saved. Finish the invoice."
          : "A new delivery, accounted for."
      }
      eyebrow="NEW RECEIVING RECORD"
      onClose={leave}
    >
      <p className="modal-description">
        Start with the supplier and invoice. You’ll confirm the actual
        quantities next.
      </p>
      <form onSubmit={create}>
        <div className="form-grid">
          <label>
            Supplier name <span className="required">*</span>
            <input
              required
              maxLength={200}
              disabled={busy || !!createdRecord}
              placeholder="e.g. Sunrise Distributors"
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              autoFocus
            />
          </label>
          <label>
            Invoice number <span className="optional">Optional</span>
            <input
              placeholder="e.g. INV-2048"
              maxLength={100}
              disabled={busy || !!createdRecord}
              value={invoice}
              onChange={(e) => setInvoice(e.target.value)}
            />
          </label>
        </div>
        <input
          ref={input}
          hidden
          type="file"
          accept="image/jpeg,image/png,application/pdf"
          onChange={(e) => {
            const chosen = e.target.files?.[0];
            if (chosen) {
              try {
                validateUpload(chosen);
                setFile(chosen);
                setError("");
              } catch (error) {
                setError(errorMessage(error));
              }
            }
          }}
        />
        <button
          type="button"
          disabled={busy}
          className={`upload-drop ${file ? "has-file" : ""}`}
          onClick={() => input.current?.click()}
        >
          <span className="upload-icon">
            {file ? <FileCheck2 size={25} /> : <Upload size={25} />}
          </span>
          <strong>{file ? file.name : "Add the original invoice"}</strong>
          <span>
            {file
              ? "Click to choose a different file"
              : "Choose a JPG, PNG or PDF · up to 5 MB"}
          </span>
          <small>
            {file
              ? `${(file.size / 1024).toFixed(0)} KB`
              : "Optional — you can also enter the invoice manually."}
          </small>
        </button>
        {error && <ErrorBox error={error} />}
        <div className="modal-actions">
          <button
            type="button"
            className="button button-secondary"
            onClick={leave}
            disabled={busy}
          >
            {createdRecord ? "Open saved record" : "Cancel"}
          </button>
          <button className="button button-primary" disabled={busy}>
            {busy ? (
              <Spinner
                label={
                  createdRecord ? "Finishing invoice…" : "Creating record…"
                }
              />
            ) : (
              <>
                {createdRecord
                  ? "Retry invoice setup"
                  : "Create receiving record"}{" "}
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </div>
      </form>
      {!createdRecord && (
        <div className="sample-divider">
          <Sparkles size={17} />
          <span>Just exploring?</span>
          <button
            className="text-button"
            onClick={onSample}
            disabled={sampleBusy || busy}
          >
            {sampleBusy ? "Preparing sample…" : "Open a sample delivery"}
            <ArrowUpRight size={14} />
          </button>
        </div>
      )}
    </Modal>
  );
}

function Help({ health, onNew }: { health: Health | null; onNew: () => void }) {
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">BUILT AROUND THE MOMENT OF RECEIVING</div>
          <h1>Clarity, from the first count.</h1>
          <p>A short guide to a more reliable delivery record.</p>
        </div>
        <button className="button button-primary" onClick={onNew}>
          <Plus size={17} />
          Start a record
        </button>
      </div>
      <div className="help-grid">
        <section className="panel help-main">
          <h2>One record. Two sides of the conversation.</h2>
          {[
            [
              "01",
              "Capture the original",
              "Upload a printed invoice photo or PDF. When AWS Textract is configured, request extraction and check the suggested fields against the source. Manual entry is always available.",
            ],
            [
              "02",
              "Count the delivery",
              "Enter everything physically received, including damaged and incorrect items. Count damaged and wrong items separately; one unit cannot belong to both groups.",
            ],
            [
              "03",
              "Check the calculations",
              "Confirm the pack size when billed units are cartons or packs. Review the item price and quantity, attach evidence, and explicitly confirm every line.",
            ],
            [
              "04",
              "Invite the supplier",
              "Create a protected review link and send its six-digit PIN separately. The supplier can acknowledge or dispute each affected line, with a written note.",
            ],
            [
              "05",
              "Keep the outcome",
              "The record preserves the response and activity history. Close it after all discrepancy lines are acknowledged. An acknowledgment is not confirmation of payment or credit.",
            ],
          ].map(([number, title, text]) => (
            <div className="help-step" key={number}>
              <span>{number}</span>
              <div>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            </div>
          ))}
        </section>
        <aside className="help-side">
          <section className="panel">
            <div className="panel-icon">
              <Cloud size={23} />
            </div>
            <h3>Your current environment</h3>
            <p>These indicators reflect the running server configuration.</p>
            <div className="health-row">
              <span>Record storage</span>
              <strong>
                {health?.storage === "dynamodb"
                  ? "DynamoDB"
                  : health
                    ? "Local JSON"
                    : "Unavailable"}
              </strong>
            </div>
            <div className="health-row">
              <span>Invoice extraction</span>
              <strong>
                {health?.extraction === "textract"
                  ? "AWS Textract"
                  : health
                    ? "Manual entry"
                    : "Unavailable"}
              </strong>
            </div>
            <div className="health-row">
              <span>Case summaries</span>
              <strong>
                {health?.summaries === "bedrock"
                  ? "Amazon Bedrock"
                  : health
                    ? "Template"
                    : "Unavailable"}
              </strong>
            </div>
            {health?.region && (
              <div className="health-row">
                <span>AWS region</span>
                <strong>{health.region}</strong>
              </div>
            )}
          </section>
          <section className="panel help-note">
            <ShieldCheck size={23} />
            <h3>
              Helpful suggestions.
              <br />
              Human confirmation.
            </h3>
            <p>
              AI can suggest invoice fields and summarize observations. Your
              confirmed counts drive the calculations. Photos document an
              observation; they cannot prove quantities hidden inside packaging.
            </p>
          </section>
        </aside>
      </div>
      {health?.storage === "dynamodb" && (
        <section
          className="panel architecture-panel"
          style={{ padding: 28, marginBottom: 24 }}
        >
          <div className="eyebrow">RUNNING ON AWS</div>
          <h2>From the receiving desk to a shared record.</h2>
          <p>React mobile web → API Gateway HTTPS → Lambda API</p>
          <div className="health-row">
            <span>Receiving records and revision checks</span>
            <strong>DynamoDB</strong>
          </div>
          <div className="health-row">
            <span>Private evidence, preserved by object version</span>
            <strong>Amazon S3</strong>
          </div>
          <div className="health-row">
            <span>Invoice field suggestions for human review</span>
            <strong>
              {health.extraction === "textract"
                ? "Amazon Textract"
                : "Manual entry available"}
            </strong>
          </div>
          <div className="health-row">
            <span>Case summary</span>
            <strong>
              {health.summaries === "bedrock"
                ? "Amazon Bedrock"
                : "Deterministic template"}
            </strong>
          </div>
          <p>
            Confirmed quantities feed deterministic item calculations. Supplier
            responses are saved against the exact shared revision.
          </p>
        </section>
      )}
      <section className="panel formula-panel">
        <div>
          <div className="eyebrow">THE MATH STAYS VISIBLE</div>
          <h2>No mystery in the discrepancy.</h2>
          <p>
            Item values exclude taxes and discounts. Unpriced items are flagged,
            never silently treated as a zero-value claim.
          </p>
        </div>
        <div className="formula">
          <div>
            <span>Missing</span>
            <b>+</b>
            <span>Damaged</span>
            <b>+</b>
            <span>Wrong</span>
          </div>
          <strong>= Discrepancy units</strong>
          <small>
            Received = everything delivered · Accepted = received − damaged −
            wrong
          </small>
        </div>
      </section>
    </>
  );
}
