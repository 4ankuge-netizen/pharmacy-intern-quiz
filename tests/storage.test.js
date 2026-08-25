import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStorage } from '../js/storage.js';

// localStorage の代わりに使う、テスト用の「ふりの保存先」
function createFakeBackend() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, value),
  };
}

test('正解を記録すると履歴に反映される', () => {
  const storage = createStorage(createFakeBackend());
  storage.recordAnswer('q1', true, '2026-08-25');
  const history = storage.getHistory();
  assert.equal(history.q1.correctCount, 1);
  assert.equal(history.q1.lastResult, 'correct');
});

test('不正解の問題だけが弱点復習の対象になる', () => {
  const storage = createStorage(createFakeBackend());
  storage.recordAnswer('q1', true, '2026-08-25');
  storage.recordAnswer('q2', false, '2026-08-25');
  assert.deepEqual(storage.getWrongQuestionIds(), ['q2']);
});

test('同じ問題に再度正解すると弱点復習リストから外れる', () => {
  const storage = createStorage(createFakeBackend());
  storage.recordAnswer('q1', false, '2026-08-25');
  storage.recordAnswer('q1', true, '2026-08-26');
  assert.deepEqual(storage.getWrongQuestionIds(), []);
});

test('ブックマークの追加と解除ができる', () => {
  const storage = createStorage(createFakeBackend());
  storage.toggleBookmark('q1');
  assert.deepEqual(storage.getBookmarkIds(), ['q1']);
  storage.toggleBookmark('q1');
  assert.deepEqual(storage.getBookmarkIds(), []);
});

test('連続で学習するとストリークが増える', () => {
  const storage = createStorage(createFakeBackend());
  assert.equal(storage.updateStreakOnAnswer('2026-08-25'), 1);
  assert.equal(storage.updateStreakOnAnswer('2026-08-26'), 2);
  assert.equal(storage.updateStreakOnAnswer('2026-08-27'), 3);
});

test('1日空くとストリークが1に戻る', () => {
  const storage = createStorage(createFakeBackend());
  storage.updateStreakOnAnswer('2026-08-25');
  storage.updateStreakOnAnswer('2026-08-27'); // 26日をとばした
  assert.equal(storage.getStreak(), 1);
});

test('同じ日に何度答えてもストリークは増えない', () => {
  const storage = createStorage(createFakeBackend());
  storage.updateStreakOnAnswer('2026-08-25');
  storage.updateStreakOnAnswer('2026-08-25');
  assert.equal(storage.getStreak(), 1);
});
