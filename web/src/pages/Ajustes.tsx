import { useEffect, useState } from 'react';
import { api, fecha } from '../api';

interface Props {
  notify: (msg: string) => void;
}

interface Settings {
  editables: Record<string, string>;
  cuenta: string;
  token_caduca: string | null;
  token_renovado: string | null;
}

const MODELOS = [
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (recomendado)' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 (más barato, más simple)' },
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 (más caro)' },
];
const ESFUERZOS = [
  { id: 'low', label: 'Bajo (recomendado para chatear)' },
  { id: 'medium', label: 'Medio' },
  { id: 'high', label: 'Alto (más lento y caro)' },
];

const diasHasta = (iso: string | null) => (iso ? Math.floor((Date.parse(iso) - Date.now()) / 86_400_000) : null);

export const Ajustes = ({ notify }: Props) => {
  const [s, setS] = useState<Settings | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<Settings>('/api/ajustes').then(
      (r) => {
        setS(r);
        setForm(r.editables);
      },
      (e) => setError(e.message),
    );
  }, []);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const cambios = s ? Object.fromEntries(Object.entries(form).filter(([k, v]) => v !== s.editables[k])) : {};

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const r = await api.put<Settings>('/api/ajustes', cambios);
      setS(r);
      setForm(r.editables);
      notify('Ajustes guardados: se aplican al siguiente mensaje');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (!s) return error ? <p className="notice bad">{error}</p> : <p className="muted">Cargando…</p>;
  const dias = diasHasta(s.token_caduca);

  return (
    <div className="settings">
      <div>
        <h1>Ajustes</h1>
        <p className="lead-text">Cuenta conectada: @{s.cuenta || '—'}</p>
      </div>

      <div className={`notice ${dias === null ? '' : dias < 10 ? 'bad' : dias < 20 ? 'warn' : 'ok'}`}>
        <strong>Token de Instagram:</strong> caduca el {fecha(s.token_caduca, false)}
        {dias !== null && ` (en ${dias} días)`}. Se renueva solo cada semana; última vez el {fecha(s.token_renovado, false)}.
        {dias !== null && dias < 10 && ' Si no se renueva, genera uno nuevo en Meta y ponlo con poner-secretos.ps1.'}
      </div>

      <div className="card settings">
        <h2 style={{ margin: 0, fontSize: 17 }}>Conversación con IA</h2>
        <label className="field">
          Modelo
          <select value={form.ai_model} onChange={(e) => set('ai_model', e.target.value)}>
            {MODELOS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Cuánto piensa antes de contestar
          <select value={form.ai_effort} onChange={(e) => set('ai_effort', e.target.value)}>
            {ESFUERZOS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Respuestas de IA por conversación y día
          <span className="hint">Al llegar, la conversación pasa a una persona y se avisa al equipo.</span>
          <input type="number" min={1} max={100} value={form.ai_max_per_day} onChange={(e) => set('ai_max_per_day', e.target.value)} />
        </label>
        <label className="field">
          Respuestas de IA por conversación en total
          <input type="number" min={1} max={500} value={form.ai_max_per_conversation} onChange={(e) => set('ai_max_per_conversation', e.target.value)} />
        </label>
      </div>

      <div className="card settings">
        <h2 style={{ margin: 0, fontSize: 17 }}>Comentarios</h2>
        <label className="field">
          Días sin repetir el DM al mismo usuario
          <span className="hint">Si vuelve a comentar la misma palabra antes, no se le manda otra vez.</span>
          <input type="number" min={0} max={365} value={form.repeat_window_days} onChange={(e) => set('repeat_window_days', e.target.value)} />
        </label>
      </div>

      <div className="card settings">
        <h2 style={{ margin: 0, fontSize: 17 }}>LogiQD HQ</h2>
        <label className="field">
          Clave del formulario de HQ
          <span className="hint">El formulario de HQ al que llegan los leads con «Enviar a HQ». Por ejemplo: instagram.</span>
          <input type="text" value={form.hq_form_key} onChange={(e) => set('hq_form_key', e.target.value.trim())} placeholder="instagram" />
        </label>
      </div>

      {error && <p className="notice bad">{error}</p>}
      <div className="row">
        <button className="btn primary" onClick={save} disabled={saving || Object.keys(cambios).length === 0}>
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </button>
        {Object.keys(cambios).length > 0 && <span className="muted small">Hay cambios sin guardar</span>}
      </div>
    </div>
  );
};
