import { defineStore } from 'pinia';
import { ref } from 'vue';
import { ApiError, apiRequestJson } from '../utils/apiClient';
import { toUserMessage, USER_MESSAGES } from '../utils/userMessages';
import { uniqueSlug } from '../utils/comparisonTemplateSegments';

/**
 * Tier-1 comparison templates (SPEC §5). Reads are open to Editor and Admin (an Editor picks one
 * for an indicator); every write and the live preview are Admin-only.
 *
 * Nothing here returns a server sentence, status, code or key for display: the API's 400/422 text
 * quotes placeholder syntax ("{trend}"), which the Admin UI deliberately never shows, so failures
 * are reported through `describeTemplateFailure` (approved wording only) and the structured
 * trend-keyword flow (`ack` outcome) instead.
 */

export interface ComparisonTemplate {
  id: string;
  slug: string;
  label: string;
  body: string;
  trendNaik: string;
  trendTurun: string;
  trendTetap: string;
  /** Number of indicators currently using the template; drives "Terpasang" and delete. */
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

/** The fields the form edits. The lookup key is generated, never part of the draft. */
export interface TemplateDraft {
  label: string;
  body: string;
  trendNaik: string;
  trendTurun: string;
  trendTetap: string;
}

/** One trend/superlative phrase the server found outside the sanctioned slot. */
export interface TrendWarning {
  /** Echoed back in `acknowledgedWarnings`; never displayed. */
  ackKey: string;
  phrase: string;
  /** The phrase with surrounding text; may still hold raw placeholder syntax. */
  excerpt: string;
}

export interface PreviewProblem {
  field: 'body' | 'trendNaik' | 'trendTurun' | 'trendTetap';
  message: string;
}

export interface PreviewSentence {
  title: string;
  trend: 'naik' | 'turun' | 'tetap';
  text: string | null;
  note: string | null;
}

export interface TemplatePreview {
  valid: boolean;
  problems: PreviewProblem[];
  previews: PreviewSentence[];
}

export const TREND_KEYWORD_ACK_REQUIRED = 'TREND_KEYWORD_ACK_REQUIRED';

export type SaveOutcome =
  | { ok: true; template: ComparisonTemplate }
  | { ok: false; kind: 'ack'; warnings: TrendWarning[] }
  | { ok: false; kind: 'stale'; message: string }
  | { ok: false; kind: 'error'; message: string };

export type DeleteOutcome =
  | { ok: true }
  | { ok: false; kind: 'in_use'; message: string }
  | { ok: false; kind: 'error'; message: string };

export const TEMPLATE_VALIDATION_FALLBACK =
  'Templat belum bisa disimpan. Periksa nama dan kalimatnya.';

/**
 * Approved wording for a failed template request. Plain Indonesian server sentences are kept
 * when free of placeholder syntax ("{...}") and hidden API tokens; validation failures without
 * field-level errors fall back to template-specific guidance.
 */
export function describeTemplateFailure(error: unknown, context: string, method?: string): string {
  const source =
    typeof error === 'object' && error !== null ? (error as Record<string, unknown>) : {};
  const serverMsg =
    typeof source['serverMessage'] === 'string'
      ? source['serverMessage']
      : typeof source['error'] === 'string'
        ? source['error']
        : undefined;

  // Placeholder syntax like "{trend}" or "{delta}" must never be surfaced to the user.
  const hasPlaceholder = typeof serverMsg === 'string' && /\{[^}]*\}/.test(serverMsg);
  const safeServerMsg = serverMsg && !hasPlaceholder ? serverMsg : undefined;

  const userMsg = toUserMessage(
    {
      status: source['status'],
      code: source['code'],
      method: source['method'],
      serverMessage: safeServerMsg,
      fieldErrors: source['fieldErrors'],
    },
    context,
    method,
  );

  const hasFieldErrors =
    userMsg.fieldErrors && Object.keys(userMsg.fieldErrors).length > 0;
  if (userMsg.kind === 'validation' && !hasFieldErrors) {
    if (userMsg.message.endsWith(USER_MESSAGES.validation)) {
      return userMsg.message.replace(USER_MESSAGES.validation, TEMPLATE_VALIDATION_FALLBACK);
    }
  }

  return userMsg.message;
}

export function inUseMessage(label: string, usageCount: number): string {
  const count = usageCount > 0 ? `${usageCount} indikator` : 'indikator lain';
  return `Templat "${label}" masih dipakai ${count}, jadi belum bisa dihapus. Lepaskan atau ganti templatnya dulu di setiap indikator tersebut, lalu coba hapus lagi.`;
}

function parseWarnings(body: unknown): TrendWarning[] {
  const raw =
    typeof body === 'object' && body !== null ? (body as { warnings?: unknown }).warnings : null;
  if (!Array.isArray(raw)) return [];
  const warnings: TrendWarning[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const { ackKey, phrase, excerpt } = item as Record<string, unknown>;
    if (typeof ackKey === 'string' && typeof phrase === 'string') {
      warnings.push({ ackKey, phrase, excerpt: typeof excerpt === 'string' ? excerpt : phrase });
    }
  }
  return warnings;
}

const MAX_SLUG_RETRIES = 3;

export interface FetchTemplatesOptions {
  force?: boolean;
  forSelector?: boolean;
}

export const useComparisonTemplatesStore = defineStore('comparisonTemplates', () => {
  const templates = ref<ComparisonTemplate[]>([]);
  const isLoading = ref(false);
  const isLoaded = ref(false);
  const error = ref<string | null>(null);
  const selectorError = ref<string | null>(null);

  let inFlight: Promise<void> | null = null;
  let inFlightForSelector = false;
  let inFlightForAdmin = false;

  /**
   * Replaces an existing template in place or appends a new one. The store keeps raw
   * state; views (such as AdminTemplatKalimatView) derive presentation order via
   * their own label-sorted computed property.
   */
  function replaceTemplate(updated: ComparisonTemplate): void {
    const index = templates.value.findIndex((item) => item.id === updated.id);
    if (index === -1) {
      templates.value = [...templates.value, updated];
      return;
    }
    const next = [...templates.value];
    next[index] = updated;
    templates.value = next;
  }

  function clearSelectorError(): void {
    selectorError.value = null;
  }

  async function fetchTemplates(
    options: boolean | FetchTemplatesOptions = false,
  ): Promise<void> {
    const force = typeof options === 'boolean' ? options : Boolean(options.force);
    const forSelector = typeof options === 'object' && Boolean(options.forSelector);

    if (isLoaded.value && !force) return;

    if (inFlight && force) {
      await inFlight;
    }

    if (forSelector) {
      selectorError.value = null;
      inFlightForSelector = true;
    } else {
      error.value = null;
      inFlightForAdmin = true;
    }

    if (inFlight) return inFlight;

    isLoading.value = true;

    inFlight = (async () => {
      try {
        const data = await apiRequestJson<{ templates?: ComparisonTemplate[] }>(
          '/api/comparison-templates',
        );
        templates.value = Array.isArray(data.templates) ? data.templates : [];
        isLoaded.value = true;
        error.value = null;
        selectorError.value = null;
      } catch (err) {
        // A failed refetch keeps the rows already on screen rather than blanking the list.
        const failureMessage = describeTemplateFailure(
          err,
          'memuat daftar templat kalimat',
          'GET',
        );
        if (inFlightForSelector) {
          selectorError.value = failureMessage;
        }
        if (inFlightForAdmin) {
          error.value = failureMessage;
        }
      } finally {
        isLoading.value = false;
        inFlight = null;
        inFlightForSelector = false;
        inFlightForAdmin = false;
      }
    })();

    return inFlight;
  }

  /**
   * Creates a template. The lookup key is derived from the name and made unique against the
   * keys already known; if another admin took it first (409) the list is refreshed and a new
   * suffix tried, so the Admin never meets a key-collision message.
   */
  async function createTemplate(
    draft: TemplateDraft,
    acknowledgedWarnings: readonly string[] = [],
  ): Promise<SaveOutcome> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= MAX_SLUG_RETRIES; attempt += 1) {
      const slug = uniqueSlug(
        draft.label,
        templates.value.map((item) => item.slug),
      );
      try {
        const data = await apiRequestJson<{ template: ComparisonTemplate }>(
          '/api/comparison-templates',
          {
            method: 'POST',
            body: JSON.stringify({
              slug,
              ...draft,
              ...(acknowledgedWarnings.length > 0
                ? { acknowledgedWarnings: [...acknowledgedWarnings] }
                : {}),
            }),
          },
        );
        replaceTemplate(data.template);
        return { ok: true, template: data.template };
      } catch (err) {
        lastError = err;
        if (
          err instanceof ApiError &&
          err.status === 409 &&
          err.code === 'SLUG_TAKEN' &&
          attempt < MAX_SLUG_RETRIES
        ) {
          await fetchTemplates(true);
          continue;
        }
        return failureToOutcome(err, 'menyimpan templat kalimat');
      }
    }
    return failureToOutcome(lastError, 'menyimpan templat kalimat');
  }

  async function updateTemplate(
    id: string,
    draft: TemplateDraft,
    acknowledgedWarnings: readonly string[] = [],
    expectedUpdatedAt?: string,
  ): Promise<SaveOutcome> {
    try {
      const data = await apiRequestJson<{ template: ComparisonTemplate }>(
        `/api/comparison-templates/${encodeURIComponent(id)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            ...draft,
            ...(expectedUpdatedAt !== undefined ? { expectedUpdatedAt } : {}),
            ...(acknowledgedWarnings.length > 0
              ? { acknowledgedWarnings: [...acknowledgedWarnings] }
              : {}),
          }),
        },
      );
      replaceTemplate(data.template);
      return { ok: true, template: data.template };
    } catch (err) {
      return failureToOutcome(err, 'menyimpan templat kalimat');
    }
  }

  function failureToOutcome(err: unknown, context: string): SaveOutcome {
    if (err instanceof ApiError && err.status === 422 && err.code === TREND_KEYWORD_ACK_REQUIRED) {
      const warnings = parseWarnings(err.body);
      if (warnings.length > 0) return { ok: false, kind: 'ack', warnings };
    }
    if (err instanceof ApiError && err.status === 409 && err.code === 'STALE_WRITE') {
      return { ok: false, kind: 'stale', message: USER_MESSAGES.stale };
    }
    return { ok: false, kind: 'error', message: describeTemplateFailure(err, context) };
  }

  async function deleteTemplate(template: ComparisonTemplate): Promise<DeleteOutcome> {
    try {
      await apiRequestJson(`/api/comparison-templates/${encodeURIComponent(template.id)}`, {
        method: 'DELETE',
      });
      templates.value = templates.value.filter((item) => item.id !== template.id);
      return { ok: true };
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // The count on screen may be stale; refresh it so the message and badge stay honest.
        await fetchTemplates(true);
        const fresh = templates.value.find((item) => item.id === template.id);
        if (err.code === 'TEMPLATE_IN_USE' || (fresh?.usageCount ?? 0) > 0) {
          return {
            ok: false,
            kind: 'in_use',
            message: inUseMessage(template.label, fresh?.usageCount ?? template.usageCount),
          };
        }
      }
      return {
        ok: false,
        kind: 'error',
        message: describeTemplateFailure(err, 'menghapus templat kalimat'),
      };
    }
  }

  /**
   * Renders a draft through the server's own renderer. Throws on failure so the caller can keep
   * the last good preview; `signal` lets a newer keystroke cancel the request it supersedes.
   */
  async function previewTemplate(
    draft: Omit<TemplateDraft, 'label'>,
    signal?: AbortSignal,
  ): Promise<TemplatePreview> {
    return apiRequestJson<TemplatePreview>('/api/comparison-templates/preview', {
      method: 'POST',
      body: JSON.stringify(draft),
      ...(signal ? { signal } : {}),
    });
  }

  return {
    templates,
    isLoading,
    isLoaded,
    error,
    selectorError,
    fetchTemplates,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    previewTemplate,
    clearSelectorError,
  };
});
