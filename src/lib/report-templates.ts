/**
 * Report templates — pure model, validation and mapping helpers.
 * No React, no Supabase, no DOM: everything here is unit-testable.
 *
 * A template is a versioned JSON schema owned by one institution:
 *   { sections: [ { id, title, instructions?, fields: [ { key, label, type, ... } ] } ] }
 *
 * Field keys are ASCII tokens because they double as DOCX placeholders
 * (`{{field_1}}`) and as keys inside `daily_reports.answers`.
 */

export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "date"
  | "time"
  | "select"
  | "multiselect"
  | "checkbox";

export interface TemplateField {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: string[];
  help?: string;
  placeholder?: string;
}

export interface TemplateSection {
  id: string;
  title: string;
  instructions?: string;
  fields: TemplateField[];
}

export interface TemplateSchema {
  sections: TemplateSection[];
}

export type AnswerValue = string | string[] | boolean | null;
export type Answers = Record<string, AnswerValue>;

export const FIELD_TYPES: FieldType[] = [
  "text",
  "textarea",
  "number",
  "date",
  "time",
  "select",
  "multiselect",
  "checkbox",
];

/** Tokens that always exist in a filled DOCX, whatever the template is. */
export const BUILTIN_TOKENS: { token: string; labelKey: string }[] = [
  { token: "institution_name", labelKey: "institution" },
  { token: "report_title", labelKey: "reportTemplate" },
  { token: "coach_name", labelKey: "coach" },
  { token: "report_date", labelKey: "date" },
  { token: "report_status", labelKey: "status" },
  { token: "group_name", labelKey: "group" },
  { token: "present_count", labelKey: "presentCount" },
  { token: "absent_count", labelKey: "absentCount" },
  { token: "late_count", labelKey: "lateCount" },
  { token: "notes", labelKey: "notes" },
  { token: "review_note", labelKey: "reviewNote" },
  { token: "reviewer_name", labelKey: "reviewedBy" },
  { token: "reviewed_at", labelKey: "reviewedAt" },
  { token: "signature", labelKey: "signature" },
];

let seq = 0;
function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}_${seq.toString(36)}`;
}

/** Test hook: keeps generated ids deterministic. */
export function resetIdSequence(): void {
  seq = 0;
}

export function emptySchema(): TemplateSchema {
  return {
    sections: [{ id: nextId("sec"), title: "", instructions: "", fields: [] }],
  };
}

const ARABIC_DIGITS = /[\u0660-\u0669]/g;
const DIACRITICS = /[\u064B-\u0652\u0670\u06D6-\u06ED]/g;

export function normalizeLabel(value: string): string {
  return (value || "")
    .toString()
    .replace(ARABIC_DIGITS, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(DIACRITICS, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, " ")
    .trim();
}

/** ASCII placeholder-safe key: `field_1`, `field_2`, ... unless a usable slug exists. */
export function slugKey(label: string, index: number, taken: string[] = []): string {
  const base = (label || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24);
  const seed = base && /^[a-z]/.test(base) ? base : `field_${index + 1}`;
  let key = seed;
  let n = 2;
  while (taken.includes(key)) {
    key = `${seed}_${n}`;
    n += 1;
  }
  return key;
}

export function allFields(schema: TemplateSchema): TemplateField[] {
  return (schema?.sections || []).flatMap((s) => s?.fields || []);
}

export function fieldKeys(schema: TemplateSchema): string[] {
  return allFields(schema).map((f) => f.key);
}

export function cloneSchema(schema: TemplateSchema): TemplateSchema {
  return JSON.parse(JSON.stringify(schema || { sections: [] })) as TemplateSchema;
}

export function addSection(schema: TemplateSchema, title = ""): TemplateSchema {
  const next = cloneSchema(schema);
  next.sections.push({ id: nextId("sec"), title, instructions: "", fields: [] });
  return next;
}

export function removeSection(schema: TemplateSchema, sectionId: string): TemplateSchema {
  const next = cloneSchema(schema);
  next.sections = next.sections.filter((s) => s.id !== sectionId);
  return next;
}

export function moveItem<T>(list: T[], from: number, to: number): T[] {
  const copy = [...list];
  if (from < 0 || from >= copy.length || to < 0 || to >= copy.length || from === to) {
    return copy;
  }
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

export function moveSection(schema: TemplateSchema, from: number, to: number): TemplateSchema {
  const next = cloneSchema(schema);
  next.sections = moveItem(next.sections, from, to);
  return next;
}

export function updateSection(
  schema: TemplateSchema,
  sectionId: string,
  patch: Partial<Omit<TemplateSection, "id" | "fields">>,
): TemplateSchema {
  const next = cloneSchema(schema);
  next.sections = next.sections.map((s) => (s.id === sectionId ? { ...s, ...patch } : s));
  return next;
}

export function addField(
  schema: TemplateSchema,
  sectionId: string,
  field?: Partial<TemplateField>,
): { schema: TemplateSchema; key: string } {
  const next = cloneSchema(schema);
  const section = next.sections.find((s) => s.id === sectionId) || next.sections[0];
  if (!section) return { schema: next, key: "" };
  const taken = fieldKeys(next);
  const label = field?.label || "";
  const key = field?.key || slugKey(label, allFields(next).length, taken);
  section.fields.push({
    key,
    label,
    type: field?.type || "text",
    required: field?.required ?? false,
    options: field?.options || [],
    help: field?.help || "",
    placeholder: field?.placeholder || "",
  });
  return { schema: next, key };
}

export function updateField(
  schema: TemplateSchema,
  sectionId: string,
  key: string,
  patch: Partial<TemplateField>,
): TemplateSchema {
  const next = cloneSchema(schema);
  next.sections = next.sections.map((s) =>
    s.id === sectionId
      ? {
          ...s,
          fields: s.fields.map((f) => (f.key === key ? { ...f, ...patch } : f)),
        }
      : s,
  );
  return next;
}

export function removeField(schema: TemplateSchema, sectionId: string, key: string): TemplateSchema {
  const next = cloneSchema(schema);
  next.sections = next.sections.map((s) =>
    s.id === sectionId ? { ...s, fields: s.fields.filter((f) => f.key !== key) } : s,
  );
  return next;
}

export function moveField(
  schema: TemplateSchema,
  sectionId: string,
  from: number,
  to: number,
): TemplateSchema {
  const next = cloneSchema(schema);
  next.sections = next.sections.map((s) =>
    s.id === sectionId ? { ...s, fields: moveItem(s.fields, from, to) } : s,
  );
  return next;
}

/* ------------------------------------------------------------------ */
/* Validation — returns i18n codes so the UI can translate them        */
/* ------------------------------------------------------------------ */

export type SchemaIssue =
  | "templateTitleRequired"
  | "sectionTitleRequired"
  | "fieldLabelRequired"
  | "fieldOptionsRequired"
  | "duplicateFieldKey"
  | "noFields";

export function validateSchema(title: string, schema: TemplateSchema): SchemaIssue[] {
  const issues: SchemaIssue[] = [];
  if (!title || !title.trim()) issues.push("templateTitleRequired");
  const sections = schema?.sections || [];
  const seen: string[] = [];
  let fieldCount = 0;
  for (const section of sections) {
    if (!section.title || !section.title.trim()) issues.push("sectionTitleRequired");
    for (const field of section.fields || []) {
      fieldCount += 1;
      if (!field.label || !field.label.trim()) issues.push("fieldLabelRequired");
      if ((field.type === "select" || field.type === "multiselect") && !(field.options || []).length) {
        issues.push("fieldOptionsRequired");
      }
      if (seen.includes(field.key)) issues.push("duplicateFieldKey");
      else seen.push(field.key);
    }
  }
  if (fieldCount === 0) issues.push("noFields");
  return Array.from(new Set(issues));
}

export type AnswerIssue = "required" | "number" | "date" | "time";

/** Field-level errors keyed by field key. Empty object means valid. */
export function validateAnswers(schema: TemplateSchema, answers: Answers): Record<string, AnswerIssue> {
  const errors: Record<string, AnswerIssue> = {};
  for (const field of allFields(schema)) {
    const raw = answers?.[field.key];
    const empty =
      raw === undefined ||
      raw === null ||
      raw === "" ||
      (Array.isArray(raw) && raw.length === 0);
    if (empty) {
      if (field.required) errors[field.key] = "required";
      continue;
    }
    if (field.type === "number" && Number.isNaN(Number(raw))) errors[field.key] = "number";
    if (field.type === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(String(raw))) errors[field.key] = "date";
    if (field.type === "time" && !/^\d{2}:\d{2}/.test(String(raw))) errors[field.key] = "time";
  }
  return errors;
}

/** Human readable answer for DOCX output and previews. */
export function formatAnswer(field: TemplateField, value: AnswerValue): string {
  if (value === undefined || value === null || value === "") return "";
  if (field.type === "checkbox") return value === true ? "✓" : "✗";
  if (Array.isArray(value)) return value.join("، ".replace("،", field.type === "multiselect" ? "," : ","));
  return String(value);
}

export function answersToRows(
  schema: TemplateSchema,
  answers: Answers,
): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  for (const section of schema?.sections || []) {
    for (const field of section.fields || []) {
      const value = formatAnswer(field, answers?.[field.key] ?? "");
      if (value !== "") rows.push({ label: field.label, value });
    }
  }
  return rows;
}

/* ------------------------------------------------------------------ */
/* DOCX placeholders                                                   */
/* ------------------------------------------------------------------ */

const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_.-]{1,64})\s*\}\}/g;

/** Unique placeholder tokens found in a DOCX XML/text fragment, in order. */
export function extractPlaceholders(text: string): string[] {
  const found: string[] = [];
  const source = text || "";
  let match: RegExpExecArray | null;
  PLACEHOLDER.lastIndex = 0;
  while ((match = PLACEHOLDER.exec(source))) {
    if (!found.includes(match[1])) found.push(match[1]);
  }
  return found;
}

/** Suggests field keys for placeholders by key or normalised label equality. */
export function suggestMapping(
  placeholders: string[],
  fields: TemplateField[],
): Record<string, string> {
  const mapping: Record<string, string> = {};
  const builtins = BUILTIN_TOKENS.map((b) => b.token);
  for (const token of placeholders) {
    if (fields.some((f) => f.key === token)) {
      mapping[token] = token;
      continue;
    }
    const normalised = normalizeLabel(token.replace(/_/g, " "));
    const byLabel = fields.find(
      (f) => normalizeLabel(f.label) === normalised || normalizeLabel(f.key) === normalised,
    );
    mapping[token] = byLabel ? byLabel.key : builtins.includes(token) ? token : "";
  }
  return mapping;
}

/** Placeholders that are neither builtin nor mapped to a template field. */
export function unmappedPlaceholders(
  placeholders: string[],
  mapping: Record<string, string>,
  fields: TemplateField[],
): string[] {
  const builtins = BUILTIN_TOKENS.map((b) => b.token);
  return placeholders.filter((token) => {
    const target = mapping[token];
    if (builtins.includes(token)) return false;
    return !target || !fields.some((f) => f.key === target);
  });
}

/* ------------------------------------------------------------------ */
/* Data bag handed to docxtemplater / to the generated document        */
/* ------------------------------------------------------------------ */

export interface TemplateDataInput {
  institutionName: string;
  templateName: string;
  coachName: string;
  reportDate: string;
  statusLabel: string;
  groupName?: string;
  counts?: Record<string, number>;
  notes?: string;
  reviewNote?: string;
  reviewerName?: string;
  reviewedAt?: string;
  signature?: string;
  answers: Answers;
}

export function buildTemplateData(
  schema: TemplateSchema,
  input: TemplateDataInput,
): Record<string, string> {
  const data: Record<string, string> = {
    institution_name: input.institutionName || "",
    report_title: input.templateName || "",
    coach_name: input.coachName || "",
    report_date: input.reportDate || "",
    report_status: input.statusLabel || "",
    group_name: input.groupName || "",
    present_count: String(input.counts?.present ?? ""),
    absent_count: String(input.counts?.absent ?? ""),
    late_count: String(input.counts?.late ?? ""),
    notes: input.notes || "",
    review_note: input.reviewNote || "",
    reviewer_name: input.reviewerName || "",
    reviewed_at: input.reviewedAt || "",
    signature: input.signature || "",
  };
  for (const field of allFields(schema)) {
    data[field.key] = formatAnswer(field, input.answers?.[field.key] ?? "");
  }
  return data;
}

/** Safe, human readable download name (no path separators, no control chars). */
export function exportFileName(templateName: string, reportDate: string, coachName = ""): string {
  const clean = (value: string) =>
    (value || "")
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ")
      .replace(/\s+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);
  const parts = [clean(templateName) || "report", clean(reportDate), clean(coachName)].filter(
    Boolean,
  );
  return `${parts.join("_")}.docx`;
}

export function isRtlLang(lang: string): boolean {
  return lang === "ar";
}
