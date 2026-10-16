import { parseCapture, isSameTxn } from '../src/parse.js';

const now = new Date('2026-10-16T14:00:00Z'); // 21:00 Bangkok
const cases = [
  ['kbank out', 'sms', '16/10/69 12:34 บชX123456X เงินออก 250.00บ คงเหลือ 1,234.56บ', { kind: 'expense', amount: 250, date: '2026-10-16', time: '12:34' }],
  ['kbank in', 'sms', '16/10/69 12:34 บชX123456X เงินเข้า 500.00บ คงเหลือ 1,734.56บ', { kind: 'income', amount: 500, date: '2026-10-16', cat: 'gift' }],
  ['salary', 'sms', 'KTB 30/09/69 06:01 บช X-1234 เงินเดือน เงินเข้า 18,500.00 บาท คงเหลือ 20,100.00 บาท', { kind: 'income', amount: 18500, cat: 'salary', date: '2026-09-30' }],
  ['scb in', 'sms', 'เงิน 300.00 บ. เข้าบ/ช x1234 จาก นาย ข 16/10/2569@19:10 ใช้ได้ 3,510.50 บ.', { kind: 'income', amount: 300, time: '19:10' }],
  ['scb out', 'sms', 'เงิน 1,500.00 บ. ออกจากบ/ช x1234 วันที่ 15/10/2569@18:05 ใช้ได้ 3,210.50 บ.', { kind: 'expense', amount: 1500, date: '2026-10-15' }],
  ['ktb', 'sms', 'Krungthai: ถอน/โอน 89.00 บาท บช XXX-X-X1234-X 16-10-69 08:15 คงเหลือ 10,000.00 บาท', { kind: 'expense', amount: 89, app: 'Krungthai NEXT', time: '08:15' }],
  ['otp', 'sms', 'รหัส OTP 123456 สำหรับทำรายการ 2,000.00 บาท Ref: ABCD', { kind: 'unknown' }],
  ['slip kplus', 'slip', 'โอนเงินสำเร็จ\n16 ต.ค. 69 12:35 น.\nนาย สมชาย ใจดี\nธ.กสิกรไทย\nxxx-x-x1234-x\nไปยัง\nร้านก๋วยเตี๋ยวป้าแดง\nเลขที่รายการ:\n015289123456ABC12\nจำนวน:\n60.00 บาท\nค่าธรรมเนียม:\n0.00 บาท', { kind: 'expense', amount: 60, date: '2026-10-16', app: 'K PLUS', cat: 'food', ref: '015289123456ABC12' }],
  ['slip scb', 'slip', 'SCB\nจ่ายบิลสำเร็จ\n16 ต.ค. 2569 - 19:02\nจาก นาย ก xxx-xxx123-4\nไปยัง 7-Eleven\nจำนวนเงิน 135.00\nรหัสอ้างอิง 2026101619021234', { kind: 'expense', amount: 135, app: 'SCB EASY', cat: 'food' }],
];
let fail = 0;
for (const [name, src, text, exp] of cases) {
  const r = parseCapture(text, src, { now });
  const bad = Object.entries(exp).filter(([k, v]) => r[k] !== v);
  console.log(bad.length ? 'FAIL' : 'ok  ', name, bad.length ? JSON.stringify({ got: r, exp }) : `${r.kind} ${r.amount ?? ''} ${r.date ?? ''} ${r.time ?? ''} ${r.app ?? ''} ${r.cat ?? ''} review=${r.review}`);
  if (bad.length) fail++;
}
const a = { amount: 60, date: '2026-10-16', time: '12:34', source: 'sms' };
const b = { amount: 60, date: '2026-10-16', time: '12:35', source: 'slip' };
console.log(isSameTxn(a, b) ? 'ok   dedup' : 'FAIL dedup');
process.exit(fail ? 1 : 0);
