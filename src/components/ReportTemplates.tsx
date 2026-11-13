/**
 * Report template builder (institution administration).
 *
 * Lets an administrator define a report template without touching code:
 * sections, typed fields, ordering, required flags, options, preview, publish,
 * archive and version history. It also accepts an uploaded DOCX whose
 * {{placeholders}} are mapped onto template fields, so the institution's own
 * Word layout can be reused when exporting.
 */
import { useEffect, useState } from "react";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  Eye,
  FileText,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  Upload,
} from "lucide-react";
import {
  Badge,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  Modal,
  PageHeader,
  Panel,
} from "./ui";
import { isAdminRole, type AppProfile, type T } from "../lib/app-types";
import {
  createTemplate,
  listTemplates,
  listVersions,
  saveTemplate,
  setTemplateStatus,
  uploadTemplateDocx,
  type ReportTemplate,
  type TemplateVersion,
} from "../lib/template-store";
import {
  BUILTIN_TOKENS,
  FIELD_TYPES,
  addField,
  addSection,
  allFields,
  emptySchema,
  moveField,
  moveSection,
  removeField,
  removeSection,
  suggestMapping,
  unmappedPlaceholders,
  updateField,
  updateSection,
  validateSchema,
  type FieldType,
  type SchemaIssue,
  type TemplateSchema,
} from "../lib/report-templates";
import { TemplateFieldInput } from "./ReportTemplateForm";

type Editor = {
  id: string | null;
  title: string;
  description: string;
  schema: TemplateSchema;
  docx_path: string | null;
  docx_placeholders: string[];
  mapping: Record<string, string>;
};

const ISSUE_KEY: Record<SchemaIssue, string> = {
  templateTitleRequired: "tplIssueTitle",
  sectionTitleRequired: "tplIssueSection",
  fieldLabelRequired: "tplIssueFieldLabel",
  fieldOptionsRequired: "tplIssueOptions",
  duplicateFieldKey: "tplIssueDuplicate",
  noFields: "tplIssueNoFields",
};

const TYPE_LABEL: Record<FieldType, string> = {
  text: "tplTypeText",
  textarea: "tplTypeTextarea",
  number: "tplTypeNumber",
  date: "tplTypeDate",
  time: "tplTypeTime",
  select: "tplTypeSelect",
  multiselect: "tplTypeMultiselect",
  checkbox: "tplTypeCheckbox",
};

function blankEditor(): Editor {
  return {
    id: null,
    title: "",
    description: "",
    schema: emptySchema(),
    docx_path: null,
    docx_placeholders: [],
    mapping: {},
  };
}

export default function ReportTemplates({
  profile,
  t,
  notify,
}: {
  profile: AppProfile;
  t: T;
  notify: (message: string) => void;
}) {
  const [rows, setRows] = useState<ReportTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [missingSchema, setMissingSchema] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [issues, setIssues] = useState<SchemaIssue[]>([]);
  const [preview, setPreview] = useState(false);
  const [versions, setVersions] = useState<{ template: ReportTemplate; list: TemplateVersion[] } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  const allowed = isAdminRole(profile.role);

  async function load() {
    if (!profile.institution_id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const res = await listTemplates(profile.institution_id);
    setRows(res.data);
    setLoadError(res.error);
    setMissingSchema(res.missingSchema);
    setLoading(false);
  }

  useEffect(() => {
    if (allowed) load();
    else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, profile.institution_id]);

  function patch(next: Partial<Editor>) {
    setEditor((prev) => (prev ? { ...prev, ...next } : prev));
  }

  function startEdit(template: ReportTemplate) {
    setIssues([]);
    setEditor({
      id: template.id,
      title: template.title,
      description: template.description || "",
      schema: template.schema,
      docx_path: template.docx_path,
      docx_placeholders: template.docx_placeholders,
      mapping: template.mapping,
    });
  }

  async function save() {
    if (!editor || !profile.institution_id) return;
    const found = validateSchema(editor.title, editor.schema);
    setIssues(found);
    if (found.length) return;
    setBusy(true);
    try {
      const input = {
        title: editor.title.trim(),
        description: editor.description.trim(),
        schema: editor.schema,
        docx_path: editor.docx_path,
        docx_placeholders: editor.docx_placeholders,
        mapping: editor.mapping,
      };
      if (editor.id) {
        const existing = rows.find((row) => row.id === editor.id);
        if (!existing) {
          notify(t("errorTitle"));
          return;
        }
        const res = await saveTemplate(existing, profile.id, input);
        if (res.error) {
          notify(res.error);
          return;
        }
      } else {
        const res = await createTemplate(profile.institution_id, profile.id, input);
        if (res.error || !res.data) {
          notify(res.error || t("errorTitle"));
          return;
        }
      }
      notify(t("tplSaved"));
      setEditor(null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function publish(template: ReportTemplate) {
    setBusy(true);
    try {
      const res = await setTemplateStatus(template.id, "published");
      notify(res.error || t("tplPublishedMsg"));
      if (!res.error) await load();
    } finally {
      setBusy(false);
    }
  }

  async function archive(template: ReportTemplate) {
    if (!window.confirm(t("tplConfirmArchive"))) return;
    setBusy(true);
    try {
      const res = await setTemplateStatus(template.id, "archived");
      notify(res.error || t("tplArchivedMsg"));
      if (!res.error) await load();
    } finally {
      setBusy(false);
    }
  }

  async function upload(file: File) {
    if (!editor || !profile.institution_id) return;
    setBusy(true);
    try {
      const res = await uploadTemplateDocx(profile.institution_id, profile.id, file);
      if (res.error || !res.path) {
        notify(res.error === "invalidDocx" ? t("tplInvalidDocx") : res.error || t("tplInvalidDocx"));
        return;
      }
      const fields = allFields(editor.schema);
      patch({
        docx_path: res.path,
        docx_placeholders: res.placeholders,
        mapping: { ...editor.mapping, ...suggestMapping(res.placeholders, fields) },
      });
      notify(t("tplUploaded"));
    } finally {
      setBusy(false);
    }
  }

  async function openVersions(template: ReportTemplate) {
    const res = await listVersions(template.id);
    setVersions({ template, list: res.data });
    if (res.error) notify(res.error);
  }

  if (!allowed)
    return <EmptyState title={t("tplOnlyAdmin")} icon={<FileText size={26} />} />;
  if (loading) return <LoadingState label={t("loading")} />;
  if (!profile.institution_id)
    return <EmptyState title={t("tplOnlyAdmin")} body={t("tplEmptyHint")} icon={<FileText size={26} />} />;
  if (missingSchema)
    return (
      <ErrorState
        title={t("tplEmpty")}
        message={`supabase/migrations/0005_report_templates.sql`}
        onRetry={load}
        retryLabel={t("retry")}
      />
    );

  const fields = editor ? allFields(editor.schema) : [];
  const unmapped = editor ? unmappedPlaceholders(editor.docx_placeholders, editor.mapping, fields) : [];

  return (
    <div className="page">
      <PageHeader
        title={t("tplNav")}
        subtitle={t("tplVersionNote")}
        icon={<FileText size={22} />}
        actions={
          <>
            <button type="button" className="secondary" onClick={load} disabled={busy}>
              <RefreshCw size={16} /> {t("retry")}
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => {
                setIssues([]);
                setEditor(blankEditor());
              }}
            >
              <Plus size={16} /> {t("tplNew")}
            </button>
          </>
        }
      />

      {loadError && !rows.length && (
        <ErrorState title={t("errorTitle")} message={loadError} onRetry={load} retryLabel={t("retry")} />
      )}

      {editor ? (
        <Panel
          title={editor.id ? t("tplEdit") : t("tplNew")}
          actions={
            <div className="ui-toolbar">
              <button type="button" className="secondary" onClick={() => setPreview(true)}>
                <Eye size={16} /> {t("tplPreview")}
              </button>
              <button type="button" className="secondary" onClick={() => setEditor(null)}>
                {t("cancel")}
              </button>
              <button type="button" className="primary" onClick={save} disabled={busy}>
                <Save size={16} /> {t("tplSave")}
              </button>
            </div>
          }
        >
          {issues.length > 0 && (
            <div className="ui-error" role="alert">
              <div>
                {issues.map((issue) => (
                  <p key={issue}>{t(ISSUE_KEY[issue])}</p>
                ))}
              </div>
            </div>
          )}

          <div className="tpl-grid">
            <Field label={t("tplTitle")}>
              <input
                value={editor.title}
                onChange={(e) => patch({ title: e.target.value })}
                placeholder={t("tplTitle")}
              />
            </Field>
            <Field label={t("tplDescription")}>
              <input
                value={editor.description}
                onChange={(e) => patch({ description: e.target.value })}
              />
            </Field>
          </div>

          <div className="tpl-section">
            <h3>{t("tplSections")}</h3>
            {editor.schema.sections.map((section, sIndex) => (
              <div key={section.id} className="tpl-section-edit">
                <div className="tpl-grid">
                  <Field label={t("tplSectionTitle")}>
                    <input
                      value={section.title}
                      onChange={(e) =>
                        patch({
                          schema: updateSection(editor.schema, section.id, { title: e.target.value }),
                        })
                      }
                    />
                  </Field>
                  <Field label={t("tplInstructions")}>
                    <input
                      value={section.instructions || ""}
                      onChange={(e) =>
                        patch({
                          schema: updateSection(editor.schema, section.id, {
                            instructions: e.target.value,
                          }),
                        })
                      }
                    />
                  </Field>
                </div>
                <div className="ui-toolbar">
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={t("tplMoveUp")}
                    disabled={sIndex === 0}
                    onClick={() => patch({ schema: moveSection(editor.schema, sIndex, sIndex - 1) })}
                  >
                    <ArrowUp size={15} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={t("tplMoveDown")}
                    disabled={sIndex === editor.schema.sections.length - 1}
                    onClick={() => patch({ schema: moveSection(editor.schema, sIndex, sIndex + 1) })}
                  >
                    <ArrowDown size={15} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn danger"
                    aria-label={t("tplDelete")}
                    onClick={() => patch({ schema: removeSection(editor.schema, section.id) })}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>

                {section.fields.map((field, fIndex) => (
                  <div key={field.key} className="tpl-field-edit">
                    <div className="tpl-grid">
                      <Field label={t("tplFieldLabel")}>
                        <input
                          value={field.label}
                          onChange={(e) =>
                            patch({
                              schema: updateField(editor.schema, section.id, field.key, {
                                label: e.target.value,
                              }),
                            })
                          }
                        />
                      </Field>
                      <Field label={t("tplFieldType")}>
                        <select
                          value={field.type}
                          onChange={(e) =>
                            patch({
                              schema: updateField(editor.schema, section.id, field.key, {
                                type: e.target.value as FieldType,
                              }),
                            })
                          }
                        >
                          {FIELD_TYPES.map((type) => (
                            <option key={type} value={type}>
                              {t(TYPE_LABEL[type])}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label={t("tplFieldKey")} hint={field.key}>
                        <input value={field.key} readOnly />
                      </Field>
                      <Field label={t("tplFieldOptions")}>
                        <input
                          value={(field.options || []).join(", ")}
                          onChange={(e) =>
                            patch({
                              schema: updateField(editor.schema, section.id, field.key, {
                                options: e.target.value
                                  .split(",")
                                  .map((item) => item.trim())
                                  .filter(Boolean),
                              }),
                            })
                          }
                        />
                      </Field>
                      <Field label={t("tplFieldHelp")}>
                        <input
                          value={field.help || ""}
                          onChange={(e) =>
                            patch({
                              schema: updateField(editor.schema, section.id, field.key, {
                                help: e.target.value,
                              }),
                            })
                          }
                        />
                      </Field>
                      <Field label={t("tplFieldRequired")}>
                        <label className="tpl-check">
                          <input
                            type="checkbox"
                            checked={Boolean(field.required)}
                            onChange={(e) =>
                              patch({
                                schema: updateField(editor.schema, section.id, field.key, {
                                  required: e.target.checked,
                                }),
                              })
                            }
                          />
                          <span>{t("tplFieldRequired")}</span>
                        </label>
                      </Field>
                    </div>
                    <div className="ui-toolbar">
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={t("tplMoveUp")}
                        disabled={fIndex === 0}
                        onClick={() =>
                          patch({
                            schema: moveField(editor.schema, section.id, fIndex, fIndex - 1),
                          })
                        }
                      >
                        <ArrowUp size={15} />
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={t("tplMoveDown")}
                        disabled={fIndex === section.fields.length - 1}
                        onClick={() =>
                          patch({
                            schema: moveField(editor.schema, section.id, fIndex, fIndex + 1),
                          })
                        }
                      >
                        <ArrowDown size={15} />
                      </button>
                      <button
                        type="button"
                        className="icon-btn danger"
                        aria-label={t("tplDelete")}
                        onClick={() =>
                          patch({
                            schema: removeField(editor.schema, section.id, field.key),
                          })
                        }
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    const res = addField(editor.schema, section.id, { label: "" });
                    patch({ schema: res.schema });
                  }}
                >
                  <Plus size={16} /> {t("tplAddField")}
                </button>
              </div>
            ))}
            <button
              type="button"
              className="secondary"
              onClick={() => patch({ schema: addSection(editor.schema, "") })}
            >
              <Plus size={16} /> {t("tplAddSection")}
            </button>
          </div>

          <div className="tpl-section">
            <h3>{t("tplDocx")}</h3>
            <p className="muted">{t("tplDocxHint")}</p>
            <div className="ui-toolbar">
              <label className="secondary tpl-upload">
                <Upload size={16} /> {t("tplUploadDocx")}
                <input
                  type="file"
                  accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) upload(file);
                    e.target.value = "";
                  }}
                />
              </label>
              {editor.docx_path && (
                <button
                  type="button"
                  className="secondary danger"
                  onClick={() => patch({ docx_path: null, docx_placeholders: [], mapping: {} })}
                >
                  {t("tplRemoveDocx")}
                </button>
              )}
            </div>

            {editor.docx_placeholders.length > 0 ? (
              <>
                <h4>{t("tplPlaceholders")}</h4>
                <div className="tpl-mapping">
                  {editor.docx_placeholders.map((token) => {
                    const builtin = BUILTIN_TOKENS.some((item) => item.token === token);
                    return (
                      <div key={token} className="tpl-mapping-row">
                        <code>{`{{${token}}}`}</code>
                        {builtin ? (
                          <Badge tone="info">{t("tplBuiltin")}</Badge>
                        ) : (
                          <select
                            value={editor.mapping[token] || ""}
                            aria-label={t("tplMapping")}
                            onChange={(e) =>
                              patch({ mapping: { ...editor.mapping, [token]: e.target.value } })
                            }
                          >
                            <option value="">{t("tplUnmapped")}</option>
                            {fields.map((field) => (
                              <option key={field.key} value={field.key}>
                                {field.label || field.key}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    );
                  })}
                </div>
                {unmapped.length > 0 && (
                  <p className="ui-field-error">
                    {t("tplUnmapped")}: {unmapped.join(", ")}
                  </p>
                )}
              </>
            ) : (
              <p className="muted">{t("tplNoPlaceholders")}</p>
            )}
          </div>
        </Panel>
      ) : rows.length === 0 ? (
        <EmptyState
          title={t("tplEmpty")}
          body={t("tplEmptyHint")}
          icon={<FileText size={26} />}
          action={
            <button type="button" className="primary" onClick={() => setEditor(blankEditor())}>
              <Plus size={16} /> {t("tplNew")}
            </button>
          }
        />
      ) : (
        <Panel>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t("tplTitle")}</th>
                  <th>{t("tplStatus")}</th>
                  <th>{t("tplVersion")}</th>
                  <th>{t("tplDocx")}</th>
                  <th>{t("tplActions")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.title}</td>
                    <td>
                      <Badge
                        tone={
                          row.status === "published"
                            ? "success"
                            : row.status === "archived"
                              ? "danger"
                              : "neutral"
                        }
                      >
                        {row.status === "published"
                          ? t("tplPublished")
                          : row.status === "archived"
                            ? t("tplArchived")
                            : t("tplDraft")}
                      </Badge>
                    </td>
                    <td>v{row.current_version}</td>
                    <td>{row.docx_path ? "DOCX" : "—"}</td>
                    <td>
                      <div className="ui-toolbar">
                        <button type="button" className="secondary" onClick={() => startEdit(row)}>
                          {t("tplEdit")}
                        </button>
                        {row.status !== "published" && (
                          <button
                            type="button"
                            className="primary"
                            disabled={busy}
                            onClick={() => publish(row)}
                          >
                            {t("tplPublish")}
                          </button>
                        )}
                        <button type="button" className="secondary" onClick={() => openVersions(row)}>
                          {t("tplVersions")}
                        </button>
                        {row.status !== "archived" && (
                          <button
                            type="button"
                            className="secondary danger"
                            disabled={busy}
                            onClick={() => archive(row)}
                          >
                            <Archive size={15} /> {t("tplArchive")}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {preview && editor && (
        <Modal title={t("tplPreview")} onClose={() => setPreview(false)} closeLabel={t("cancel")}>
          <h3>{editor.title || t("tplTitle")}</h3>
          {editor.description && <p className="muted">{editor.description}</p>}
          {editor.schema.sections.map((section) => (
            <div key={section.id} className="tpl-section">
              <h4>{section.title || t("tplSectionTitle")}</h4>
              {section.instructions && <p className="muted">{section.instructions}</p>}
              <div className="tpl-grid">
                {section.fields.map((field) => (
                  <TemplateFieldInput
                    key={field.key}
                    field={field}
                    value={undefined}
                    t={t}
                    disabled
                    onChange={() => {}}
                  />
                ))}
              </div>
            </div>
          ))}
        </Modal>
      )}

      {versions && (
        <Modal
          title={`${t("tplVersions")} · ${versions.template.title}`}
          onClose={() => setVersions(null)}
          closeLabel={t("cancel")}
        >
          <table className="tpl-versions">
            <thead>
              <tr>
                <th>{t("tplVersion")}</th>
                <th>{t("tplTitle")}</th>
                <th>{t("date")}</th>
              </tr>
            </thead>
            <tbody>
              {versions.list.map((version) => (
                <tr key={version.id}>
                  <td>v{version.version}</td>
                  <td>{version.title}</td>
                  <td>{new Date(version.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {versions.list.length === 0 && <p className="muted">{t("tplNoFields")}</p>}
        </Modal>
      )}
    </div>
  );
}
