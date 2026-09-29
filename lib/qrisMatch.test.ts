import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  amountKey,
  eventFingerprint,
  minuteFromCallback,
  minuteFromMutasi,
  telegramFromRef,
} from './qrisMatch.ts';

test('mutasi & callback menghasilkan menit yang sama (dedupe lintas sumber)', () => {
  const a = minuteFromMutasi('2026-07-09 11:05:00');
  const b = minuteFromCallback('09/07/2026 11:05');
  assert.ok(a !== null && b !== null);
  assert.equal(a, b);
  // inilah yang mencegah satu pembayaran di-credit dua kali oleh callback+mutasi
  assert.equal(
    eventFingerprint('MERCH', 10000, a),
    eventFingerprint('MERCH', '10000.00', b)
  );
});

test('detik di mutasi tidak menggeser menit', () => {
  assert.equal(minuteFromMutasi('2026-07-09 11:05:59'), minuteFromMutasi('2026-07-09 11:05:00'));
});

test('waktu tidak bisa diparse -> null, tidak ditebak', () => {
  assert.equal(minuteFromMutasi('bukan tanggal'), null);
  assert.equal(minuteFromCallback(''), null);
  assert.equal(eventFingerprint('MERCH', 10000, null), null);
});

test('nominal & menit berbeda -> fingerprint berbeda', () => {
  const m = minuteFromMutasi('2026-07-09 11:05:00');
  assert.notEqual(eventFingerprint('MERCH', 10000, m), eventFingerprint('MERCH', 20000, m));
  assert.notEqual(
    eventFingerprint('MERCH', 10000, m),
    eventFingerprint('MERCH', 10000, minuteFromMutasi('2026-07-09 11:06:00'))
  );
  assert.notEqual(
    eventFingerprint('MERCH', 10000, m),
    eventFingerprint('OTHER', 10000, m)
  );
});

test('amountKey menormalkan ke 2 desimal dan menolak nilai rusak', () => {
  assert.equal(amountKey(10000), '10000.00');
  assert.equal(amountKey('10000'), '10000.00');
  assert.equal(amountKey('10000.5'), '10000.50');
  assert.equal(amountKey('abc'), '');
  assert.equal(eventFingerprint('MERCH', 'abc', 1), null);
});

test('nomor telepon tidak dianggap id Telegram, id Telegram dianggap', () => {
  // referensi produksi: nomor telepon berulang -> bukan telegram id
  assert.equal(telegramFromRef('021112616662_021112616662'), null);
  assert.equal(telegramFromRef(''), null);
  assert.equal(telegramFromRef(null), null);
  assert.equal(telegramFromRef('ref-biru-123456789'), '123456789');
  assert.equal(telegramFromRef('123456789 / 6281234567890'), '123456789');
});
