/**
 * Supabase access for report templates.
 *
 * Every function returns an explicit error string instead of throwing, and
 * `missingSchema` distinguishes "migration 0005 not applied yet" from a normal
 * empty result — the UI shows a configuration notice, not an empty state.
 */
import { supabase } from "./supabase";
import type { TemplateSchema } from "./report-templates";
import { readDocxPlaceholders } from "./docx-export";

export type TemplateStatus = "draft" | "published" | "archived";

export interface ReportTemplate {
  id: string;
  institution_id: string;
  title: string;
  description: string | null;
  schema: TemplateSchema;
  current_version: number;
  status: TemplateStatus;
  docx_path: string | null;
  docx_placeholders: string[];
  mapping: Record<string, string>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface TemplateVersion {
  id: string;
  template_id: string;
  version: number;
  title: string;
  schema: TemplateSchema;
  docx_path: string | null;
  mapping: Record<string, string>;
  created_at: string;
}

export interface TemplateInput {
  title: string;
  description: string;
  schema: TemplateSchema;
  docx_path: string | null;
  docx_placeholders: string[];
  mapping: Record<string, string>;
}

export const BUCKET = "trainer-media";

/** True when the error means "table/column from migration 0005 is absent". */
export function isMissingSchema(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  const code = error.code || "";
  const message = (error.message || "").toLowerCase();
  return (
    code === "42P01" ||
    code === "42703" ||
    code === "PGRST204" ||
    message.includes("does not exist") ||
    message.includes("schema cache")
  );
}

function normalise(row: any): ReportTemplate {
  return {
    ...row,
    schema: row?.schema && row.schema.sections ? (row.schema as TemplateSchema) : { sections: [] },
    docx_placeholders: Array.isArray(row?.docx_placeholders) ? row.docx_placeholders : [],
    mapping: row?.mapping && typeof row.mapping === "object" ? row.mapping : {},
    description: row?.description ?? "",
    docx_path: row?.docx_path ?? null,
  };
}

export async function listTemplates(
  institutionId: string,
): Promise<{ data: ReportTemplate[]; error: string | null; missingSchema: boolean }> {
  const { data, error } = await supabase
    .from("report_templates")
    .select("*")
    .eq("institution_id", institutionId)
    .order("created_at", { ascending: false });
  if (error) {
    return { data: [], error: error.message, missingSchema: isMissingSchema(error) };
  }
  return { data: (data || []).map(normalise), error: null, missingSchema: false };
}

export async function listPublishedTemplates(
  institutionId: string,
): Promise<{ data: ReportTemplate[]; error: string | null; missingSchema: boolean }> {
  const all = await listTemplates(institutionId);
  return { ...all, data: all.data.filter((t) => t.status === "published") };
}

export async function createTemplate(
  institutionId: string,
  userId: string,
  input: TemplateInput,
): Promise<{ data: ReportTemplate | null; error: string | null }> {
  const { data, error } = await supabase
    .from("report_templates")
    .insert({
      institution_id: institutionId,
      title: input.title,
      description: input.description,
      schema: input.schema,
      docx_path: input.docx_path,
      docx_placeholders: input.docx_placeholders,
      mapping: input.mapping,
      current_version: 1,
      status: "draft",
      created_by: userId,
    })
    .select("*")
    .maybeSingle();
  if (error) return { data: null, error: error.message };
  const row = normalise(data);
  await supabase.from("report_template_versions").insert({
    template_id: row.id,
    institution_id: institutionId,
    version: 1,
    title: row.title,
    description: row.description,
    schema: row.schema,
    docx_path: row.docx_path,
    mapping: row.mapping,
    created_by: userId,
  });
  return { data: row, error: null };
}

/**
 * Saves new content. The published row is updated and a version snapshot is
 * written first, so reports already filled with version N keep working.
 */
export async function saveTemplate(
  template: ReportTemplate,
  userId: string,
  input: TemplateInput,
): Promise<{ data: ReportTemplate | null; error: string | null; version: number }> {
  const version = (template.current_version || 1) + 1;
  const { error: versionError } = await supabase.from("report_template_versions").insert({
    template_id: template.id,
    institution_id: template.institution_id,
    version,
    title: input.title,
    description: input.description,
    schema: input.schema,
    docx_path: input.docx_path,
    mapping: input.mapping,
    created_by: userId,
  });
  if (versionError) return { data: null, error: versionError.message, version };

  const { data, error } = await supabase
    .from("report_templates")
    .update({
      title: input.title,
      description: input.description,
      schema: input.schema,
      docx_path: input.docx_path,
      docx_placeholders: input.docx_placeholders,
      mapping: input.mapping,
      current_version: version,
      updated_at: new Date().toISOString(),
    })
    .eq("id", template.id)
    .select("*")
    .maybeSingle();
  if (error) return { data: null, error: error.message, version };
  return { data: normalise(data), error: null, version };
}

export async function setTemplateStatus(
  id: string,
  status: TemplateStatus,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("report_templates")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);
  return { error: error ? error.message : null };
}

export async function listVersions(
  templateId: string,
): Promise<{ data: TemplateVersion[]; error: string | null }> {
  const { data, error } = await supabase
    .from("report_template_versions")
    .select("*")
    .eq("template_id", templateId)
    .order("version", { ascending: false });
  if (error) return { data: [], error: error.message };
  return { data: (data || []) as TemplateVersion[], error: null };
}

/** Validates and uploads a DOCX template; returns its private storage path. */
export async function uploadTemplateDocx(
  institutionId: string,
  userId: string,
  file: File,
): Promise<{ path: string | null; placeholders: string[]; error: string | null }> {
  if (!file.name.toLowerCase().endsWith(".docx")) {
    return { path: null, placeholders: [], error: "invalidDocx" };
  }
  let placeholders: string[] = [];
  try {
    const bytes = await file.arrayBuffer();
    placeholders = readDocxPlaceholders(bytes).placeholders;
  } catch {
    return { path: null, placeholders: [], error: "invalidDocx" };
  }
  const path = `${institutionId}/templates/${crypto.randomUUID()}.docx`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600",
    contentType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    upsert: false,
  });
  if (error) return { path: null, placeholders: [], error: error.message };
  return { path, placeholders, error: null };
}

export async function downloadDocx(path: string): Promise<ArrayBuffer | null> {
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) return null;
  return data.arrayBuffer();
}

export interface ConversationOption {
  id: string;
  title: string;
}

/** Conversations the user belongs to — used to share an exported DOCX. */
export async function listMyConversations(userId: string): Promise<ConversationOption[]> {
  const { data, error } = await supabase
    .from("conversation_members")
    .select("conversation_id, conversations:conversations!conversation_members_conversation_id_fkey(id,title,is_group)")
    .eq("profile_id", userId);
  if (error || !data) return [];
  return (data as any[])
    .map((row) => {
      const c = row.conversations;
      if (!c?.id) return null;
      return { id: c.id as string, title: (c.title as string) || "" };
    })
    .filter(Boolean) as ConversationOption[];
}

/** Uploads a generated DOCX into a conversation as a real message attachment. */
export async function sendDocxToConversation(opts: {
  institutionId: string;
  conversationId: string;
  userId: string;
  blob: Blob;
  fileName: string;
  body?: string;
}): Promise<{ error: string | null }> {
  const path = `${opts.institutionId}/docx/${opts.conversationId}/${opts.userId}/${crypto.randomUUID()}.docx`;
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, opts.blob, {
      cacheControl: "3600",
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      upsert: false,
    });
  if (uploadError) return { error: uploadError.message };

  const { error } = await supabase.from("messages").insert({
    conversation_id: opts.conversationId,
    sender_id: opts.userId,
    body: opts.body || opts.fileName,
    message_type: "document",
    media_path: path,
  });
  return { error: error ? error.message : null };
}
