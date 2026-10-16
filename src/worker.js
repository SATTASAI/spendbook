import { parseCapture, isSameTxn } from './parse.js';
import APP_HTML from './app.html';
import { ICON_192, ICON_512 } from './icons.js';

const CATS = ['food', 'travel', 'shop', 'bill', 'fun', 'health', 'edu', 'family', 'other'];
const INCOME_CATS = ['salary', 'sale', 'gift', 'refund', 'interest', 'income_other'];
const CAT_TH = { food: 'อาหาร', travel: 'เดินทาง', shop: 'ช้อปปิ้ง', bill: 'บิล', fun: 'บันเทิง', health: 'สุขภาพ', edu: 'การศึกษา', family: 'ครอบครัว', other: 'อื่นๆ',
  salary: 'เงินเดือน', sale: 'ขายของ', gift: 'คนโอนให้', refund: 'เงินคืน', interest: 'ดอกเบี้ย', income_other: 'รายรับอื่นๆ' };
const jsonResp = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});
const json = jsonResp;
const fmt = (n) => Number(n).toLocaleString('th-TH', { maximumFractionDigits: 2 });

function authed(req, env, url) {
  if (!env.APP_KEY) return false;
  const h = req.headers.get('authorization') || '';
  // header for the app; ?k= for one-link Shortcuts
  const key = (h.replace(/^Bearer\s+/i, '').trim()) || (url.searchParams.get('k') || '').trim();
  if (key.length !== env.APP_KEY.length) return false;
  let diff = 0;
  for (let i = 0; i < key.length; i++) diff |= key.charCodeAt(i) ^ env.APP_KEY.charCodeAt(i);
  return diff === 0;
}

function cleanExpense(b) {
  const amount = Math.round(Number(b.amount) * 100) / 100;
  if (!(amount > 0 && amount < 10_000_000)) throw new Error('จำนวนเงินไม่ถูกต้อง');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.date || ''))) throw new Error('วันที่ไม่ถูกต้อง');
  const kind = b.kind === 'income' ? 'income' : 'expense';
  const cats = kind === 'income' ? INCOME_CATS : CATS;
  return {
    kind,
    excluded: b.excluded ? 1 : 0,
    amount,
    app: String(b.app || 'ไม่ระบุ').slice(0, 40),
    cat: cats.includes(b.cat) ? b.cat : (kind === 'income' ? 'income_other' : 'other'),
    date: b.date,
    time: /^\d{2}:\d{2}$/.test(b.time || '') ? b.time : '',
    note: String(b.note || '').slice(0, 80),
    payee: String(b.payee || '').slice(0, 60),
    ref: String(b.ref || '').slice(0, 60),
    source: String(b.source || 'manual').slice(0, 12),
    review: b.review ? 1 : 0,
    raw: String(b.raw || '').slice(0, 2000),
    sub: String(b.sub || '').slice(0, 60),
  };
}

async function insertExpense(env, e) {
  const id = crypto.randomUUID();
  const created = Date.now();
  await env.DB.prepare(
    'INSERT INTO expenses (id,amount,app,cat,date,time,note,payee,ref,source,review,raw,sub,created_at,kind,excluded) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
  ).bind(id, e.amount, e.app, e.cat, e.date, e.time, e.note, e.payee, e.ref, e.source, e.review, e.raw, e.sub, created, e.kind, e.excluded).run();
  return { id, ...e, createdAt: created };
}

function rowToItem(r) {
  return {
    id: r.id, amount: r.amount, app: r.app, cat: r.cat, date: r.date, time: r.time || '',
    note: r.note || '', payee: r.payee || '', ref: r.ref || '', source: r.source || '',
    review: !!r.review, raw: r.raw || '', sub: r.sub || '', createdAt: r.created_at,
    kind: r.kind === 'income' ? 'income' : 'expense', excluded: !!r.excluded,
  };
}

async function readAll(env) {
  const [ex, su, se] = await env.DB.batch([
    env.DB.prepare('SELECT * FROM expenses ORDER BY date DESC, created_at DESC LIMIT 5000'),
    env.DB.prepare('SELECT * FROM subs ORDER BY created_at'),
    env.DB.prepare('SELECT * FROM settings'),
  ]);
  const settings = {};
  for (const r of se.results) { try { settings[r.k] = JSON.parse(r.v); } catch { /* skip */ } }
  return {
    items: ex.results.map(rowToItem),
    subs: su.results.map((r) => ({ id: r.id, ...JSON.parse(r.data) })),
    settings,
  };
}

// Every Shortcut call is logged (kept to the latest 200) so failures can be diagnosed.
async function logCapture(env, req, url, status, detail, text = '') {
  try {
    await env.DB.prepare('INSERT INTO capture_log (at,status,detail,source,ct,len,sample) VALUES (?,?,?,?,?,?,?)')
      .bind(Date.now(), status, String(detail || '').slice(0, 300), url.searchParams.get('source') || '', (req.headers.get('content-type') || '').slice(0, 80), text.length, text.slice(0, 300)).run();
    await env.DB.prepare('DELETE FROM capture_log WHERE id <= (SELECT MAX(id) - 200 FROM capture_log)').run();
  } catch { /* logging must never break capture */ }
}

async function capture(req, env, url) {
  let body;
  const ct = req.headers.get('content-type') || '';
  const isJson = ct.includes('application/json');
  if (isJson) body = await req.json();
  else body = { text: await req.text() };
  const text = String(body.text || '').slice(0, 4000);
  const source = (body.source || url.searchParams.get('source')) === 'slip' ? 'slip' : 'sms';
  // a Shortcut that posts the raw text gets a plain sentence back, ready for "Show Notification"
  const json = isJson ? jsonResp : (d) => new Response(d.message || d.error || '', { headers: { 'content-type': 'text/plain; charset=utf-8' } });
  const p = parseCapture(text, source, { app: body.app || body.sender || '' });
  if (!text.trim()) {
    await logCapture(env, req, url, 'empty', 'no text in body', text);
    return json({ ok: true, status: 'skipped', message: 'ไม่ได้รับข้อความ: ตรวจว่า Request Body เป็น File และเลือกตัวแปรถูกตัว' });
  }
  if (p.kind !== 'expense' && p.kind !== 'income') {
    await logCapture(env, req, url, 'skipped', p.reason, text);
    return json({ ok: true, status: 'skipped', message: `ไม่บันทึก: ${p.reason}` });
  }
  const cand = { ...p, source, raw: text };
  // duplicate check (same transaction from SMS and slip)
  const { results } = await env.DB.prepare("SELECT * FROM expenses WHERE amount = ? AND date = ? AND COALESCE(kind,'expense') = ?").bind(p.amount, p.date, p.kind).all();
  const dup = results.map(rowToItem).find((x) => isSameTxn(x, cand));
  if (dup) {
    // fill in details the earlier capture didn't have
    const patch = {};
    if (!dup.payee && p.payee) patch.payee = p.payee;
    if (!dup.ref && p.ref) patch.ref = p.ref;
    if (!dup.time && p.time) patch.time = p.time;
    if ((!dup.note) && p.note) patch.note = p.note;
    if ((dup.cat === 'other' || dup.cat === 'gift') && p.cat !== dup.cat && p.cat !== 'other') patch.cat = p.cat;
    const keys = Object.keys(patch);
    if (keys.length) {
      await env.DB.prepare(`UPDATE expenses SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`)
        .bind(...keys.map((k) => patch[k]), dup.id).run();
    }
    await logCapture(env, req, url, 'duplicate', dup.id, text);
    return json({ ok: true, status: 'duplicate', id: dup.id, message: `มีอยู่แล้ว ฿${fmt(p.amount)}${keys.length ? ' (เติมรายละเอียดให้)' : ''}` });
  }
  const saved = await insertExpense(env, cleanExpense({ ...cand, review: p.review }));
  await logCapture(env, req, url, 'saved', `${saved.kind} ${saved.amount}`, text);
  const head = saved.kind === 'income' ? `รายรับ +฿${fmt(saved.amount)}` : `บันทึก ฿${fmt(saved.amount)}`;
  return json({
    ok: true, status: 'saved', id: saved.id, kind: saved.kind,
    message: `${head} · ${saved.payee || saved.app} · ${CAT_TH[saved.cat]}${saved.review ? ' (รอตรวจ)' : ''}`,
  });
}

async function api(req, env, url) {
  const path = url.pathname.replace(/^\/api/, '');
  const m = req.method;
  if (path === '/data' && m === 'GET') return json(await readAll(env));
  if (path === '/capture' && m === 'POST') return capture(req, env, url);
  if (path === '/capture') {
    await logCapture(env, req, url, 'wrong_method', m);
    return new Response('คำสั่งลัดยังตั้ง Method เป็น ' + m + ' อยู่ ให้เปลี่ยนเป็น POST', { headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }

  if (path === '/expenses' && m === 'POST') {
    const saved = await insertExpense(env, cleanExpense(await req.json()));
    return json({ ok: true, item: saved });
  }
  let mm = /^\/expenses\/([\w-]+)$/.exec(path);
  if (mm && m === 'PUT') {
    const e = cleanExpense(await req.json());
    await env.DB.prepare('UPDATE expenses SET amount=?,app=?,cat=?,date=?,time=?,note=?,payee=?,review=?,kind=?,excluded=? WHERE id=?')
      .bind(e.amount, e.app, e.cat, e.date, e.time, e.note, e.payee, e.review, e.kind, e.excluded, mm[1]).run();
    return json({ ok: true });
  }
  if (mm && m === 'DELETE') {
    await env.DB.prepare('DELETE FROM expenses WHERE id=?').bind(mm[1]).run();
    return json({ ok: true });
  }

  if (path === '/subs' && m === 'POST') {
    const b = await req.json();
    const id = crypto.randomUUID();
    await env.DB.prepare('INSERT INTO subs (id,data,created_at) VALUES (?,?,?)').bind(id, JSON.stringify(b).slice(0, 4000), Date.now()).run();
    return json({ ok: true, id });
  }
  mm = /^\/subs\/([\w-]+)$/.exec(path);
  if (mm && m === 'PATCH') {
    const row = await env.DB.prepare('SELECT data FROM subs WHERE id=?').bind(mm[1]).first();
    if (!row) return json({ ok: false, error: 'ไม่พบแพ็กเกจ' }, 404);
    const next = { ...JSON.parse(row.data), ...(await req.json()) };
    delete next.id;
    await env.DB.prepare('UPDATE subs SET data=? WHERE id=?').bind(JSON.stringify(next).slice(0, 4000), mm[1]).run();
    return json({ ok: true });
  }
  if (mm && m === 'DELETE') {
    await env.DB.prepare('DELETE FROM subs WHERE id=?').bind(mm[1]).run();
    return json({ ok: true });
  }

  if (path === '/settings' && m === 'PUT') {
    const b = await req.json();
    const stmts = Object.entries(b).slice(0, 20).map(([k, v]) =>
      env.DB.prepare('INSERT INTO settings (k,v) VALUES (?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v').bind(String(k).slice(0, 40), JSON.stringify(v)));
    if (stmts.length) await env.DB.batch(stmts);
    return json({ ok: true });
  }

  if (path === '/import' && m === 'POST') {
    const b = await req.json();
    let n = 0, s = 0;
    for (const it of (b.items || []).slice(0, 3000)) {
      try { await insertExpense(env, cleanExpense({ ...it, source: it.source || 'import' })); n++; } catch { /* skip bad row */ }
    }
    for (const sub of (b.subs || []).slice(0, 200)) {
      const { id, ...rest } = sub;
      await env.DB.prepare('INSERT INTO subs (id,data,created_at) VALUES (?,?,?)').bind(crypto.randomUUID(), JSON.stringify(rest).slice(0, 4000), Date.now()).run();
      s++;
    }
    if (b.settings && typeof b.settings === 'object' && b.settings.budget != null) {
      await env.DB.prepare('INSERT INTO settings (k,v) VALUES (?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v').bind('budget', JSON.stringify(Number(b.settings.budget) || 0)).run();
    }
    return json({ ok: true, message: `นำเข้า ${n} รายการ และ ${s} แพ็กเกจ` });
  }
  return json({ ok: false, error: 'ไม่พบเส้นทางนี้' }, 404);
}

const MANIFEST = {
  name: 'สมุดรายจ่าย', short_name: 'รายจ่าย', start_url: '/', display: 'standalone',
  background_color: '#F3F6F5', theme_color: '#0F7A63', lang: 'th',
  icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }],
};
const png = (b64) => new Response(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)), {
  headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=604800' },
});

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    try {
      if (url.pathname.startsWith('/api/')) {
        if (!env.DB) return json({ ok: false, error: 'ยังไม่ได้เชื่อมฐานข้อมูล (D1 binding ชื่อ DB)' }, 500);
        if (!env.APP_KEY) return json({ ok: false, error: 'ยังไม่ได้ตั้งรหัสแอป (APP_KEY)' }, 500);
        if (!authed(req, env, url)) {
          if (url.pathname === '/api/capture') {
            await logCapture(env, req, url, 'bad_key', `key length ${(url.searchParams.get('k') || '').length}`);
            return new Response('รหัสแอปในลิงก์ไม่ถูกต้อง ให้คัดลอกลิงก์ใหม่จากหน้า ⚙︎ ในแอป', { status: 401, headers: { 'content-type': 'text/plain; charset=utf-8' } });
          }
          return json({ ok: false, error: 'รหัสแอปไม่ถูกต้อง' }, 401);
        }
        return await api(req, env, url);
      }
      if (url.pathname === '/manifest.webmanifest') {
        return new Response(JSON.stringify(MANIFEST), { headers: { 'content-type': 'application/manifest+json' } });
      }
      if (url.pathname === '/icon-192.png' || url.pathname === '/apple-touch-icon.png') return png(ICON_192);
      if (url.pathname === '/icon-512.png') return png(ICON_512);
      if (url.pathname === '/' || url.pathname === '/index.html') {
        return new Response(APP_HTML, {
          headers: {
            'content-type': 'text/html; charset=utf-8',
            'cache-control': 'no-cache',
            'x-frame-options': 'DENY',
            'referrer-policy': 'no-referrer',
          },
        });
      }
      return new Response('Not found', { status: 404 });
    } catch (err) {
      return json({ ok: false, error: err && err.message ? err.message : 'เกิดข้อผิดพลาด' }, 400);
    }
  },
};
