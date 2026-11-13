/**
 * Renders reports as DOCX.
 *
 * One entry point for both the coach ("download my report") and the
 * administrator ("export the archive"), so a report always looks the same
 * wherever it is produced.
 *
 * If the report was filled from a template that carries an uploaded DOCX, the
 * original file is downloaded and its {{placeholders}} are filled so the
 * institution's own formatting survives. Otherwise a formatted document is
 * generated from the answers. Both paths return a real .docx Blob.
 */
import { reportStatus, statusKey } from "./report-workflow";
import {
  answersToRows,
  buildTemplateData,
  exportFileName,
  type TemplateSchema,
} from "./report-templates";
import {
  buildBulkDocument,
  buildReportDocument,
  documentToBlob,
  fillDocxTemplate,
  type ReportDocInput,
} from "./docx-export";
import { downloadDocx, type ReportTemplate } from "./template-store";

export interface ReportRow {
  id: string;
  report_date: string;
  coach_id?: string | null;
  coach_name_snapshot?: string | null;
  notes?: string | null;
  status?: string | null;
  template_id?: string | null;
  template_version?: number | null;
  answers?: Record<string, unknown> | null;
  review_note?: string | null;
  reviewed_at?: string | null;
  present_count?: number | null;
  absent_count?: number | null;
  late_count?: number | null;
  excused_count?: number | null;
  created_at?: string | null;
}

export interface ExportContext {
  institutionName: string;
  lang: "ar" | "fr" | "en";
  templates: ReportTemplate[];
  t: (key: string) => string;
  coachName?: (row: ReportRow) => string;
}

function schemaOf(row: ReportRow, ctx: ExportContext): TemplateSchema {
  const template = ctx.templates.find((t) => t.id === row.template_id);
  return template?.schema || { sections: [] };
}

export function docLabels(ctx: ExportContext): ReportDocInput["labels"] {
  const { t } = ctx;
  return {
    date: t("date"),
    coach: t("coach"),
    group: t("group"),
    status: t("status"),
    fields: t("tplAnswers"),
    notes: t("notes"),
    review: t("reviewNote"),
    reviewedBy: t("reviewedBy"),
    reviewedAt: t("reviewedAt"),
    present: t("presentCount"),
    absent: t("absentCount"),
    late: t("lateCount"),
    signature: t("signature"),
  };
}

export function reportDocInput(row: ReportRow, ctx: ExportContext): ReportDocInput {
  const template = ctx.templates.find((t) => t.id === row.template_id);
  const schema = schemaOf(row, ctx);
  const answers = (row.answers || {}) as Record<string, any>;
  return {
    institutionName: ctx.institutionName,
    templateName: template?.title || ctx.t("reports"),
    coachName: row.coach_name_snapshot || ctx.coachName?.(row) || "",
    reportDate: row.report_date,
    statusLabel: ctx.t(statusKey(reportStatus(row))),
    rows: answersToRows(schema, answers),
    notes: row.notes || "",
    counts: {
      present: row.present_count ?? 0,
      absent: row.absent_count ?? 0,
      late: row.late_count ?? 0,
      excused: row.excused_count ?? 0,
    },
    reviewNote: row.review_note || "",
    reviewerName: "",
    reviewedAt: row.reviewed_at || "",
    lang: ctx.lang,
    labels: docLabels(ctx),
  };
}

/** A single report → DOCX, using the uploaded template when one exists. */
export async function renderReportDocx(
  row: ReportRow,
  ctx: ExportContext,
): Promise<{ blob: Blob; fileName: string; usedTemplate: boolean }> {
  const template = ctx.templates.find((t) => t.id === row.template_id);
  const fileName = exportFileName(
    template?.title || ctx.t("reports"),
    row.report_date,
    row.coach_name_snapshot || "",
  );

  if (template?.docx_path) {
    const bytes = await downloadDocx(template.docx_path);
    if (bytes) {
      const schema = template.schema;
      const data = buildTemplateData(schema, {
        institutionName: ctx.institutionName,
        templateName: template.title,
        coachName: row.coach_name_snapshot || "",
        reportDate: row.report_date,
        statusLabel: ctx.t(statusKey(reportStatus(row))),
        notes: row.notes || "",
        reviewNote: row.review_note || "",
        reviewedAt: row.reviewed_at || "",
        counts: {
          present: row.present_count ?? 0,
          absent: row.absent_count ?? 0,
          late: row.late_count ?? 0,
        },
        answers: (row.answers || {}) as Record<string, any>,
      });
      const filled = fillDocxTemplate(bytes, data);
      return {
        blob: new Blob([filled], {
          type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        }),
        fileName,
        usedTemplate: true,
      };
    }
  }

  const blob = await documentToBlob(buildReportDocument(reportDocInput(row, ctx)));
  return { blob, fileName, usedTemplate: false };
}

/** One or many reports → a single DOCX (one report per page). */
export async function renderReportsDocx(
  rows: ReportRow[],
  ctx: ExportContext,
): Promise<{ blob: Blob; fileName: string }> {
  if (rows.length === 1) {
    const single = await renderReportDocx(rows[0], ctx);
    return { blob: single.blob, fileName: single.fileName };
  }
  const blob = await documentToBlob(buildBulkDocument(rows.map((r) => reportDocInput(r, ctx))));
  const first = rows[rows.length - 1]?.report_date || "";
  return {
    blob,
    fileName: exportFileName(`${ctx.t("reports")}-${rows.length}`, first),
  };
}
