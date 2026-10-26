import { settings } from './db.js';

export interface Reel {
  id: string;
  caption: string;
  media_type: string;
  media_product_type: string;
  permalink: string;
  thumbnail: string | null;
  timestamp: string;
}

let cache: { at: number; items: Reel[] } | null = null;
const CACHE_MS = 5 * 60 * 1000;

/**
 * Últimas publicaciones de la cuenta, para elegir el vídeo de cada palabra clave.
 * El token se lee de la base de datos y va en la cabecera: nunca llega al navegador.
 */
export const listReels = async (force = false): Promise<Reel[]> => {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.items;
  const s = await settings(['access_token', 'graph_version']);
  if (!s.access_token) throw new Error('No hay token de Instagram guardado.');
  const fields = 'id,caption,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp';
  const url = `https://graph.instagram.com/${s.graph_version || 'v26.0'}/me/media?fields=${fields}&limit=40`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${s.access_token}`, 'Accept-Language': 'es-ES' },
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json()) as { data?: Record<string, string>[]; error?: { message?: string } };
  if (!res.ok || !body.data) throw new Error(`Instagram: ${body.error?.message ?? res.status}`);
  const items = body.data.map((m) => ({
    id: m.id,
    caption: (m.caption ?? '').slice(0, 300),
    media_type: m.media_type ?? '',
    media_product_type: m.media_product_type ?? '',
    permalink: m.permalink ?? '',
    thumbnail: m.thumbnail_url ?? (m.media_type === 'IMAGE' ? m.media_url ?? null : null),
    timestamp: m.timestamp ?? '',
  }));
  cache = { at: Date.now(), items };
  return items;
};
