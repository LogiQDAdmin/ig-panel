import { query, settings } from './db.js';
import { sendToHq, type LeadForHq } from './hq.js';
import { listReels } from './instagram.js';
import { EDITABLE_SETTINGS, LEAD_STATUSES, validateKeyword, validateSettings, validateStatus } from './validate.js';

export interface Ctx {
  method: string;
  params: Record<string, string>;
  query: URLSearchParams;
  body: unknown;
}
export interface Reply {
  status?: number;
  body: unknown;
}
export type Handler = (ctx: Ctx) => Promise<Reply>;

export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

const HQ_URL = process.env.HQ_URL || 'https://admin.logiqd.me';
const idParam = (ctx: Ctx): number => {
  const id = Number(ctx.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(404, 'No existe.');
  return id;
};
const pgUniqueViolation = (e: unknown) => (e as { code?: string })?.code === '23505';

// ---------- Resumen ----------

const estado: Handler = async () => {
  const counts = await query<{ status: string; n: number }>(
    'SELECT status, count(*)::int AS n FROM ig_leads GROUP BY status',
  );
  const s = await settings(['token_expires_at', 'token_refreshed_at', 'ig_username', 'hq_form_key']);
  const [{ activas }] = await query<{ activas: number }>('SELECT count(*)::int AS activas FROM ig_keywords WHERE active');
  return {
    body: {
      cuenta: s.ig_username ?? '',
      leads: Object.fromEntries(LEAD_STATUSES.map((st) => [st, counts.find((c) => c.status === st)?.n ?? 0])),
      palabras_activas: activas,
      token_caduca: s.token_expires_at ?? null,
      token_renovado: s.token_refreshed_at ?? null,
      hq_configurado: Boolean(s.hq_form_key),
    },
  };
};

// ---------- Vídeos y palabras clave ----------

const reels: Handler = async (ctx) => {
  try {
    return { body: { items: await listReels(ctx.query.get('recargar') === '1') } };
  } catch (e) {
    throw new HttpError(502, `No he podido leer los vídeos de Instagram. ${(e as Error).message}`);
  }
};

const KEYWORD_COLUMNS = `id, keyword, media_id, media_label, media_permalink, dm_message, public_replies, active, created_at, updated_at,
  (SELECT count(*)::int FROM ig_leads l WHERE l.keyword_id = k.id) AS leads`;

const listKeywords: Handler = async () => ({
  body: { items: await query(`SELECT ${KEYWORD_COLUMNS} FROM ig_keywords k ORDER BY active DESC, (media_id IS NULL), id`) },
});

const createKeyword: Handler = async (ctx) => {
  const v = validateKeyword(ctx.body);
  if (!v.ok) throw new HttpError(400, v.error);
  const k = v.value;
  try {
    const [row] = await query(
      `INSERT INTO ig_keywords (keyword, media_id, media_label, media_permalink, dm_message, public_replies, active)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [k.keyword, k.media_id, k.media_label, k.media_permalink, k.dm_message, k.public_replies, k.active],
    );
    return { status: 201, body: row };
  } catch (e) {
    if (pgUniqueViolation(e)) throw new HttpError(409, 'Ya existe esa palabra clave para ese vídeo.');
    throw e;
  }
};

const updateKeyword: Handler = async (ctx) => {
  const id = idParam(ctx);
  const v = validateKeyword(ctx.body);
  if (!v.ok) throw new HttpError(400, v.error);
  const k = v.value;
  try {
    const rows = await query(
      `UPDATE ig_keywords SET keyword = $2, media_id = $3, media_label = $4, media_permalink = $5,
              dm_message = $6, public_replies = $7, active = $8
       WHERE id = $1 RETURNING id`,
      [id, k.keyword, k.media_id, k.media_label, k.media_permalink, k.dm_message, k.public_replies, k.active],
    );
    if (!rows.length) throw new HttpError(404, 'Esa palabra clave ya no existe.');
    return { body: rows[0] };
  } catch (e) {
    if (pgUniqueViolation(e)) throw new HttpError(409, 'Ya existe esa palabra clave para ese vídeo.');
    throw e;
  }
};

const deleteKeyword: Handler = async (ctx) => {
  const rows = await query('DELETE FROM ig_keywords WHERE id = $1 RETURNING id', [idParam(ctx)]);
  if (!rows.length) throw new HttpError(404, 'Esa palabra clave ya no existe.');
  return { body: { ok: true } };
};

// ---------- Leads ----------

const listLeads: Handler = async (ctx) => {
  const status = ctx.query.get('estado') ?? '';
  const q = (ctx.query.get('q') ?? '').trim();
  const items = await query(
    `SELECT id, ig_username, keyword, status, business_name, sector, zona, interes, telefono, web,
            created_at, updated_at, last_user_msg_at, qualified_at, hq_synced_at,
            (SELECT count(*)::int FROM ig_messages m WHERE m.lead_id = l.id) AS mensajes
     FROM ig_leads l
     WHERE ($1 = '' OR status = $1)
       AND ($2 = '' OR ig_username ILIKE '%' || $2 || '%' OR business_name ILIKE '%' || $2 || '%'
                    OR telefono ILIKE '%' || $2 || '%')
     ORDER BY updated_at DESC
     LIMIT 300`,
    [status, q],
  );
  return { body: { items } };
};

const getLead: Handler = async (ctx) => {
  const id = idParam(ctx);
  const [lead] = await query('SELECT * FROM ig_leads WHERE id = $1', [id]);
  if (!lead) throw new HttpError(404, 'Ese lead ya no existe.');
  const mensajes = await query(
    'SELECT id, role, text, sent_at FROM ig_messages WHERE lead_id = $1 ORDER BY sent_at, id',
    [id],
  );
  return { body: { lead, mensajes } };
};

const setLeadStatus: Handler = async (ctx) => {
  const v = validateStatus(ctx.body);
  if (!v.ok) throw new HttpError(400, v.error);
  const rows = await query(
    `UPDATE ig_leads SET status = $2,
            qualified_at = CASE WHEN $2 = 'cualificado' AND qualified_at IS NULL THEN now() ELSE qualified_at END
     WHERE id = $1 RETURNING id, status`,
    [idParam(ctx), v.value],
  );
  if (!rows.length) throw new HttpError(404, 'Ese lead ya no existe.');
  return { body: rows[0] };
};

const leadToHq: Handler = async (ctx) => {
  const id = idParam(ctx);
  const { hq_form_key: formKey } = await settings(['hq_form_key']);
  if (!formKey) throw new HttpError(400, 'Falta el formulario de HQ: ponlo en Ajustes.');
  const [lead] = await query<LeadForHq & { hq_synced_at: string | null }>('SELECT * FROM ig_leads WHERE id = $1', [id]);
  if (!lead) throw new HttpError(404, 'Ese lead ya no existe.');
  let hqId: string;
  try {
    hqId = await sendToHq(HQ_URL, formKey, lead);
  } catch (e) {
    throw new HttpError(502, `HQ no lo ha aceptado: ${(e as Error).message}`);
  }
  const [row] = await query('UPDATE ig_leads SET hq_synced_at = now() WHERE id = $1 RETURNING hq_synced_at', [id]);
  return { body: { ok: true, hq_id: hqId, hq_synced_at: (row as { hq_synced_at: string }).hq_synced_at } };
};

// ---------- Ajustes ----------

const getSettings: Handler = async () => {
  const keys = [...Object.keys(EDITABLE_SETTINGS), 'token_expires_at', 'token_refreshed_at', 'ig_username'];
  const s = await settings(keys);
  return {
    body: {
      editables: Object.fromEntries(Object.keys(EDITABLE_SETTINGS).map((k) => [k, s[k] ?? ''])),
      cuenta: s.ig_username ?? '',
      token_caduca: s.token_expires_at ?? null,
      token_renovado: s.token_refreshed_at ?? null,
    },
  };
};

const putSettings: Handler = async (ctx) => {
  const v = validateSettings(ctx.body);
  if (!v.ok) throw new HttpError(400, v.error);
  for (const [key, value] of Object.entries(v.value)) {
    await query(
      'INSERT INTO ig_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
      [key, value],
    );
  }
  return getSettings(ctx);
};

export const routes: [string, string, Handler][] = [
  ['GET', '/api/estado', estado],
  ['GET', '/api/reels', reels],
  ['GET', '/api/palabras', listKeywords],
  ['POST', '/api/palabras', createKeyword],
  ['PUT', '/api/palabras/:id', updateKeyword],
  ['DELETE', '/api/palabras/:id', deleteKeyword],
  ['GET', '/api/leads', listLeads],
  ['GET', '/api/leads/:id', getLead],
  ['PATCH', '/api/leads/:id', setLeadStatus],
  ['POST', '/api/leads/:id/hq', leadToHq],
  ['GET', '/api/ajustes', getSettings],
  ['PUT', '/api/ajustes', putSettings],
];
