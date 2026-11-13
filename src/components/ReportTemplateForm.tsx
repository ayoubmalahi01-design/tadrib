/**
 * Coach-facing report form.
 *
 * The coach picks a published template, fills the fields it defines, keeps a
 * draft (the same row is reused, never duplicated) and submits it to the
 * administration. Answers are stored in `daily_reports.answers` together with
 * `template_id` / `template_version`, so a later template edit never rewrites
 * a report that was already filled.
 */
import { useEffect, useMemo, useState } from "react";
import { Download, FileText, Save, Send } from "lucide-react";
import { supabase } from "../lib/supabase";
import { Badge, EmptyState, ErrorState, Field, LoadingState, PageHeader, Panel } from "./ui";
import type { AppProfile, T } from "../lib/app-types";
import { listPublishedTemplates, type ReportTemplate } from "../lib/template-store";
import {
  validateAnswers,
  type AnswerIssue,
  type Answers,
  type FieldType,
  type TemplateField,
} from "../lib/report-templates";
import { reportStatus, statusKey, submitPayload } from "../lib/report-workflow";
import { renderReportDocx } from "../lib/report-docx-service";
import { downloadBlob } from "../lib/docx-export";

function localDate(d = new Date()): string {
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

const ISSUE_KEY: Record<AnswerIssue, string> = {
  required: "tplRequired",
  number: "tplInvalidNumber",
  date: "tplInvalidDate",
  time: "tplInvalidTime",
};

function emptyAnswer(field: TemplateField) {
  if (field.type === "checkbox") return false;
  if (field.type === "multiselect") return [] as string[];
  return "";
}

export default function ReportTemplateForm({
  profile,
  t,
  notify,
}: {
  profile: AppProfile;
  t: T;
  notify: (message: string) => void;
}) {
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [institutionName, setInstitutionName] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [missingSchema, setMissingSchema] = useState(false);
  const [templateId, setTemplateId] = useState("");
  const [answers, setAnswers] = useState<Answers>({});
  const [issues, setIssues] = useState<Record<string, AnswerIssue>>({});
  const [draftId, setDraftId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const template = useMemo(
    () => templates.find((row) => row.id === templateId) || null,
    [templates, templateId],
  );

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!profile.institution_id) {
        if (alive) {
          setLoading(false);
          setLoadError(t("tplNoPublishedHint"));
        }
        return;
      }
      const res = await listPublishedTemplates(profile.institution_id);
      const inst = await supabase
        .from("institutions")
        .select("name")
        .eq("id", profile.institution_id)
        .maybeSingle();
      if (!alive) return;
      setTemplates(res.data);
      setLoadError(res.error);
      setMissingSchema(res.missingSchema);
      setInstitutionName(inst.data?.name || "");
      if (res.data.length) setTemplateId(res.data[0].id);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [profile.institution_id, t]);

  // Reuse an unfinished report for the same template instead of creating a new row.
  useEffect(() => {
    let alive = true;
    if (!template) {
      setAnswers({});
      setDraftId(null);
      setStatus(null);
      return;
    }
    (async () => {
      const { data, error } = await supabase
        .from("daily_reports")
        .select("*")
        .eq("coach_id", profile.id)
        .eq("template_id", template.id)
        .in("status", ["draft", "needs_changes"])
        .order("created_at", { ascending: false })
        .limit(1);
      if (!alive) return;
      const row = error ? null : (data || [])[0];
      if (row) {
        setDraftId(row.id);
        setStatus(row.status ?? "draft");
        setAnswers((row.answers as Answers) || {});
      } else {
        setDraftId(null);
        setStatus(null);
        setAnswers({});
      }
    })();
    return () => {
      alive = false;
    };
  }, [template?.id, profile.id]);

  function setAnswer(key: string, value: Answers[string]) {
    setAnswers((prev) => ({ ...prev, [key]: value }));
    setIssues((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  async function countsForToday() {
    const { data } = await supabase
      .from("attendance_records")
      .select("status")
      .eq("session_date", localDate())
      .eq("coach_id", profile.id);
    const out = { present_count: 0, absent_count: 0, late_count: 0, excused_count: 0 };
    for (const row of data || []) {
      const value = String((row as { status?: string }).status || "");
      if (value === "present") out.present_count += 1;
      else if (value === "late") out.late_count += 1;
      else if (value === "excused" || value === "exempt" || value === "duty") out.excused_count += 1;
      else out.absent_count += 1;
    }
    return out;
  }

  async function persist(nextStatus: "draft" | "submitted") {
    if (!template) return;
    setBusy(true);
    try {
      if (nextStatus === "submitted") {
        const found = validateAnswers(template.schema, answers);
        if (Object.keys(found).length) {
          setIssues(found);
          notify(t("tplAnswersRequired"));
          return;
        }
      }
      const counts = await countsForToday();
      const base = {
        coach_id: profile.id,
        coach_name_snapshot: profile.full_name,
        report_date: localDate(),
        template_id: template.id,
        template_version: template.current_version,
        answers,
        notes: "",
        ...counts,
        ...(nextStatus === "draft"
          ? { status: "draft", is_finalized: false }
          : submitPayload(new Date().toISOString())),
      };
      const { error } = draftId
        ? await supabase.from("daily_reports").update(base).eq("id", draftId)
        : await supabase.from("daily_reports").insert(base).select("id").maybeSingle();
      if (error) {
        notify(error.message);
        return;
      }
      if (!draftId) {
        const { data } = await supabase
          .from("daily_reports")
          .select("id")
          .eq("coach_id", profile.id)
          .eq("template_id", template.id)
          .order("created_at", { ascending: false })
          .limit(1);
        if (data?.[0]?.id) setDraftId(data[0].id);
      }
      setStatus(nextStatus);
      notify(nextStatus === "submitted" ? t("tplSubmitted") : t("tplDraftSavedMsg"));
    } finally {
      setBusy(false);
    }
  }

  async function download() {
    if (!template) return;
    setBusy(true);
    try {
      const row = {
        id: draftId || "",
        report_date: localDate(),
        coach_id: profile.id,
        coach_name_snapshot: profile.full_name,
        notes: "",
        status: status || "draft",
        template_id: template.id,
        template_version: template.current_version,
        answers,
        present_count: 0,
        absent_count: 0,
        late_count: 0,
        excused_count: 0,
      };
      const { blob, fileName } = await renderReportDocx(row, {
        institutionName,
        lang: (profile.preferred_language || "ar") as "ar" | "fr" | "en",
        templates,
        t,
      });
      downloadBlob(blob, fileName);
      notify(t("expDone"));
    } catch {
      notify(t("expFailed"));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <LoadingState label={t("loading")} />;
  if (missingSchema)
    return (
      <ErrorState
        title={t("tplEmpty")}
        message={`${t("tplNoPublishedHint")} — supabase/migrations/0005_report_templates.sql`}
      />
    );
  if (loadError && !templates.length)
    return <ErrorState title={t("errorTitle")} message={loadError} />;
  if (!templates.length)
    return (
      <EmptyState
        title={t("tplNoPublished")}
        body={t("tplNoPublishedHint")}
        icon={<FileText size={26} />}
      />
    );

  return (
    <div className="page">
      <PageHeader
        title={t("tplCoachForm")}
        subtitle={t("tplFillHint")}
        icon={<FileText size={22} />}
        actions={
          status ? (
            <Badge tone={status === "submitted" ? "info" : "neutral"}>
              {t(statusKey(reportStatus({ status })))}
            </Badge>
          ) : null
        }
      />

      <Panel title={t("tplChoose")}>
        <div className="tpl-grid">
          <Field label={t("tplTemplate")}>
            <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              {templates.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.title} · v{row.current_version}
                </option>
              ))}
            </select>
          </Field>
          {template?.description && <p className="muted">{template.description}</p>}
        </div>
      </Panel>

      {template && (
        <Panel title={template.title} subtitle={template.description || undefined}>
          {template.schema.sections.map((section) => (
            <div key={section.id} className="tpl-section">
              <h3>{section.title}</h3>
              {section.instructions && <p className="muted">{section.instructions}</p>}
              <div className="tpl-grid">
                {section.fields.map((field) => (
                  <TemplateFieldInput
                    key={field.key}
                    field={field}
                    value={answers[field.key]}
                    issue={issues[field.key]}
                    t={t}
                    onChange={(value) => setAnswer(field.key, value)}
                  />
                ))}
              </div>
            </div>
          ))}
          <div className="ui-toolbar">
            <button type="button" className="secondary" disabled={busy} onClick={() => persist("draft")}>
              <Save size={16} /> {t("tplSaveDraft")}
            </button>
            <button type="button" className="primary" disabled={busy} onClick={() => persist("submitted")}>
              <Send size={16} /> {t("tplSubmit")}
            </button>
            <button type="button" className="secondary" disabled={busy} onClick={download}>
              <Download size={16} /> {t("expExport")}
            </button>
          </div>
        </Panel>
      )}
    </div>
  );
}

export function TemplateFieldInput({
  field,
  value,
  issue,
  t,
  onChange,
  disabled,
}: {
  field: TemplateField;
  value: Answers[string] | undefined;
  issue?: AnswerIssue;
  t: T;
  onChange: (value: Answers[string]) => void;
  disabled?: boolean;
}) {
  const label = field.required ? `${field.label} *` : field.label;
  const error = issue ? t(ISSUE_KEY[issue]) : undefined;
  const type: FieldType = field.type;
  const options = field.options || [];

  if (type === "checkbox") {
    return (
      <Field label={label} hint={field.help || undefined} error={error}>
        <label className="tpl-check">
          <input
            type="checkbox"
            checked={Boolean(value)}
            disabled={disabled}
            onChange={(e) => onChange(e.target.checked)}
          />
          <span>{field.placeholder || field.label}</span>
        </label>
      </Field>
    );
  }

  if (type === "multiselect") {
    const chosen = Array.isArray(value) ? value : [];
    return (
      <Field label={label} hint={field.help || undefined} error={error}>
        <div className="tpl-options">
          {options.map((option) => (
            <label key={option} className="tpl-check">
              <input
                type="checkbox"
                checked={chosen.includes(option)}
                disabled={disabled}
                onChange={(e) =>
                  onChange(
                    e.target.checked
                      ? [...chosen, option]
                      : chosen.filter((item) => item !== option),
                  )
                }
              />
              <span>{option}</span>
            </label>
          ))}
        </div>
      </Field>
    );
  }

  if (type === "select") {
    return (
      <Field label={label} hint={field.help || undefined} error={error}>
        <select
          value={typeof value === "string" ? value : ""}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">—</option>
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </Field>
    );
  }

  if (type === "textarea") {
    return (
      <Field label={label} hint={field.help || undefined} error={error}>
        <textarea
          rows={4}
          value={typeof value === "string" ? value : ""}
          placeholder={field.placeholder || undefined}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      </Field>
    );
  }

  const inputType =
    type === "number" ? "number" : type === "date" ? "date" : type === "time" ? "time" : "text";
  return (
    <Field label={label} hint={field.help || undefined} error={error}>
      <input
        type={inputType}
        value={typeof value === "string" ? value : ""}
        placeholder={field.placeholder || undefined}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}
