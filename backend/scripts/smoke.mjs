#!/usr/bin/env node
/**
 * Çalışan sunucuya karşı uçtan uca kontrol.
 *
 * Bu projede test runner yok (bkz. CLAUDE.md) — davranış doğrulaması buradan
 * yapılır. Sunucu ayaktayken çalıştırılır:
 *
 *   SEED_ADMIN_EMAIL=... SEED_ADMIN_PASSWORD=... node scripts/smoke.mjs [baseUrl]
 *
 * Çıkış kodu: 0 = hepsi geçti, 1 = en az bir kontrol kaldı.
 */
const BASE = (process.argv[2] || 'http://127.0.0.1:4000').replace(/\/$/, '');
const EMAIL = process.env.SEED_ADMIN_EMAIL;
const PASSWORD = process.env.SEED_ADMIN_PASSWORD;

let pass = 0;
let fail = 0;
let TOKEN = null;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function json(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`JSON bekleniyordu, gelen: ${text.slice(0, 120)}`);
  }
}

async function check(name, fn) {
  try {
    await fn();
    console.log(`  ok    ${name}`);
    pass++;
  } catch (e) {
    console.log(`  KALDI ${name}`);
    console.log(`        ${e.message}`);
    fail++;
  }
}

const authed = () => ({ Authorization: `Bearer ${TOKEN}` });

console.log(`LeadPin smoke — ${BASE}\n`);

// ─── Temel ────────────────────────────────────────────────────────────────
await check('GET /health', async () => {
  const r = await fetch(`${BASE}/health`);
  assert(r.status === 200, `beklenen 200, gelen ${r.status}`);
  assert((await json(r)).status === 'ok', 'status alanı ok değil');
});

await check('kimliksiz /api/stats 401 veriyor', async () => {
  const r = await fetch(`${BASE}/api/stats`);
  assert(r.status === 401, `beklenen 401, gelen ${r.status}`);
});

// ─── Kimlik doğrulama ─────────────────────────────────────────────────────
if (!EMAIL || !PASSWORD) {
  console.log('\n  ATLANDI: SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD verilmedi,');
  console.log('           kimlik doğrulama kontrolleri çalıştırılamıyor.\n');
} else {
  await check('login jeton döndürüyor', async () => {
    const r = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
    assert(r.status === 200, `beklenen 200, gelen ${r.status}`);
    const d = await json(r);
    assert(typeof d.token === 'string' && d.token.length > 20, 'jeton yok veya çok kısa');
    assert(d.user?.is_admin === true, 'seed kullanıcı admin değil');
    TOKEN = d.token;
  });

  await check('yanlış şifre 401', async () => {
    const r = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: 'kesinlikle-yanlis-sifre' }),
    });
    assert(r.status === 401, `beklenen 401, gelen ${r.status}`);
  });

  await check('kayıt kapalıyken signup 403', async () => {
    const r = await fetch(`${BASE}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'yeni@ornek.local', password: 'parola12345' }),
    });
    assert(r.status === 403, `beklenen 403, gelen ${r.status}`);
  });

  await check('jetonla /api/auth/me', async () => {
    const r = await fetch(`${BASE}/api/auth/me`, { headers: authed() });
    assert(r.status === 200, `beklenen 200, gelen ${r.status}`);
    assert((await json(r)).user?.email === EMAIL.toLowerCase(), 'e-posta eşleşmedi');
  });

  await check('bozuk jeton 401', async () => {
    const r = await fetch(`${BASE}/api/auth/me`, {
      headers: { Authorization: 'Bearer bozuk.jeton.degeri' },
    });
    assert(r.status === 401, `beklenen 401, gelen ${r.status}`);
  });
}

console.log(`\n${pass} geçti, ${fail} kaldı`);
process.exit(fail ? 1 : 0);
