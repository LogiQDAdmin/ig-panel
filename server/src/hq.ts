// Envío de un lead a LogiQD HQ a través de uno de sus formularios públicos.
// En HQ aparece como "solicitud" y desde ahí se convierte en negocio, contacto y tarea.
// Los campos que el formulario no tenga se ignoran, así que no hace falta crearlos todos.

export interface LeadForHq {
  ig_username: string | null;
  keyword: string | null;
  business_name: string | null;
  sector: string | null;
  zona: string | null;
  web: string | null;
  interes: string | null;
  telefono: string | null;
  comment_text: string | null;
}

export const buildHqValues = (lead: LeadForHq): Record<string, string> => {
  const usuario = lead.ig_username ? `@${lead.ig_username}` : 'Usuario de Instagram';
  const perfil = lead.ig_username ? `https://instagram.com/${lead.ig_username}` : '';
  const mensaje = [
    `Lead de Instagram (palabra ${lead.keyword ?? '?'}).`,
    lead.sector || lead.zona ? `Sector y zona: ${[lead.sector, lead.zona].filter(Boolean).join(', ')}.` : '',
    lead.web ? `Web actual: ${lead.web}.` : '',
    lead.interes ? `Le interesa: ${lead.interes}.` : '',
    lead.comment_text ? `Comentó: "${lead.comment_text}".` : '',
    perfil ? `Perfil: ${perfil}` : '',
  ].filter(Boolean).join('\n');

  // Los campos que HQ reconoce van con sus dos claves (español e inglés): el formulario de HQ
  // genera la clave a partir de la etiqueta y, por ejemplo, «Nombre» acaba siendo `name`.
  // HQ se queda solo con las claves que existen en el formulario.
  const values: Record<string, string> = {
    name: usuario,
    nombre: usuario,
    telefono: lead.telefono ?? '',
    phone: lead.telefono ?? '',
    empresa: lead.business_name ?? '',
    company: lead.business_name ?? '',
    sector: lead.sector ?? '',
    zona: lead.zona ?? '',
    web: lead.web ?? '',
    interes: lead.interes ?? '',
    instagram: perfil,
    mensaje,
    message: mensaje,
  };
  // HQ trata los vacíos como "sin valor", pero se quitan para no tropezar con campos tipados.
  return Object.fromEntries(Object.entries(values).filter(([, v]) => v !== ''));
};

export const sendToHq = async (hqUrl: string, formKey: string, lead: LeadForHq): Promise<string> => {
  const res = await fetch(`${hqUrl.replace(/\/$/, '')}/api/v1/public/forms/${encodeURIComponent(formKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'logiqd-ig-panel' },
    body: JSON.stringify({ values: buildHqValues(lead), sourcePage: `instagram:${lead.keyword ?? ''}` }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
  if (res.status !== 201) throw new Error(body.error?.message ?? `HQ respondió ${res.status}`);
  return body.id ?? '';
};
