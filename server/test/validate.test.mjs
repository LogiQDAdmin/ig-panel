import assert from 'node:assert/strict';
import test from 'node:test';
import { buildHqValues } from '../dist/hq.js';
import { validateKeyword, validateSettings, validateStatus } from '../dist/validate.js';

const base = { keyword: 'WEB', dm_message: 'Hola 👋 ¿cómo se llama tu negocio?', public_replies: ['¡Te lo paso por DM! 📩'] };

test('palabra clave válida para todos los reels', () => {
  const r = validateKeyword(base);
  assert.ok(r.ok);
  assert.equal(r.value.media_id, null);
  assert.equal(r.value.media_label, 'Todos los reels');
  assert.equal(r.value.active, true);
});

test('palabra clave ligada a un reel', () => {
  const r = validateKeyword({ ...base, media_id: '18012345678901234', media_label: 'Reel webs' });
  assert.ok(r.ok);
  assert.equal(r.value.media_id, '18012345678901234');
  assert.equal(r.value.media_label, 'Reel webs');
});

test('rechaza lo que Instagram o la base de datos no admiten', () => {
  assert.equal(validateKeyword({ ...base, keyword: '  ' }).ok, false);
  assert.equal(validateKeyword({ ...base, dm_message: 'é'.repeat(501) }).ok, false); // 1002 bytes
  assert.equal(validateKeyword({ ...base, public_replies: [' ', ''] }).ok, false);
  assert.equal(validateKeyword({ ...base, media_id: "1' OR 1=1" }).ok, false);
});

test('estados de lead', () => {
  assert.ok(validateStatus({ status: 'humano' }).ok);
  assert.equal(validateStatus({ status: 'borrado' }).ok, false);
});

test('ajustes: solo los permitidos y con valores válidos', () => {
  assert.ok(validateSettings({ ai_model: 'claude-haiku-5-5', ai_max_per_day: '20' }).ok);
  assert.equal(validateSettings({ access_token: 'x' }).ok, false);
  assert.equal(validateSettings({ ai_max_per_day: '0' }).ok, false);
  assert.equal(validateSettings({ ai_model: 'gpt-5' }).ok, false);
  assert.ok(validateSettings({ hq_form_key: 'instagram' }).ok);
  assert.equal(validateSettings({ hq_form_key: 'Insta Gram' }).ok, false);
});

test('lead para HQ: campos que HQ reconoce y sin vacíos', () => {
  const v = buildHqValues({
    ig_username: 'panaderia_lola', keyword: 'WEB', business_name: 'Panadería Lola', sector: 'panadería',
    zona: 'Sabadell', web: 'no tiene', interes: 'web', telefono: '612 345 678', comment_text: 'WEB 🔥',
  });
  assert.equal(v.nombre, '@panaderia_lola');
  assert.equal(v.empresa, 'Panadería Lola');
  assert.equal(v.telefono, '612 345 678');
  assert.match(v.mensaje, /Sabadell/);
  const vacio = buildHqValues({ ig_username: null, keyword: null, business_name: null, sector: null, zona: null, web: null, interes: null, telefono: null, comment_text: null });
  assert.equal('telefono' in vacio, false);
});
