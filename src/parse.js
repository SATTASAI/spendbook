// Parse Thai bank SMS / slip text (from iOS Live Text) into an expense.
// Pure functions — no I/O — so they can be tested locally.

const THAI_DIGITS = '๐๑๒๓๔๕๖๗๘๙';
const TH_MONTHS = [
  ['ม.ค', 'มกราคม', 'jan'], ['ก.พ', 'กุมภาพันธ์', 'feb'], ['มี.ค', 'มีนาคม', 'mar'], ['เม.ย', 'เมษายน', 'apr'],
  ['พ.ค', 'พฤษภาคม', 'may'], ['มิ.ย', 'มิถุนายน', 'jun'], ['ก.ค', 'กรกฎาคม', 'jul'], ['ส.ค', 'สิงหาคม', 'aug'],
  ['ก.ย', 'กันยายน', 'sep'], ['ต.ค', 'ตุลาคม', 'oct'], ['พ.ย', 'พฤศจิกายน', 'nov'], ['ธ.ค', 'ธันวาคม', 'dec'],
];

export const APP_RULES = [
  [/k\s?plus|kbank|kasikorn|กสิกร|make by k/i, 'K PLUS'],
  [/scb|ไทยพาณิชย์|scb\s?easy/i, 'SCB EASY'],
  [/เป๋าตัง|paotang/i, 'เป๋าตัง'],
  [/krungthai|กรุงไทย|\bktb\b/i, 'Krungthai NEXT'],
  [/truemoney|true money|ทรูมันนี่/i, 'TrueMoney'],
  [/shopee\s?pay/i, 'ShopeePay'],
  [/bualuang|\bbbl\b|ธนาคารกรุงเทพ|bangkok bank/i, 'Bualuang mBanking'],
  [/\bttb\b|ทีทีบี|ทหารไทยธนชาต/i, 'ttb touch'],
  [/krungsri|กรุงศรี|\bkma\b/i, 'KMA กรุงศรี'],
  [/\bgsb\b|ออมสิน|mymo/i, 'MyMo ออมสิน'],
  [/baac|ธ\.?ก\.?ส/i, 'ธ.ก.ส. A-Mobile'],
  [/line\s?man/i, 'LINE MAN'],
  [/\bgrab\b/i, 'Grab'],
];

const CAT_RULES = [
  ['food', /ร้านอาหาร|อาหาร|ข้าว|ก๋วยเตี๋ยว|กาแฟ|คาเฟ่|cafe|coffee|amazon|อเมซอน|7-?eleven|เซเว่น|ซีพี ออลล์|cp all|line\s?man|grab\s?food|foodpanda|robinhood|ส้มตำ|หมูกระทะ|ชาบู|บุฟเฟ่ต์|เบเกอรี่|bakery|kfc|mcdonald|starbucks/i],
  ['travel', /ปตท|\bptt\b|บางจาก|bangchak|shell|เชลล์|caltex|คาลเท็กซ์|น้ำมัน|\bgrab\b(?!\s?food)|bolt|\bbts\b|\bmrt\b|ทางด่วน|easy pass|m-?flow|รถไฟ|ขนส่ง|airasia|แอร์เอเชีย|nok ?air/i],
  ['shop', /shopee|lazada|ลาซาด้า|big ?c|บิ๊กซี|lotus|โลตัส|makro|แม็คโคร|central|เซ็นทรัล|watsons|วัตสัน|tops|ท็อปส์|homepro|โฮมโปร|uniqlo|tiktok shop/i],
  ['bill', /ไฟฟ้า|\bpea\b|\bmea\b|ประปา|\bais\b|true ?move|dtac|3bb|internet|อินเทอร์เน็ต|ค่าโทร|ค่าเน็ต|ประกัน|insurance|ผ่อน|บัตรเครดิต/i],
  ['health', /โรงพยาบาล|รพ\.|คลินิก|clinic|ร้านยา|pharmacy|ทันตกรรม|dental/i],
  ['edu', /โรงเรียน|ค่าเทอม|มหาวิทยาลัย|university|หนังสือ|ศึกษา|se-?ed|นายอินทร์/i],
  ['fun', /netflix|spotify|youtube|disney|major|เมเจอร์|\bsf\b|cinema|โรงหนัง|steam|playstation|garena|rov/i],
];

const INCOME_RE = /เงินเข้า|รับโอน|รับเงิน|ได้รับเงิน|ฝากเงิน|เข้าบ\/?ช|เข้าบัญชี|deposit|received|incoming/i;
const EXPENSE_RE = /เงินออก|ถอน|ออกจาก|โอนเงิน|โอนไป|ชำระ|จ่าย|หักบ|หักบัญชี|ซื้อ|ใช้จ่าย|withdraw|payment|paid|purchase|transfer(red)? to|สแกนจ่าย|เติมเงิน/i;
const IGNORE_RE = /\bOTP\b|รหัสผ่าน|รหัส\s?OTP|ref\s?code.*otp|อย่าบอกรหัส|do not share/i;

function normalize(text) {
  let t = String(text || '');
  t = t.replace(/[๐-๙]/g, (d) => String(THAI_DIGITS.indexOf(d)));
  t = t.replace(/ /g, ' ').replace(/[ \t]+/g, ' ');
  return t.trim();
}

// Bangkok "today" as YYYY-MM-DD
export function bangkokToday(now = new Date()) {
  const d = new Date(now.getTime() + 7 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

function fixYear(y, nowYear) {
  y = Number(y);
  if (y < 100) {
    const be = 2500 + y - 543; // e.g. 69 -> 2026
    const ad = 2000 + y;
    return Math.abs(be - nowYear) <= Math.abs(ad - nowYear) ? be : ad;
  }
  if (y > 2400) return y - 543;
  return y;
}
const pad = (n) => String(n).padStart(2, '0');
function validDate(y, m, d) {
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function findDate(t, now = new Date()) {
  const nowYear = Number(bangkokToday(now).slice(0, 4));
  let m;
  // 16/10/69, 16-10-2569, 16.10.2026
  const re1 = /(?<![\d.])(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2}|\d{4})(?![\d.])/g;
  while ((m = re1.exec(t))) {
    const v = validDate(fixYear(m[3], nowYear), Number(m[2]), Number(m[1]));
    if (v) return { date: v, index: m.index, len: m[0].length };
  }
  // 16 ต.ค. 69 / 16 ตุลาคม 2569 / 16 Oct 2026
  for (let i = 0; i < 12; i++) {
    for (const name of TH_MONTHS[i]) {
      const esc = name.replace(/\./g, '\\.?');
      const re = new RegExp(`(\\d{1,2})\\s*${esc}\\.?[a-z]*\\s*(\\d{2,4})`, 'i');
      const mm = re.exec(t);
      if (mm) {
        const v = validDate(fixYear(mm[2], nowYear), i + 1, Number(mm[1]));
        if (v) return { date: v, index: mm.index, len: mm[0].length };
      }
    }
  }
  return null;
}

export function findTime(t) {
  // 12:34, 12:34:56, 12.34 น.
  const m = /(?<![\d.:])([01]?\d|2[0-3])[:](\d{2})(?::\d{2})?(?!\d)/.exec(t) || /(?<![\d.:])([01]?\d|2[0-3])\.(\d{2})\s*น\./.exec(t);
  if (m && Number(m[2]) < 60) return { time: `${pad(m[1])}:${m[2]}`, index: m.index, len: m[0].length };
  return null;
}

// Pick the transaction amount, avoiding balances, fees, dates, account numbers.
export function findAmount(t, skipRanges = []) {
  const re = /(\d{1,3}(?:,\d{3})+|\d+)(\.\d{1,2})?/g;
  const cands = [];
  let m;
  while ((m = re.exec(t))) {
    const start = m.index, end = start + m[0].length;
    if (skipRanges.some(([a, b]) => start < b && end > a)) continue;
    const before = t.slice(Math.max(0, start - 18), start);
    const after = t.slice(end, end + 8);
    const prevCh = t[start - 1] || ' ', nextCh = t[end] || ' ';
    if (/[A-Za-zxX*\/:]/.test(prevCh) || /[A-Za-zxX*\/:]/.test(nextCh)) continue; // account no., dates, times
    if (/^-\d/.test(t.slice(end, end + 2))) continue; // phone numbers
    const digits = m[1].replace(/,/g, '');
    if (!m[2] && digits.length > 7) continue; // ref numbers
    const value = Number(digits + (m[2] || ''));
    if (!(value > 0) || value > 5_000_000) continue;
    let score = 0;
    if (m[2]) score += 3;
    if (m[1].includes(',')) score += 1;
    if (/^\s*(บ|บาท|thb|฿)/i.test(after)) score += 4;
    if (/(฿|thb)\s*$/i.test(before)) score += 4;
    if (/(จำนวน(เงิน)?|ยอด(เงิน|ชำระ|โอน)?|amount|จ่าย|ชำระ|ถอน|โอน|เงินออก|ออก)\s*[:：]?\s*$/i.test(before)) score += 4;
    if (/(คงเหลือ|ใช้ได้|ยอดเงินคงเหลือ|balance|avail|วงเงิน)\s*[:：]?\s*$/i.test(before)) score -= 10;
    if (/(ค่าธรรมเนียม|fee)\s*[:：]?\s*$/i.test(before)) score -= 6;
    if (/(เลขที่|รหัส|ref|อ้างอิง|no\.?)\s*[:：]?\s*$/i.test(before)) score -= 8;
    cands.push({ value, score, index: start });
  }
  cands.sort((a, b) => b.score - a.score || a.index - b.index);
  return cands.length && cands[0].score > 0 ? cands[0] : null;
}

export function findRef(t) {
  const m = /(?:เลขที่รายการ|รหัสอ้างอิง|หมายเลขอ้างอิง|เลขที่อ้างอิง|รหัสรายการ|transaction\s?(?:id|no\.?)|ref(?:erence)?\s?(?:no\.?)?)\s*[:：.]?\s*([A-Za-z0-9]{6,40})/i.exec(t);
  return m ? m[1] : '';
}

export function findPayee(t) {
  const lines = t.split(/\n/).map((s) => s.trim()).filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    const m = /^(?:ไปยัง|ไป|ถึง|ผู้รับ(?:เงิน)?|ร้าน(?:ค้า)?|to|merchant|payee)\s*[:：]?\s*(.*)$/i.exec(lines[i]);
    if (m) {
      const v = (m[1] || lines[i + 1] || '').replace(/x{2,}[\dx-]*|[\dx]{3,}-?x+/gi, '').trim();
      if (v) return v.slice(0, 60);
    }
  }
  const inline = /(?:ไปยัง|ผู้รับ|ร้าน|to)\s*[:：]?\s*([^\n\d]{2,40})/i.exec(t);
  return inline ? inline[1].trim().slice(0, 60) : '';
}

export function guessApp(t, hint = '') {
  const s = `${hint} ${t}`;
  for (const [re, name] of APP_RULES) if (re.test(s)) return name;
  return '';
}

export function guessCat(t) {
  for (const [id, re] of CAT_RULES) if (re.test(t)) return id;
  return 'other';
}

export function parseCapture(rawText, source = 'sms', opts = {}) {
  const now = opts.now || new Date();
  const t = normalize(rawText);
  if (!t) return { kind: 'unknown', reason: 'ไม่มีข้อความ' };
  if (source === 'sms' && IGNORE_RE.test(t)) return { kind: 'unknown', reason: 'ข้อความ OTP' };

  const isIncome = INCOME_RE.test(t) && !EXPENSE_RE.test(t);
  if (isIncome) return { kind: 'income', reason: 'เป็นเงินเข้า' };
  const looksExpense = EXPENSE_RE.test(t) || source === 'slip';

  const d = findDate(t, now);
  const tm = findTime(t);
  const skip = [];
  if (d) skip.push([d.index, d.index + d.len]);
  if (tm) skip.push([tm.index, tm.index + tm.len]);
  const amt = findAmount(t, skip);
  if (!amt) return { kind: 'unknown', reason: 'ไม่พบยอดเงิน' };
  if (!looksExpense) return { kind: 'unknown', reason: 'ไม่แน่ใจว่าเป็นรายจ่าย', amount: amt.value };

  const today = bangkokToday(now);
  let date = d ? d.date : today;
  // a date more than 2 days in the future is a misread
  if (date > today && (new Date(date) - new Date(today)) / 864e5 > 2) date = today;

  const payee = findPayee(t);
  const app = guessApp(t, opts.app) || (opts.app ? String(opts.app).slice(0, 40) : (source === 'slip' ? 'สลิป' : 'SMS ธนาคาร'));
  const cat = guessCat(`${payee} ${t}`);
  const review = !d || amt.score < 6 || !payee && source === 'slip';
  return {
    kind: 'expense',
    amount: Math.round(amt.value * 100) / 100,
    date,
    time: tm ? tm.time : '',
    app,
    payee,
    ref: findRef(t),
    cat,
    note: payee || '',
    review,
  };
}

// Same transaction captured twice (e.g. SMS + slip)?
export function isSameTxn(a, b) {
  if (a.ref && b.ref && a.ref === b.ref) return true;
  if (Number(a.amount) !== Number(b.amount) || a.date !== b.date) return false;
  if (a.time && b.time) {
    const m = (s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
    return Math.abs(m(a.time) - m(b.time)) <= 15;
  }
  return (a.source || '') !== (b.source || '');
}
