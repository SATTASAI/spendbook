// End-to-end test of dist/worker.js against an in-memory D1 stand-in (node:sqlite).
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

const db = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE expenses (id TEXT PRIMARY KEY, amount REAL NOT NULL, app TEXT, cat TEXT, date TEXT NOT NULL, time TEXT, note TEXT, payee TEXT, ref TEXT, source TEXT, review INTEGER DEFAULT 0, raw TEXT, sub TEXT, created_at INTEGER, kind TEXT DEFAULT 'expense', excluded INTEGER DEFAULT 0);
CREATE TABLE subs (id TEXT PRIMARY KEY, data TEXT NOT NULL, created_at INTEGER);
CREATE TABLE settings (k TEXT PRIMARY KEY, v TEXT);
CREATE TABLE capture_log (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER, status TEXT, detail TEXT, source TEXT, ct TEXT, len INTEGER, sample TEXT);`);
const stmt = (sql) => {
  let args = [];
  const s = {
    bind: (...a) => { args = a; return s; },
    run: async () => { db.prepare(sql).run(...args); return { success: true }; },
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    first: async () => db.prepare(sql).get(...args) ?? null,
  };
  return s;
};
const DB = { prepare: stmt, batch: async (list) => Promise.all(list.map((s) => s.all())) };
const env = { DB, APP_KEY: 'test-key-123' };

const mod = await import('data:text/javascript;base64,' + Buffer.from(readFileSync(new URL('../dist/worker.js', import.meta.url))).toString('base64'));
const worker = mod.default;
const call = async (method, path, body, key = env.APP_KEY) => {
  const headers = { authorization: 'Bearer ' + key };
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await worker.fetch(new Request('https://x.test' + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined }), env);
  const ct = res.headers.get('content-type') || '';
  return { status: res.status, body: ct.includes('json') ? await res.json() : await res.text(), ct };
};

let fail = 0;
const check = (name, cond, extra = '') => { console.log(cond ? 'ok  ' : 'FAIL', name, cond ? '' : extra); if (!cond) fail++; };

const page = await call('GET', '/');
check('page served', page.status === 200 && page.body.includes('สมุดรายจ่าย') && page.ct.includes('text/html'));
const icon = await worker.fetch(new Request('https://x.test/apple-touch-icon.png'), env);
check('icon png', icon.status === 200 && (await icon.arrayBuffer()).byteLength > 1000);
check('wrong key rejected', (await call('GET', '/api/data', undefined, 'nope')).status === 401);

const sms = await call('POST', '/api/capture', { text: '16/10/69 12:34 บชX123456X เงินออก 60.00บ คงเหลือ 1,234.56บ', source: 'sms', sender: 'KBank' });
check('sms saved', sms.body.status === 'saved', JSON.stringify(sms.body));
console.log('     shortcut sees:', sms.body.message);
const slip = await call('POST', '/api/capture', { text: 'โอนเงินสำเร็จ\n16 ต.ค. 69 12:35 น.\nไปยัง\nร้านก๋วยเตี๋ยวป้าแดง\nเลขที่รายการ: 015289123456ABC12\nจำนวน: 60.00 บาท', source: 'slip' });
check('slip of same txn = duplicate', slip.body.status === 'duplicate', JSON.stringify(slip.body));
console.log('     shortcut sees:', slip.body.message);
const inc = await call('POST', '/api/capture', { text: '16/10/69 13:00 บชX123456X เงินเข้า 500.00บ', source: 'sms' });
check('income saved', inc.body.status === 'saved' && inc.body.kind === 'income', JSON.stringify(inc.body));
console.log('     shortcut sees:', inc.body.message);
const plain = await worker.fetch(new Request('https://x.test/api/capture', { method: 'POST', headers: { authorization: 'Bearer ' + env.APP_KEY, 'content-type': 'text/plain' }, body: 'SCB เงิน 1,500.00 บ. ออกจากบ/ช x1234 วันที่ 15/10/2569@18:05 ใช้ได้ 3,210.50 บ.' }), env);
check('plain-text capture', (await plain.text()).startsWith('บันทึก ฿1,500'));

// one-link Shortcut: key + source in the URL, raw text body, plain-text answer
const one = await worker.fetch(new Request('https://x.test/api/capture?k=' + env.APP_KEY + '&source=sms', { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: '16/10/69 20:10 บชX123456X เงินออก 120.00บ คงเหลือ 999.00บ' }), env);
const oneTxt = await one.text();
check('one-link capture -> plain text', one.status === 200 && oneTxt.startsWith('บันทึก ฿120'), oneTxt);
console.log('     notification shows:', oneTxt);
const bad = await worker.fetch(new Request('https://x.test/api/capture?k=wrong', { method: 'POST', body: 'x' }), env);
check('one-link wrong key rejected', bad.status === 401);

const getm = await worker.fetch(new Request('https://x.test/api/capture?k=' + env.APP_KEY + '&source=sms'), env);
check('GET explains to use POST', (await getm.text()).includes('POST'));
const logs = db.prepare('SELECT status FROM capture_log').all().map((r) => r.status);
check('captures are logged', logs.includes('saved') && logs.includes('bad_key') && logs.includes('wrong_method'), JSON.stringify(logs));

const man = await call('POST', '/api/expenses', { amount: 45, app: 'เงินสด', cat: 'food', date: '2026-10-16', note: 'กาแฟ' });
check('manual add', man.body.ok);
let data = (await call('GET', '/api/data')).body;
check('data has 5 items', data.items.length === 5, JSON.stringify(data.items));
const kb = data.items.find((x) => x.amount === 60);
check('sms row enriched by slip', kb && kb.app === 'K PLUS' && kb.payee.includes('ก๋วยเตี๋ยว') && kb.cat === 'food', JSON.stringify(kb));

await call('PUT', '/api/expenses/' + man.body.item.id, { amount: 50, app: 'เงินสด', cat: 'food', date: '2026-10-16', note: 'กาแฟเย็น', review: false });
const sub = await call('POST', '/api/subs', { name: 'Netflix', amount: 419, cycle: 'month', day: 5, cat: 'fun', app: 'บัตรเครดิต', status: 'active', lastPaid: '' });
await call('PATCH', '/api/subs/' + sub.body.id, { lastPaid: '2026-10' });
await call('PUT', '/api/settings', { budget: 15000 });
data = (await call('GET', '/api/data')).body;
check('edit saved', data.items.some((x) => x.amount === 50 && x.note === 'กาแฟเย็น'));
check('sub patched', data.subs[0].lastPaid === '2026-10' && data.subs[0].name === 'Netflix');
check('budget saved', data.settings.budget === 15000);
const incRow = data.items.find((x) => x.kind === 'income');
await call('PUT', '/api/expenses/' + incRow.id, { ...incRow, excluded: true });
data = (await call('GET', '/api/data')).body;
check('mark own transfer as excluded', data.items.find((x) => x.id === incRow.id).excluded === true);
const imp = await call('POST', '/api/import', { items: [{ amount: 99, app: 'TrueMoney', cat: 'fun', date: '2026-10-10', note: 'เกม' }, { amount: -1, date: 'x' }], subs: [], settings: { budget: 12000 } });
check('import skips bad rows', imp.body.message === 'นำเข้า 1 รายการ และ 0 แพ็กเกจ', imp.body.message);
await call('DELETE', '/api/expenses/' + man.body.item.id);
data = (await call('GET', '/api/data')).body;
check('delete', !data.items.some((x) => x.id === man.body.item.id));
process.exit(fail ? 1 : 0);
