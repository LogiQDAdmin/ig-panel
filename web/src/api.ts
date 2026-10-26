// Llamadas al servidor del panel. Los cambios llevan la cabecera X-IG-Panel (protección CSRF).

export class ApiError extends Error {}

const request = async <T>(method: string, url: string, body?: unknown): Promise<T> => {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? { 'X-IG-Panel': '1' } : { 'Content-Type': 'application/json', 'X-IG-Panel': '1' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError((data as { error?: string }).error ?? `Error ${res.status}`);
  return data as T;
};

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body?: unknown) => request<T>('POST', url, body ?? {}),
  put: <T>(url: string, body: unknown) => request<T>('PUT', url, body),
  patch: <T>(url: string, body: unknown) => request<T>('PATCH', url, body),
  del: <T>(url: string) => request<T>('DELETE', url),
};

export type LeadStatus = 'nuevo' | 'conversando' | 'cualificado' | 'humano' | 'limite' | 'descartado' | 'error';

export const STATUS_INFO: Record<LeadStatus, { label: string; help: string }> = {
  nuevo: { label: 'Nuevo', help: 'Ha recibido el DM y aún no ha contestado.' },
  conversando: { label: 'Hablando con el bot', help: 'El bot le está haciendo preguntas.' },
  cualificado: { label: 'Cualificado', help: 'Ya tenemos sus datos y su teléfono.' },
  humano: { label: 'Lo lleva una persona', help: 'El bot no contesta: le escribe alguien del equipo.' },
  limite: { label: 'Límite de IA', help: 'Ha llegado al máximo de respuestas de la IA.' },
  descartado: { label: 'Descartado', help: 'No interesa. El bot no contesta.' },
  error: { label: 'Error', help: 'No se pudo enviar el DM inicial.' },
};

export interface Keyword {
  id: number;
  keyword: string;
  media_id: string | null;
  media_label: string | null;
  media_permalink: string | null;
  dm_message: string;
  public_replies: string[];
  active: boolean;
  leads: number;
}

export interface Reel {
  id: string;
  caption: string;
  media_type: string;
  media_product_type: string;
  permalink: string;
  thumbnail: string | null;
  timestamp: string;
}

export interface LeadRow {
  id: number;
  ig_username: string | null;
  keyword: string | null;
  status: LeadStatus;
  business_name: string | null;
  sector: string | null;
  zona: string | null;
  interes: string | null;
  telefono: string | null;
  web: string | null;
  created_at: string;
  updated_at: string;
  last_user_msg_at: string | null;
  qualified_at: string | null;
  hq_synced_at: string | null;
  mensajes: number;
}

export interface Message {
  id: number;
  role: 'user' | 'assistant' | 'human' | 'system';
  text: string | null;
  sent_at: string;
}

export const fecha = (iso: string | null | undefined, conHora = true) =>
  iso
    ? new Date(iso).toLocaleString('es-ES', conHora
        ? { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }
        : { day: 'numeric', month: 'long', year: 'numeric' })
    : '—';

export const bytes = (s: string) => new TextEncoder().encode(s).length;
