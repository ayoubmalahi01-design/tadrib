// Report templates + real DOCX generation/filling.
//
// These tests build an actual Office Open XML package with the `docx` library,
// read it back with PizZip, fill a template that carries {{placeholders}} with
// docxtemplater and assert the produced document contains the substituted text.
// Nothing here is a mock: the generated files are real .docx archives.
import { test } from "node:test";
import assert from "node:assert/strict";
import PizZip from "pizzip";
import {
  Document,
  Paragraph,
  TextRun,
  Packer,
} from "docx";
import {
  BUILTIN_TOKENS,
  addField,
  addSection,
  allFields,
  answersToRows,
  buildTemplateData,
  emptySchema,
  exportFileName,
  extractPlaceholders,
  fieldKeys,
  formatAnswer,
  moveItem,
  removeField,
  suggestMapping,
  unmappedPlaceholders,
  updateField,
  validateAnswers,
  validateSchema,
  type TemplateSchema,
} from "../src/lib/report-templates.ts";
import {
  buildBulkDocument,
  buildReportDocument,
  documentToArrayBuffer,
  fillDocxTemplate,
  readDocxPlaceholders,
} from "../src/lib/docx-export.ts";

function schemaWithFields(): { schema: TemplateSchema; sectionId: string } {
  let schema = emptySchema();
  const sectionId = schema.sections[0].id;
  schema = addField(schema, sectionId, {
    label: "Activities completed",
    type: "textarea",
    required: true,
  }).schema;
  schema = addField(schema, sectionId, {
    label: "Participants",
    type: "number",
  }).schema;
  schema = addField(schema, sectionId, {
    label: "Behaviour",
    type: "select",
    options: ["good", "average", "poor"],
  }).schema;
  return { schema, sectionId };
}

async function docxWithText(lines: string[]): Promise<ArrayBuffer> {
  const doc = new Document({
    sections: [
      {
        properties: {},
        children: lines.map(
          (line) => new Paragraph({ children: [new TextRun({ text: line })] }),
        ),
      },
    ],
  });
  return documentToArrayBuffer(doc);
}

test("empty template starts with one editable section", () => {
  const schema = emptySchema();
  assert.equal(schema.sections.length, 1);
  assert.equal(schema.sections[0].fields.length, 0);
  assert.ok(schema.sections[0].id.length > 0);
});

test("addField generates unique ASCII keys that are DOCX-safe", () => {
  const { schema } = schemaWithFields();
  const keys = fieldKeys(schema);
  assert.equal(keys.length, 3);
  assert.equal(new Set(keys).size, 3);
  for (const key of keys) {
    assert.match(key, /^[a-z0-9_]+$/, `key ${key} must be a safe placeholder token`);
  }
});

test("non-latin labels still receive a usable placeholder key", () => {
  const schema = emptySchema();
  const sectionId = schema.sections[0].id;
  const { schema: next, key } = addField(schema, sectionId, { label: "الأنشطة المنجزة" });
  assert.match(key, /^field_\d+$/);
  assert.equal(fieldKeys(next)[0], key);
});

test("sections can be added and fields moved and removed", () => {
  let schema = emptySchema();
  schema = addSection(schema, "Second");
  assert.equal(schema.sections.length, 2);

  const first = schema.sections[0].id;
  schema = addField(schema, first, { label: "A" }).schema;
  schema = addField(schema, first, { label: "B" }).schema;
  assert.deepEqual(
    schema.sections[0].fields.map((f) => f.label),
    ["A", "B"],
  );

  schema = { ...schema, sections: schema.sections.map((s) => (s.id === first ? { ...s, fields: moveItem(s.fields, 0, 1) } : s)) };
  assert.deepEqual(
    schema.sections[0].fields.map((f) => f.label),
    ["B", "A"],
  );

  schema = removeField(schema, first, schema.sections[0].fields[0].key);
  assert.equal(schema.sections[0].fields.length, 1);
});

test("updateField keeps the key stable so old reports stay readable", () => {
  const { schema, sectionId } = schemaWithFields();
  const key = schema.sections[0].fields[0].key;
  const next = updateField(schema, sectionId, key, { label: "Renamed" });
  assert.equal(next.sections[0].fields[0].key, key);
  assert.equal(next.sections[0].fields[0].label, "Renamed");
});

test("validateSchema reports the actionable issues", () => {
  const empty = emptySchema();
  assert.ok(validateSchema("", empty).includes("templateTitleRequired"));
  assert.ok(validateSchema("T", empty).includes("noFields"));
  assert.ok(validateSchema("T", empty).includes("sectionTitleRequired"));

  let schema = emptySchema();
  schema = { ...schema, sections: schema.sections.map((s) => ({ ...s, title: "S" })) };
  schema = addField(schema, schema.sections[0].id, { label: "Choice", type: "select" }).schema;
  assert.ok(validateSchema("T", schema).includes("fieldOptionsRequired"));

  const ok = schemaWithFields();
  ok.schema.sections[0].title = "Activities";
  assert.deepEqual(validateSchema("Daily report", ok.schema), []);
});

test("validateAnswers enforces required, numeric, date and time fields", () => {
  const { schema } = schemaWithFields();
  const errors = validateAnswers(schema, {});
  const activitiesKey = allFields(schema)[0].key;
  assert.equal(errors[activitiesKey], "required");

  const participantsKey = allFields(schema)[1].key;
  assert.equal(validateAnswers(schema, { [activitiesKey]: "done", [participantsKey]: "abc" })[participantsKey], "number");
  assert.deepEqual(validateAnswers(schema, { [activitiesKey]: "done", [participantsKey]: "12" }), {});

  const schema2 = addField(emptySchema(), emptySchema().sections[0].id, { label: "Day", type: "date" });
  assert.equal(validateAnswers(schema2.schema, { [schema2.key]: "12/05/2026" })[schema2.key], "date");
  assert.deepEqual(validateAnswers(schema2.schema, { [schema2.key]: "2026-05-12" }), {});
});

test("answers are formatted and ordered for documents", () => {
  const { schema } = schemaWithFields();
  const [activities, participants, behaviour] = allFields(schema);
  const rows = answersToRows(schema, {
    [activities.key]: "Warm up\nMatch",
    [participants.key]: 14,
    [behaviour.key]: "good",
  });
  assert.deepEqual(rows, [
    { label: "Activities completed", value: "Warm up\nMatch" },
    { label: "Participants", value: "14" },
    { label: "Behaviour", value: "good" },
  ]);
  assert.equal(formatAnswer({ ...participants, type: "checkbox" }, true), "✓");
  assert.equal(formatAnswer({ ...participants, type: "checkbox" }, false), "✗");
});

test("placeholders are extracted once, in order, and only when well formed", () => {
  const tokens = extractPlaceholders(
    "{{coach_name}} and {{ report_date }} and {{coach_name}} but not {single} or {{bad token}}",
  );
  assert.deepEqual(tokens, ["coach_name", "report_date"]);
});

test("mapping suggests field keys by key and by label, leaving unknown tokens unmapped", () => {
  const { schema } = schemaWithFields();
  const fields = allFields(schema);
  const mapping = suggestMapping(["coach_name", fields[0].key, "activities_completed", "mystery"], fields);
  assert.equal(mapping.coach_name, "coach_name");
  assert.equal(mapping[fields[0].key], fields[0].key);
  assert.equal(mapping.activities_completed, fields[0].key);
  assert.equal(mapping.mystery, "");

  const unmapped = unmappedPlaceholders(["coach_name", "mystery"], mapping, fields);
  assert.deepEqual(unmapped, ["mystery"]);
  assert.ok(BUILTIN_TOKENS.some((b) => b.token === "coach_name"));
});

test("buildTemplateData exposes builtin tokens plus every template field", () => {
  const { schema } = schemaWithFields();
  const fields = allFields(schema);
  const data = buildTemplateData(schema, {
    institutionName: "Club Nour",
    templateName: "Daily report",
    coachName: "Sami",
    reportDate: "2026-05-12",
    statusLabel: "Submitted",
    groupName: "U15",
    counts: { present: 12, absent: 2, late: 1 },
    notes: "Good session",
    reviewNote: "Approved",
    reviewerName: "Director",
    reviewedAt: "2026-05-13",
    answers: { [fields[0].key]: "Warm up", [fields[1].key]: 12 },
  });
  assert.equal(data.institution_name, "Club Nour");
  assert.equal(data.coach_name, "Sami");
  assert.equal(data.present_count, "12");
  assert.equal(data[fields[0].key], "Warm up");
  assert.equal(data[fields[1].key], "12");
  assert.equal(data[fields[2].key], "");
});

test("exportFileName is filesystem safe", () => {
  const name = exportFileName("تقرير/يومي", "2026-05-12", "Sami A.");
  assert.ok(name.endsWith(".docx"));
  assert.ok(!/[\\/:*?"<>|]/.test(name));
  assert.ok(name.includes("2026-05-12"));
});

test("a generated report is a real DOCX containing the report text", async () => {
  const bytes = await documentToArrayBuffer(
    buildReportDocument({
      institutionName: "Club Nour",
      templateName: "Daily report",
      coachName: "Sami",
      reportDate: "2026-05-12",
      statusLabel: "Submitted",
      rows: [{ label: "Activities", value: "Warm up and match" }],
      notes: "Good session",
      lang: "ar",
    }),
  );
  const zip = new PizZip(bytes);
  assert.ok(zip.files["word/document.xml"], "package must contain word/document.xml");
  assert.ok(zip.files["[Content_Types].xml"], "package must contain content types");
  const xml = zip.files["word/document.xml"].asText();
  assert.ok(xml.includes("Club Nour"));
  assert.ok(xml.includes("Warm up and match"));
  // Arabic output must be flagged right-to-left for Word.
  assert.ok(/rtl|bidi/i.test(xml), "arabic paragraphs must carry RTL/bidi formatting");
});

test("bulk export puts every report in one document", async () => {
  const base = {
    institutionName: "Club Nour",
    templateName: "Daily report",
    reportDate: "2026-05-12",
    statusLabel: "Submitted",
    rows: [],
    lang: "en" as const,
  };
  const bytes = await documentToArrayBuffer(
    buildBulkDocument([
      { ...base, coachName: "Coach One" },
      { ...base, coachName: "Coach Two" },
    ]),
  );
  const xml = new PizZip(bytes).files["word/document.xml"].asText();
  assert.ok(xml.includes("Coach One"));
  assert.ok(xml.includes("Coach Two"));
});

test("an uploaded DOCX template is read, filled and keeps the substitution", async () => {
  const template = await docxWithText([
    "Coach: {{coach_name}}",
    "Date: {{report_date}}",
    "Activities: {{field_1}}",
  ]);

  const { placeholders, parts } = readDocxPlaceholders(template);
  assert.ok(parts >= 1);
  assert.deepEqual(placeholders, ["coach_name", "report_date", "field_1"]);

  const filled = fillDocxTemplate(template, {
    coach_name: "Sami",
    report_date: "2026-05-12",
    field_1: "Warm up and match",
  });
  const xml = new PizZip(filled).files["word/document.xml"].asText();
  assert.ok(xml.includes("Sami"));
  assert.ok(xml.includes("2026-05-12"));
  assert.ok(xml.includes("Warm up and match"));
  assert.ok(!xml.includes("{{coach_name}}"), "placeholders must be replaced");
});

test("a file without DOCX structure is rejected with a clear code", () => {
  const notDocx = new TextEncoder().encode("plain text").buffer as ArrayBuffer;
  assert.throws(() => readDocxPlaceholders(notDocx), /invalidDocx/);
});

test("a DOCX without placeholders reports zero tokens instead of failing", async () => {
  const bytes = await docxWithText(["No tokens here"]);
  const result = readDocxPlaceholders(bytes);
  assert.deepEqual(result.placeholders, []);
});
