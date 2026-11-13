/**
 * DOCX generation and DOCX template filling.
 *
 * Two real paths, both producing a genuine .docx (Office Open XML zip):
 *  1. buildReportDocx — generates a formatted document from report data
 *     (institution header, field table, review block, signature) with RTL support.
 *  2. fillDocxTemplate — fills an uploaded DOCX that contains {{placeholders}}
 *     using docxtemplater, preserving the original formatting.
 *
 * Both work in the browser (Blob) and in Node (tests).
 */
import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  PageBreak,
  Paragraph,
  TextRun,
} from "docx";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { extractPlaceholders, type Answers, type TemplateSchema } from "./report-templates";

export interface ReportDocInput {
  institutionName: string;
  templateName: string;
  coachName: string;
  reportDate: string;
  statusLabel: string;
  groupName?: string;
  rows: { label: string; value: string }[];
  notes?: string;
  counts?: { present?: number; absent?: number; late?: number; excused?: number };
  reviewNote?: string;
  reviewerName?: string;
  reviewedAt?: string;
  lang: "ar" | "fr" | "en";
  signatureLabel?: string;
  labels?: {
    date?: string;
    coach?: string;
    group?: string;
    status?: string;
    fields?: string;
    notes?: string;
    attendance?: string;
    review?: string;
    reviewNote?: string;
    reviewedBy?: string;
    reviewedAt?: string;
    present?: string;
    absent?: string;
    late?: string;
    signature?: string;
    page?: string;
  };
}

const isRtl = (lang: string) => lang === "ar";

function baseParagraph(text: string, input: ReportDocInput, opts: Partial<{
  bold: boolean;
  size: number;
  heading: (typeof HeadingLevel)[keyof typeof HeadingLevel];
  spacingAfter: number;
}> = {}): Paragraph {
  const rtl = isRtl(input.lang);
  return new Paragraph({
    alignment: rtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
    bidirectional: rtl,
    heading: opts.heading,
    spacing: { after: opts.spacingAfter ?? 120 },
    children: [
      new TextRun({
        text,
        bold: opts.bold,
        size: opts.size ?? 24,
        rightToLeft: rtl,
        font: rtl ? "Arial" : "Calibri",
      }),
    ],
  });
}

function labelValueParagraph(label: string, value: string, input: ReportDocInput): Paragraph {
  const rtl = isRtl(input.lang);
  return new Paragraph({
    alignment: rtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
    bidirectional: rtl,
    spacing: { after: 80 },
    children: [
      new TextRun({
        text: `${label}: `,
        bold: true,
        size: 22,
        rightToLeft: rtl,
        font: rtl ? "Arial" : "Calibri",
      }),
      new TextRun({
        text: value || "—",
        size: 22,
        rightToLeft: rtl,
        font: rtl ? "Arial" : "Calibri",
      }),
    ],
  });
}

function reportParagraphs(input: ReportDocInput): Paragraph[] {
  const l = input.labels || {};
  const out: Paragraph[] = [];

  out.push(
    baseParagraph(input.institutionName || "", input, {
      heading: HeadingLevel.HEADING_2,
      bold: true,
      size: 30,
      spacingAfter: 60,
    }),
  );
  out.push(
    baseParagraph(input.templateName || "", input, {
      heading: HeadingLevel.HEADING_1,
      bold: true,
      size: 36,
      spacingAfter: 200,
    }),
  );

  out.push(labelValueParagraph(l.date || "Date", input.reportDate, input));
  out.push(labelValueParagraph(l.coach || "Coach", input.coachName, input));
  if (input.groupName) out.push(labelValueParagraph(l.group || "Group", input.groupName, input));
  out.push(labelValueParagraph(l.status || "Status", input.statusLabel, input));

  if (input.counts) {
    const parts = [
      `${l.present || "Present"}: ${input.counts.present ?? 0}`,
      `${l.absent || "Absent"}: ${input.counts.absent ?? 0}`,
      `${l.late || "Late"}: ${input.counts.late ?? 0}`,
    ];
    out.push(baseParagraph(parts.join("   |   "), input, { spacingAfter: 200 }));
  }

  if (input.rows.length) {
    out.push(
      baseParagraph(l.fields || "Report fields", input, {
        heading: HeadingLevel.HEADING_3,
        bold: true,
        spacingAfter: 120,
      }),
    );
    for (const row of input.rows) {
      out.push(labelValueParagraph(row.label, row.value, input));
    }
  }

  if (input.notes) {
    out.push(
      baseParagraph(l.notes || "Notes", input, {
        heading: HeadingLevel.HEADING_3,
        bold: true,
        spacingAfter: 120,
      }),
    );
    for (const line of String(input.notes).split(/\n+/)) {
      if (line.trim()) out.push(baseParagraph(line, input, { spacingAfter: 80 }));
    }
  }

  if (input.reviewNote || input.reviewerName || input.reviewedAt) {
    out.push(
      baseParagraph(l.review || "Review", input, {
        heading: HeadingLevel.HEADING_3,
        bold: true,
        spacingAfter: 120,
      }),
    );
    if (input.reviewerName) out.push(labelValueParagraph(l.reviewedBy || "Reviewed by", input.reviewerName, input));
    if (input.reviewedAt) out.push(labelValueParagraph(l.reviewedAt || "Reviewed at", input.reviewedAt, input));
    if (input.reviewNote) out.push(labelValueParagraph(l.reviewNote || "Review note", input.reviewNote, input));
  }

  out.push(baseParagraph("", input, { spacingAfter: 200 }));
  out.push(
    labelValueParagraph(
      l.signature || "Signature",
      input.signatureLabel || "____________________",
      input,
    ),
  );

  return out;
}

/** One report → Document. */
export function buildReportDocument(input: ReportDocInput): Document {
  const rtl = isRtl(input.lang);
  return new Document({
    creator: "THE TRAINERS",
    title: input.templateName,
    styles: {
      default: {
        document: {
          run: { font: rtl ? "Arial" : "Calibri", size: 22 },
          paragraph: { spacing: { line: 300 } },
        },
      },
    },
    sections: [
      {
        properties: {},
        children: reportParagraphs(input),
      },
    ],
  });
}

/** Several reports → one Document, one report per page. */
export function buildBulkDocument(inputs: ReportDocInput[]): Document {
  const children: Paragraph[] = [];
  inputs.forEach((input, index) => {
    if (index > 0) children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(...reportParagraphs(input));
  });
  const rtl = isRtl(inputs[0]?.lang || "ar");
  return new Document({
    creator: "THE TRAINERS",
    title: "Reports",
    styles: {
      default: {
        document: {
          run: { font: rtl ? "Arial" : "Calibri", size: 22 },
          paragraph: { spacing: { line: 300 } },
        },
      },
    },
    sections: [{ properties: {}, children }],
  });
}

/** Serialises a Document to bytes (works in browser and Node). */
export async function documentToArrayBuffer(doc: Document): Promise<ArrayBuffer> {
  const blob = await Packer.toBlob(doc);
  return blob.arrayBuffer();
}

export async function documentToBlob(doc: Document): Promise<Blob> {
  return Packer.toBlob(doc);
}

/* ------------------------------------------------------------------ */
/* Uploaded DOCX templates                                             */
/* ------------------------------------------------------------------ */

function templateParts(zip: PizZip): string[] {
  return Object.keys(zip.files).filter(
    (name) =>
      /^word\/(document|header\d*|footer\d*)\.xml$/.test(name) && !zip.files[name].dir,
  );
}

/**
 * Reads the placeholder tokens of an uploaded DOCX.
 * Throws a descriptive error when the file is not a DOCX or has no placeholders.
 */
export function readDocxPlaceholders(bytes: ArrayBuffer): {
  placeholders: string[];
  parts: number;
} {
  let zip: PizZip;
  try {
    zip = new PizZip(bytes);
  } catch {
    throw new Error("invalidDocx");
  }
  const parts = templateParts(zip);
  if (!parts.length) throw new Error("invalidDocx");
  const found: string[] = [];
  for (const part of parts) {
    const xml = zip.files[part].asText();
    for (const token of extractPlaceholders(xml)) {
      if (!found.includes(token)) found.push(token);
    }
  }
  return { placeholders: found, parts: parts.length };
}

/** Fills {{placeholders}} in an uploaded DOCX, keeping its formatting. */
export function fillDocxTemplate(bytes: ArrayBuffer, data: Record<string, string>): ArrayBuffer {
  const zip = new PizZip(bytes);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: "{{", end: "}}" },
    nullGetter: () => "",
  });
  doc.render(data);
  return doc.getZip().generate({ type: "arraybuffer" }) as ArrayBuffer;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export function answersFromRows(schema: TemplateSchema, answers: Answers): { label: string; value: string }[] {
  return (schema?.sections || []).flatMap((section) =>
    (section.fields || []).map((field) => {
      const raw = answers?.[field.key];
      const value =
        raw === undefined || raw === null || raw === ""
          ? ""
          : Array.isArray(raw)
            ? raw.join(", ")
            : typeof raw === "boolean"
              ? raw
                ? "✓"
                : "✗"
              : String(raw);
      return { label: field.label, value };
    }),
  ).filter((row) => row.value !== "");
}
