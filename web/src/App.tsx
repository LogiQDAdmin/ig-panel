import { useCallback, useEffect, useState } from 'react';
import { Ajustes } from './pages/Ajustes';
import { Leads } from './pages/Leads';
import { Palabras } from './pages/Palabras';

const TABS = [
  { id: 'palabras', label: 'Vídeos y palabras' },
  { id: 'leads', label: 'Leads' },
  { id: 'ajustes', label: 'Ajustes' },
] as const;
type Tab = (typeof TABS)[number]['id'];

const fromHash = (): Tab => {
  const h = window.location.hash.replace('#', '');
  return (TABS.find((t) => t.id === h)?.id ?? 'palabras') as Tab;
};

export const App = () => {
  const [tab, setTab] = useState<Tab>(fromHash);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const onHash = () => setTab(fromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const notify = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 3500);
  }, []);

  return (
    <>
      <header className="top">
        <div className="top-inner">
          <div className="brand">
            <img src="/icon.svg" alt="" />
            <span>
              IG Automation <small>· LogiQD</small>
            </span>
          </div>
          <nav className="tabs" role="tablist" aria-label="Secciones">
            {TABS.map((t) => (
              <button
                key={t.id}
                className="tab"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => (window.location.hash = t.id)}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>
      <main>
        {tab === 'palabras' && <Palabras notify={notify} />}
        {tab === 'leads' && <Leads notify={notify} />}
        {tab === 'ajustes' && <Ajustes notify={notify} />}
      </main>
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </>
  );
};
