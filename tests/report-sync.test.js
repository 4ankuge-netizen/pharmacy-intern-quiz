// 成績の自動送信まわり(report-sync.js)のテストです。
// 「送る必要があるかどうか」の判断だけを切り出してあるので、そこを確かめます。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { needsSending, lastSentKey } from '../js/report-sync.js';

test('前回と同じ内容なら送らない', () => {
  const code = 'PQZ1~2026-09-11~3~a11.2!3';
  assert.equal(needsSending(code, code), false);
});

test('内容が変わっていれば送る', () => {
  assert.equal(needsSending('PQZ1~2026-09-11~3~a11.2!3', 'PQZ1~2026-09-11~3~a11.2.4!3'), true);
});

test('一度も送っていなければ送る', () => {
  assert.equal(needsSending(null, 'PQZ1~2026-09-11~1~a11'), true);
});

test('1問も答えていない状態は送らない', () => {
  // 末尾(問題の部分)が空の符号
  assert.equal(needsSending(null, 'PQZ1~2026-09-11~0~'), false);
});

test('中身が空なら送らない', () => {
  assert.equal(needsSending(null, ''), false);
  assert.equal(needsSending(null, null), false);
});

test('覚えておく場所の名前は利用者ごとに分かれる', () => {
  assert.notEqual(lastSentKey('p1'), lastSentKey('p2'));
  assert.ok(lastSentKey('p1').includes('p1'));
});
