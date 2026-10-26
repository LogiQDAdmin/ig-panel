// Validación de lo que llega del navegador. Devuelve el valor limpio o un error en español.

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export const LEAD_STATUSES = ['nuevo', 'conversando', 'cualificado', 'humano', 'limite', 'descartado', 'error'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const AI_MODELS = ['claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-opus-5-5'] as const;
export const AI_EFFORTS = ['low', 'medium', 'high'] as const;

export interface KeywordInput {
  keyword: string;
  media_id: string | null;
  media_label: string | null;
  media_permalink: string | null;
  dm_message: string;
  public_replies: string[];
  active: boolean;
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const optStr = (v: unknown, max: number): string | null => {
  const s = str(v);
  return s ? s.slice(0, max) : null;
};

export const validateKeyword = (body: unknown): Result<KeywordInput> => {
  const b = (body ?? {}) as Record<string, unknown>;
  const keyword = str(b.keyword);
  if (!keyword) return { ok: false, error: 'Escribe la palabra clave.' };
  if (keyword.length > 60) return { ok: false, error: 'La palabra clave es demasiado larga (máximo 60 caracteres).' };

  const media_id = optStr(b.media_id, 64);
  if (media_id && !/^[0-9A-Za-z_]+$/.test(media_id)) return { ok: false, error: 'El vídeo elegido no es válido.' };

  const dm_message = str(b.dm_message);
  if (!dm_message) return { ok: false, error: 'Escribe el mensaje privado (DM).' };
  if (Buffer.byteLength(dm_message, 'utf8') > 1000) {
    return { ok: false, error: 'El DM es demasiado largo: Instagram admite hasta 1000 bytes (unos 900 caracteres).' };
  }

  const rawReplies = Array.isArray(b.public_replies) ? b.public_replies : [];
  const public_replies = rawReplies.map(str).filter(Boolean);
  if (public_replies.length === 0) return { ok: false, error: 'Añade al menos una respuesta pública.' };
  if (public_replies.length > 15) return { ok: false, error: 'Como mucho 15 respuestas públicas.' };
  if (public_replies.some((r) => r.length > 300)) return { ok: false, error: 'Cada respuesta pública puede tener hasta 300 caracteres.' };

  return {
    ok: true,
    value: {
      keyword,
      media_id,
      media_label: media_id ? optStr(b.media_label, 120) : 'Todos los reels',
      media_permalink: media_id ? optStr(b.media_permalink, 500) : null,
      dm_message,
      public_replies,
      active: b.active === undefined ? true : Boolean(b.active),
    },
  };
};

export const validateStatus = (body: unknown): Result<LeadStatus> => {
  const s = str((body as Record<string, unknown> | null)?.status);
  return (LEAD_STATUSES as readonly string[]).includes(s)
    ? { ok: true, value: s as LeadStatus }
    : { ok: false, error: 'Estado no válido.' };
};

// Ajustes que se pueden cambiar desde el panel (el token y los ids de la cuenta no).
const intIn = (min: number, max: number) => (v: string) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? null : `Debe ser un número entre ${min} y ${max}.`;
};
export const EDITABLE_SETTINGS: Record<string, { label: string; check: (v: string) => string | null }> = {
  ai_model: { label: 'Modelo de IA', check: (v) => ((AI_MODELS as readonly string[]).includes(v) ? null : 'Modelo no válido.') },
  ai_effort: { label: 'Esfuerzo de la IA', check: (v) => ((AI_EFFORTS as readonly string[]).includes(v) ? null : 'Valor no válido.') },
  ai_max_per_day: { label: 'Respuestas de IA por conversación y día', check: intIn(1, 100) },
  ai_max_per_conversation: { label: 'Respuestas de IA por conversación en total', check: intIn(1, 500) },
  repeat_window_days: { label: 'Días sin repetir el DM al mismo usuario', check: intIn(0, 365) },
  hq_form_key: {
    label: 'Formulario de HQ',
    check: (v) => (v === '' || /^[a-z0-9][a-z0-9_-]{0,59}$/.test(v) ? null : 'Solo minúsculas, números, guiones y guiones bajos.'),
  },
};

export const validateSettings = (body: unknown): Result<Record<string, string>> => {
  const b = (body ?? {}) as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(b)) {
    const rule = EDITABLE_SETTINGS[key];
    if (!rule) return { ok: false, error: `El ajuste «${key}» no se puede cambiar desde aquí.` };
    const value = String(raw ?? '').trim();
    const error = rule.check(value);
    if (error) return { ok: false, error: `${rule.label}: ${error}` };
    out[key] = value;
  }
  if (Object.keys(out).length === 0) return { ok: false, error: 'No hay cambios.' };
  return { ok: true, value: out };
};
