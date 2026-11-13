/**
 * Report archive — filtering, review state and Word export.
 *
 * Administrators of an institution can filter the reports of their trainers,
 * export one or many to DOCX and share the file inside an internal
 * conversation. Row visibility comes from RLS; this page only narrows further.
 */
import { useEffect, useMemo, useState } from "react";
import { Download, FileText, RefreshCw, Send } from "lucide-react";
import { supabase } from "../lib/supabase";
import { Badge, EmptyState, ErrorState, LoadingState, PageHeader, Panel } from "./ui";
import { isAdminRole, type AppProfile, type T } from "../lib/app-types";
import {
  listMyConversations,
  listTemplates,
  sendDocxToConversation,
  type ConversationOption,
  type ReportTemplate,
} from "../lib/template-store";
import { reportStatus, statusKey } from "../lib/report-workflow";
import {
  renderReportDocx,
  renderReportsDocx,
  type ReportRow,
} from "../lib/report-docx-service";
import { downloadBlob } from "../lib/docx-export";

type CoachOption = { id: string; full_name: string };

export default function ReportArchive({
  profile,
  t,
  notify,
}: {
  profile: AppProfile;
  t: T;
  notify: (message: string) => void;
}) {
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [coaches, setCoaches] = useState<CoachOption[]>([]);
  const [conversations, setConversations] = useState<ConversationOption[]>([]);
  const [institutionName, setInstitutionName] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [coachId, setCoachId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [conversationId, setConversationId] = useState("");
  const [busy, setBusy] = useState(false);

  const allowed = isAdminRole(profile.role);

  async function load() {
    if (!profile.institution_id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const reports = await supabase
      .from("daily_reports")
      .select("*")
      .order("report_date", { ascending: false })
      .limit(300);
    const [tpl, people, convs, inst] = await Promise.all([
      listTemplates(profile.institution_id),
      supabase
        .from("profiles")
        .select("id,full_name")
        .eq("institution_id", profile.institution_id)
        .eq("role", "coach"),
      listMyConversations(profile.id),
      supabase
        .from("institutions")
        .select("name")
        .eq("id", profile.institution_id)
        .maybeSingle(),
    ]);
    setRows(((reports.data || []) as unknown) as ReportRow[]);
    setTemplates(tpl.data);
    setCoaches((people.data || []) as CoachOption[]);
    setConversations(convs);
    setInstitutionName(inst.data?.name || "");
    setLoadError(reports.error?.message || tpl.error || null);
    setLoading(false);
  }

  useEffect(() => {
    if (allowed) load();
    else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, profile.id, profile.institution_id]);

  const coachName = (row: ReportRow) =>
    row.coach_name_snapshot ||
    coaches.find((c) => c.id === row.coach_id)?.full_name ||
    "";

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (coachId && row.coach_id !== coachId) return false;
      if (templateId && row.template_id !== templateId) return false;
      if (status && reportStatus(row) !== status) return false;
      if (from && row.report_date < from) return false;
      if (to && row.report_date > to) return false;
      if (needle) {
        const haystack = `${coachName(row)} ${row.report_date} ${row.notes || ""}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [rows, coachId, templateId, status, from, to, query, coaches]);

  const selectedRows = filtered.filter((row) => selected.includes(row.id));

  const ctx = {
    institutionName,
    lang: (profile.preferred_language || "ar") as "ar" | "fr" | "en",
    templates,
    t,
    coachName,
  };

  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.length === filtered.length ? [] : filtered.map((row) => row.id),
    );
  }

  async function exportOne(row: ReportRow) {
    setBusy(true);
    try {
      const { blob, fileName } = await renderReportDocx(row, ctx);
      downloadBlob(blob, fileName);
      notify(t("expDone"));
    } catch {
      notify(t("expFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function exportSelected() {
    if (!selectedRows.length) {
      notify(t("expEmpty"));
      return;
    }
    setBusy(true);
    try {
      const { blob, fileName } = await renderReportsDocx(selectedRows, ctx);
      downloadBlob(blob, fileName);
      notify(t("expDone"));
    } catch {
      notify(t("expFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function sendSelected() {
    if (!selectedRows.length) {
      notify(t("expEmpty"));
      return;
    }
    if (!conversationId || !profile.institution_id) {
      notify(t("expNoConversations"));
      return;
    }
    setBusy(true);
    try {
      const { blob, fileName } = await renderReportsDocx(selectedRows, ctx);
      const { error } = await sendDocxToConversation({
        institutionId: profile.institution_id,
        conversationId,
        userId: profile.id,
        blob,
        fileName,
        body: `${t("reports")} · ${fileName}`,
      });
      notify(error || t("expSent"));
    } catch {
      notify(t("expFailed"));
    } finally {
      setBusy(false);
    }
  }

  if (!allowed)
    return <EmptyState title={t("tplOnlyAdmin")} icon={<FileText size={26} />} />;
  if (loading) return <LoadingState label={t("loading")} />;
  if (loadError && !rows.length)
    return <ErrorState title={t("errorTitle")} message={loadError} onRetry={load} retryLabel={t("retry")} />;

  return (
    <div className="page">
      <PageHeader
        title={t("expTitle")}
        icon={<FileText size={22} />}
        actions={
          <button type="button" className="secondary" onClick={load} disabled={busy}>
            <RefreshCw size={16} /> {t("retry")}
          </button>
        }
      />

      <Panel>
        <div className="exp-filters">
          <select value={coachId} onChange={(e) => setCoachId(e.target.value)} aria-label={t("expFilterCoach")}>
            <option value="">{t("expFilterCoach")}</option>
            {coaches.map((coach) => (
              <option key={coach.id} value={coach.id}>
                {coach.full_name}
              </option>
            ))}
          </select>
          <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} aria-label={t("expFilterTemplate")}>
            <option value="">{t("expFilterTemplate")}</option>
            {templates.map((tpl) => (
              <option key={tpl.id} value={tpl.id}>
                {tpl.title}
              </option>
            ))}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label={t("expFilterStatus")}>
            <option value="">{t("expFilterStatus")}</option>
            {["draft", "submitted", "under_review", "needs_changes", "reviewed"].map((value) => (
              <option key={value} value={value}>
                {t(statusKey(value as never))}
              </option>
            ))}
          </select>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label={t("expFrom")} />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label={t("expTo")} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("search")}
            aria-label={t("search")}
          />
        </div>

        {filtered.length === 0 ? (
          <EmptyState title={t("noReports")} body={t("reportsEmptyHint")} icon={<FileText size={26} />} />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      checked={filtered.length > 0 && selected.length === filtered.length}
                      onChange={toggleAll}
                      aria-label={t("expSelectAll")}
                    />
                  </th>
                  <th>{t("date")}</th>
                  <th>{t("coach")}</th>
                  <th>{t("tplTemplate")}</th>
                  <th>{t("status")}</th>
                  <th>{t("tplActions")}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.includes(row.id)}
                        onChange={() => toggle(row.id)}
                        aria-label={`${t("expSelectAll")} ${row.report_date}`}
                      />
                    </td>
                    <td>{row.report_date}</td>
                    <td>{coachName(row)}</td>
                    <td>{templates.find((tpl) => tpl.id === row.template_id)?.title || "—"}</td>
                    <td>
                      <Badge tone={reportStatus(row) === "reviewed" ? "success" : "neutral"}>
                        {t(statusKey(reportStatus(row)))}
                      </Badge>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => exportOne(row)}
                        disabled={busy}
                      >
                        <Download size={15} /> {t("expExport")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="ui-toolbar">
          <button type="button" className="secondary" onClick={toggleAll} disabled={!filtered.length}>
            {t("expSelectAll")}
          </button>
          <button type="button" className="primary" onClick={exportSelected} disabled={busy || !selected.length}>
            <Download size={16} /> {t("expBulk")} ({selected.length})
          </button>
          <select
            value={conversationId}
            onChange={(e) => setConversationId(e.target.value)}
            aria-label={t("expConversation")}
          >
            <option value="">{t("expConversation")}</option>
            {conversations.map((conv) => (
              <option key={conv.id} value={conv.id}>
                {conv.title || t("messages")}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="secondary"
            onClick={sendSelected}
            disabled={busy || !selected.length || !conversations.length}
            title={conversations.length ? t("expSend") : t("expNoConversations")}
          >
            <Send size={16} /> {t("expSendDocx")}
          </button>
        </div>
      </Panel>
    </div>
  );
}
