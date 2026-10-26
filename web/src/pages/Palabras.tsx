import { useCallback, useEffect, useState } from 'react';
import { api, bytes, fecha, type Keyword, type Reel } from '../api';

interface Props {
  notify: (msg: string) => void;
}

interface Draft {
  id: number | null;
  keyword: string;
  media_id: string | null;
  media_label: string | null;
  media_permalink: string | null;
  dm_message: string;
  public_replies: string[];
  active: boolean;
}

const RESPUESTAS_POR_DEFECTO = [
  '¡Te lo paso por DM! 📩',
  '¡Hecho! Mira tus mensajes 📬',
  '¡Te escribo por privado! 😉',
];

const nuevo = (): Draft => ({
  id: null,
  keyword: '',
  media_id: null,
  media_label: null,
  media_permalink: null,
  dm_message: '',
  public_replies: [...RESPUESTAS_POR_DEFECTO],
  active: true,
});

const tituloReel = (r: Reel) => (r.caption.split('\n')[0] || 'Sin texto').slice(0, 60);

export const Palabras = ({ notify }: Props) => {
  const [items, setItems] = useState<Keyword[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  // Miniaturas de los vídeos: las URLs de Instagram caducan, así que no se guardan y se piden al cargar.
  const [miniaturas, setMiniaturas] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    api.get<{ items: Keyword[] }>('/api/palabras').then((r) => setItems(r.items), (e) => setError(e.message));
  }, []);
  useEffect(load, [load]);
  useEffect(() => {
    api.get<{ items: Reel[] }>('/api/reels').then(
      (r) => setMiniaturas(Object.fromEntries(r.items.filter((x) => x.thumbnail).map((x) => [x.id, x.thumbnail!]))),
      () => undefined,
    );
  }, []);

  const toggle = async (k: Keyword) => {
    try {
      await api.put(`/api/palabras/${k.id}`, { ...k, active: !k.active });
      notify(k.active ? `«${k.keyword}» desactivada` : `«${k.keyword}» activada`);
      load();
    } catch (e) {
      notify((e as Error).message);
    }
  };

  return (
    <>
      <div className="row">
        <div>
          <h1>Vídeos y palabras clave</h1>
          <p className="lead-text">
            Si alguien comenta la palabra en el vídeo, le respondemos en público y le mandamos este DM.
          </p>
        </div>
        <div className="spacer" />
        <button className="btn primary" onClick={() => setDraft(nuevo())}>
          + Nueva palabra
        </button>
      </div>

      {error && <p className="notice bad">{error}</p>}
      {items === null && !error && <p className="muted">Cargando…</p>}
      {items?.length === 0 && <div className="card empty">Todavía no hay palabras clave.</div>}

      <div className="grid kw">
        {items?.map((k) => (
          <article key={k.id} className={`card kw-card ${k.active ? '' : 'off'}`}>
            <div className="row">
              <span className="badge kw">{k.keyword}</span>
              {!k.active && <span className="badge">Desactivada</span>}
              <div className="spacer" />
              <span className="muted small">{k.leads} leads</span>
            </div>
            <div className="media">
              {k.media_id && miniaturas[k.media_id] ? (
                <img className="thumb" src={miniaturas[k.media_id]} alt="" loading="lazy" />
              ) : (
                <div className="thumb" aria-hidden>
                  {k.media_id ? '🎬' : '📱'}
                </div>
              )}
              <div>
                <div>{k.media_id ? k.media_label || 'Vídeo concreto' : 'Todos los vídeos'}</div>
                {k.media_permalink && (
                  <a href={k.media_permalink} target="_blank" rel="noreferrer" className="small">
                    Ver en Instagram
                  </a>
                )}
              </div>
            </div>
            <div className="dm">{k.dm_message}</div>
            <div className="muted small">{k.public_replies.length} respuestas públicas al azar</div>
            <div className="row">
              <button className="btn small" onClick={() => setDraft({ ...k })}>
                Editar
              </button>
              <button className="btn small" onClick={() => toggle(k)}>
                {k.active ? 'Desactivar' : 'Activar'}
              </button>
            </div>
          </article>
        ))}
      </div>

      {draft && (
        <Editor
          draft={draft}
          onClose={() => setDraft(null)}
          onSaved={(msg) => {
            setDraft(null);
            notify(msg);
            load();
          }}
        />
      )}
    </>
  );
};

const Editor = ({ draft: initial, onClose, onSaved }: { draft: Draft; onClose: () => void; onSaved: (msg: string) => void }) => {
  const [d, setD] = useState<Draft>(initial);
  const [reels, setReels] = useState<Reel[] | null>(null);
  const [reelsError, setReelsError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<Draft>) => setD((prev) => ({ ...prev, ...patch }));

  const loadReels = useCallback((recargar = false) => {
    setReelsError(null);
    api.get<{ items: Reel[] }>(`/api/reels${recargar ? '?recargar=1' : ''}`).then(
      (r) => setReels(r.items),
      (e) => setReelsError(e.message),
    );
  }, []);
  useEffect(() => loadReels(), [loadReels]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const dmBytes = bytes(d.dm_message);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const body = { ...d, public_replies: d.public_replies.map((r) => r.trim()).filter(Boolean) };
      if (d.id === null) await api.post('/api/palabras', body);
      else await api.put(`/api/palabras/${d.id}`, body);
      onSaved(`«${d.keyword.trim()}» guardada`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (d.id === null || !window.confirm(`¿Borrar la palabra «${d.keyword}»? Los leads que ya trajo se quedan.`)) return;
    try {
      await api.del(`/api/palabras/${d.id}`);
      onSaved(`«${d.keyword}» borrada`);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Palabra clave" onClick={(e) => e.stopPropagation()}>
        <div className="row">
          <h2>{d.id === null ? 'Nueva palabra clave' : `Editar «${initial.keyword}»`}</h2>
          <div className="spacer" />
          <button className="btn small" onClick={onClose}>
            Cerrar
          </button>
        </div>

        <label className="field">
          Palabra clave
          <span className="hint">Da igual mayúsculas, tildes o emojis: «Wéb 🔥» cuenta como WEB.</span>
          <input type="text" value={d.keyword} maxLength={60} onChange={(e) => set({ keyword: e.target.value })} placeholder="WEB" />
        </label>

        <div className="field">
          <div className="row">
            <strong>Vídeo</strong>
            <div className="spacer" />
            <button className="btn small" onClick={() => loadReels(true)}>
              Recargar vídeos
            </button>
          </div>
          <span className="hint muted small">Elige un vídeo o deja «Todos» para que valga en cualquier publicación.</span>
          {reelsError && <p className="notice warn small">{reelsError}</p>}
          <div className="reels">
            <button
              className="reel all"
              aria-pressed={d.media_id === null}
              onClick={() => set({ media_id: null, media_label: null, media_permalink: null })}
            >
              <div className="ph">Todos los vídeos</div>
              <span>Cualquier publicación</span>
            </button>
            {reels === null && !reelsError && <span className="muted small">Cargando vídeos…</span>}
            {reels?.map((r) => (
              <button
                key={r.id}
                className="reel"
                aria-pressed={d.media_id === r.id}
                title={r.caption}
                onClick={() => set({ media_id: r.id, media_label: tituloReel(r), media_permalink: r.permalink })}
              >
                {r.thumbnail ? <img src={r.thumbnail} alt="" loading="lazy" /> : <div className="ph">🎬</div>}
                <span>{new Date(r.timestamp).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</span>
              </button>
            ))}
          </div>
          {d.media_id && (
            <label className="field">
              Nombre del vídeo en el panel
              <input type="text" value={d.media_label ?? ''} maxLength={120} onChange={(e) => set({ media_label: e.target.value })} />
            </label>
          )}
        </div>

        <label className="field">
          Mensaje privado (DM)
          <span className="hint">Un solo mensaje. Mejor si acaba en pregunta, para que conteste.</span>
          <textarea value={d.dm_message} onChange={(e) => set({ dm_message: e.target.value })} rows={4} />
          <span className={`counter ${dmBytes > 1000 ? 'bad' : ''}`}>{dmBytes} / 1000 bytes</span>
        </label>

        <div className="field">
          <strong>Respuestas públicas</strong>
          <span className="hint muted small">Se elige una al azar en cada comentario, para no parecer spam.</span>
          <div className="replies">
            {d.public_replies.map((r, i) => (
              <div className="row" key={i}>
                <input
                  type="text"
                  value={r}
                  maxLength={300}
                  style={{ flex: 1 }}
                  aria-label={`Respuesta ${i + 1}`}
                  onChange={(e) => set({ public_replies: d.public_replies.map((x, j) => (j === i ? e.target.value : x)) })}
                />
                <button
                  className="btn small"
                  aria-label={`Quitar respuesta ${i + 1}`}
                  onClick={() => set({ public_replies: d.public_replies.filter((_, j) => j !== i) })}
                >
                  ✕
                </button>
              </div>
            ))}
            <button className="btn small" style={{ alignSelf: 'flex-start' }} onClick={() => set({ public_replies: [...d.public_replies, ''] })}>
              + Añadir respuesta
            </button>
          </div>
        </div>

        <label className="row">
          <input type="checkbox" checked={d.active} onChange={(e) => set({ active: e.target.checked })} />
          Activa
        </label>

        {error && <p className="notice bad">{error}</p>}

        <div className="row">
          <button className="btn primary" onClick={save} disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <div className="spacer" />
          {d.id !== null && (
            <button className="btn danger" onClick={remove}>
              Borrar
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
