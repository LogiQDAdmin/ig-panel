import { useCallback, useEffect, useState } from 'react';
import { api, fecha, STATUS_INFO, type LeadRow, type LeadStatus, type Message } from '../api';

interface Props {
  notify: (msg: string) => void;
}

interface Estado {
  leads: Record<LeadStatus, number>;
  palabras_activas: number;
}

const tono = (s: LeadStatus) =>
  s === 'cualificado' ? 'ok' : s === 'humano' || s === 'limite' ? 'warn' : s === 'error' ? 'bad' : '';

const ORDEN: LeadStatus[] = ['cualificado', 'humano', 'conversando', 'nuevo', 'limite', 'descartado', 'error'];

export const Leads = ({ notify }: Props) => {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [filtro, setFiltro] = useState<LeadStatus | ''>('');
  const [q, setQ] = useState('');
  const [items, setItems] = useState<LeadRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<number | null>(null);

  const load = useCallback(() => {
    const params = new URLSearchParams({ estado: filtro, q });
    api.get<{ items: LeadRow[] }>(`/api/leads?${params}`).then((r) => setItems(r.items), (e) => setError(e.message));
    api.get<Estado>('/api/estado').then(setEstado, () => undefined);
  }, [filtro, q]);

  useEffect(() => {
    const t = window.setTimeout(load, q ? 300 : 0);
    return () => window.clearTimeout(t);
  }, [load, q]);

  const total = estado ? Object.values(estado.leads).reduce((a, b) => a + b, 0) : 0;

  return (
    <>
      <h1>Leads</h1>
      <p className="lead-text">Personas que comentaron una palabra clave. Abre uno para ver la conversación.</p>

      {estado && (
        <div className="stats">
          <div className="card stat">
            <b>{total}</b>
            <span>leads en total</span>
          </div>
          <div className="card stat">
            <b>{estado.leads.cualificado}</b>
            <span>cualificados</span>
          </div>
          <div className="card stat">
            <b>{estado.leads.humano}</b>
            <span>esperan a una persona</span>
          </div>
          <div className="card stat">
            <b>{estado.leads.conversando + estado.leads.nuevo}</b>
            <span>con el bot o sin contestar</span>
          </div>
        </div>
      )}

      <div className="row" style={{ marginBottom: 12 }}>
        <div className="chips" role="group" aria-label="Filtrar por estado">
          <button className="chip" aria-pressed={filtro === ''} onClick={() => setFiltro('')}>
            Todos
          </button>
          {ORDEN.map((s) => (
            <button key={s} className="chip" aria-pressed={filtro === s} onClick={() => setFiltro(s)} title={STATUS_INFO[s].help}>
              {STATUS_INFO[s].label}
              {estado ? ` · ${estado.leads[s]}` : ''}
            </button>
          ))}
        </div>
        <div className="spacer" />
        <input
          type="search"
          placeholder="Buscar usuario, negocio o teléfono"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ maxWidth: 280 }}
          aria-label="Buscar"
        />
      </div>

      {error && <p className="notice bad">{error}</p>}
      {items === null && !error && <p className="muted">Cargando…</p>}
      {items?.length === 0 && <div className="card empty">No hay leads con este filtro.</div>}

      <div className="leads">
        {items?.map((l) => (
          <button key={l.id} className="lead-row" onClick={() => setAbierto(l.id)}>
            <div>
              <strong>{l.ig_username ? `@${l.ig_username}` : 'Usuario sin nombre'}</strong>
              <div className="muted small">
                {l.keyword ?? '—'} · {fecha(l.updated_at)}
              </div>
            </div>
            <div className="hide-sm">
              {l.business_name ?? <span className="muted">Sin negocio aún</span>}
              <div className="muted small">{[l.sector, l.zona].filter(Boolean).join(', ') || '—'}</div>
            </div>
            <div className="hide-sm small">
              {l.telefono ?? <span className="muted">Sin teléfono</span>}
              {l.hq_synced_at && <div className="muted">En HQ</div>}
            </div>
            <span className={`badge ${tono(l.status)}`}>{STATUS_INFO[l.status].label}</span>
          </button>
        ))}
      </div>

      {abierto !== null && (
        <Detalle
          id={abierto}
          notify={notify}
          onClose={() => setAbierto(null)}
          onChanged={load}
        />
      )}
    </>
  );
};

interface LeadFull extends LeadRow {
  comment_text: string | null;
  last_error: string | null;
  dm_sent_at: string | null;
}

const Detalle = ({ id, notify, onClose, onChanged }: { id: number; notify: (m: string) => void; onClose: () => void; onChanged: () => void }) => {
  const [data, setData] = useState<{ lead: LeadFull; mensajes: Message[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.get<{ lead: LeadFull; mensajes: Message[] }>(`/api/leads/${id}`).then(setData, (e) => setError(e.message));
  }, [id]);
  useEffect(load, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const cambiar = async (status: LeadStatus, msg: string) => {
    setBusy(true);
    try {
      await api.patch(`/api/leads/${id}`, { status });
      notify(msg);
      load();
      onChanged();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const aHq = async () => {
    setBusy(true);
    try {
      await api.post(`/api/leads/${id}/hq`);
      notify('Enviado a HQ: lo verás en Solicitudes');
      load();
      onChanged();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const l = data?.lead;
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Lead" onClick={(e) => e.stopPropagation()}>
        <div className="row">
          <h2>{l ? (l.ig_username ? `@${l.ig_username}` : 'Usuario sin nombre') : 'Lead'}</h2>
          {l && <span className={`badge ${tono(l.status)}`}>{STATUS_INFO[l.status].label}</span>}
          <div className="spacer" />
          <button className="btn small" onClick={onClose}>
            Cerrar
          </button>
        </div>
        {error && <p className="notice bad">{error}</p>}
        {!l && !error && <p className="muted">Cargando…</p>}
        {l && (
          <>
            <p className="muted small" style={{ margin: 0 }}>
              {STATUS_INFO[l.status].help}
            </p>
            <div className="card">
              <dl className="facts">
                <dt>Negocio</dt>
                <dd>{l.business_name ?? '—'}</dd>
                <dt>Sector y zona</dt>
                <dd>{[l.sector, l.zona].filter(Boolean).join(', ') || '—'}</dd>
                <dt>Web actual</dt>
                <dd>{l.web ?? '—'}</dd>
                <dt>Le interesa</dt>
                <dd>{l.interes ?? '—'}</dd>
                <dt>Teléfono</dt>
                <dd>{l.telefono ? <a href={`https://wa.me/${l.telefono.replace(/\D/g, '').replace(/^(?=[6-9]\d{8}$)/, '34')}`} target="_blank" rel="noreferrer">{l.telefono}</a> : '—'}</dd>
                <dt>Palabra</dt>
                <dd>{l.keyword ?? '—'}</dd>
                <dt>Comentó</dt>
                <dd>{l.comment_text ? `«${l.comment_text}»` : '—'}</dd>
                <dt>Perfil</dt>
                <dd>
                  {l.ig_username ? (
                    <a href={`https://instagram.com/${l.ig_username}`} target="_blank" rel="noreferrer">
                      instagram.com/{l.ig_username}
                    </a>
                  ) : '—'}
                </dd>
                <dt>HQ</dt>
                <dd>{l.hq_synced_at ? `Enviado el ${fecha(l.hq_synced_at)}` : 'Sin enviar'}</dd>
              </dl>
              {l.last_error && <p className="notice bad small">Último error: {l.last_error}</p>}
            </div>

            <div className="row">
              {l.status !== 'humano' && (
                <button className="btn" disabled={busy} onClick={() => cambiar('humano', 'Hecho: el bot ya no le contesta')}>
                  Lo llevo yo
                </button>
              )}
              {['humano', 'limite', 'descartado'].includes(l.status) && (
                <button className="btn" disabled={busy} onClick={() => cambiar('conversando', 'El bot vuelve a contestarle')}>
                  Devolver al bot
                </button>
              )}
              {l.status !== 'cualificado' && (
                <button className="btn" disabled={busy} onClick={() => cambiar('cualificado', 'Marcado como cualificado')}>
                  Marcar cualificado
                </button>
              )}
              {l.status !== 'descartado' && (
                <button className="btn danger" disabled={busy} onClick={() => cambiar('descartado', 'Lead descartado')}>
                  Descartar
                </button>
              )}
              <div className="spacer" />
              <button className="btn primary" disabled={busy} onClick={aHq}>
                {l.hq_synced_at ? 'Enviar otra vez a HQ' : 'Enviar a HQ'}
              </button>
            </div>

            <h3 style={{ margin: '8px 0 0' }}>Conversación</h3>
            <div className="chat">
              {data.mensajes.length === 0 && <p className="muted">Sin mensajes.</p>}
              {data.mensajes.map((m) => (
                <div key={m.id} className={`bubble ${m.role}`}>
                  {m.text}
                  <small>
                    {m.role === 'user' ? 'Usuario' : m.role === 'human' ? 'Equipo' : 'Bot'} · {fecha(m.sent_at)}
                  </small>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
