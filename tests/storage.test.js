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

// ---------------------------------------------------------------------------
// 利用者(プロフィール)ごとに記録が分かれることの確認。
// 1台の端末を実習生が交代で使うため、ここが混ざると成績が意味をなさなくなる
// ---------------------------------------------------------------------------

test('最初に使うときは利用者が1人用意される', () => {
  const storage = createStorage(createFakeBackend());
  const profiles = storage.listProfiles();
  assert.equal(profiles.length, 1);
  assert.equal(storage.getCurrentProfile().id, profiles[0].id);
});

test('利用者を追加すると、その人に切り替わる', () => {
  const storage = createStorage(createFakeBackend());
  const added = storage.addProfile('田中');
  assert.equal(storage.listProfiles().length, 2);
  assert.equal(storage.getCurrentProfile().id, added.id);
  assert.equal(storage.getCurrentProfile().name, '田中');
});

test('利用者が違えば学習履歴は混ざらない', () => {
  const storage = createStorage(createFakeBackend());
  const first = storage.getCurrentProfile().id;

  storage.recordAnswer('q1', true, '2026-08-25');

  storage.addProfile('2人目'); // 追加すると2人目に切り替わる
  assert.deepEqual(storage.getHistory(), {}); // 2人目の履歴は空

  storage.recordAnswer('q2', false, '2026-08-25');
  assert.deepEqual(storage.getWrongQuestionIds(), ['q2']);

  storage.switchProfile(first); // 1人目に戻す
  assert.equal(storage.getHistory().q1.lastResult, 'correct');
  assert.equal(storage.getHistory().q2, undefined);
});

test('利用者が違えばブックマークと連続日数も混ざらない', () => {
  const storage = createStorage(createFakeBackend());
  const first = storage.getCurrentProfile().id;
  storage.toggleBookmark('q1');
  storage.updateStreakOnAnswer('2026-08-25');

  storage.addProfile('2人目');
  assert.deepEqual(storage.getBookmarkIds(), []);
  assert.equal(storage.getStreak(), 0);

  storage.switchProfile(first);
  assert.deepEqual(storage.getBookmarkIds(), ['q1']);
  assert.equal(storage.getStreak(), 1);
});

test('利用者を削除すると、その人の記録も消える', () => {
  const backend = createFakeBackend();
  const storage = createStorage(backend);
  const first = storage.getCurrentProfile().id;
  const second = storage.addProfile('2人目');
  storage.recordAnswer('q1', true, '2026-08-25');

  assert.equal(storage.deleteProfile(second.id), true);
  assert.equal(storage.listProfiles().length, 1);
  // 削除した人が使用中だったので、残った人に切り替わっている
  assert.equal(storage.getCurrentProfile().id, first);
  // 削除した人の履歴は残っていない
  assert.deepEqual(storage.getHistoryOf(second.id), {});
});

test('利用者が1人しかいないときは削除できない', () => {
  const storage = createStorage(createFakeBackend());
  const only = storage.getCurrentProfile().id;
  assert.equal(storage.deleteProfile(only), false);
  assert.equal(storage.listProfiles().length, 1);
});

test('利用者の名前を変更できる(空の名前は受け付けない)', () => {
  const storage = createStorage(createFakeBackend());
  const id = storage.getCurrentProfile().id;
  assert.equal(storage.renameProfile(id, '佐藤'), true);
  assert.equal(storage.getCurrentProfile().name, '佐藤');
  assert.equal(storage.renameProfile(id, '   '), false);
  assert.equal(storage.getCurrentProfile().name, '佐藤');
});

test('利用者を分ける前のデータは、1人目に引き継がれる', () => {
  const backend = createFakeBackend();
  // 利用者の区別が無かった頃の形式で、あらかじめ履歴を置いておく
  backend.setItem('pharmacyQuiz.history', JSON.stringify({ q1: { lastResult: 'correct', correctCount: 1, wrongCount: 0 } }));

  const storage = createStorage(backend);
  assert.equal(storage.getHistory().q1.lastResult, 'correct');
});

test('今の利用者の記録だけを消せる', () => {
  const storage = createStorage(createFakeBackend());
  storage.recordAnswer('q1', true, '2026-08-25');
  storage.toggleBookmark('q1');
  storage.clearCurrentProgress();
  assert.deepEqual(storage.getHistory(), {});
  assert.deepEqual(storage.getBookmarkIds(), []);
  assert.equal(storage.getStreak(), 0);
  // 利用者そのものは残っている
  assert.equal(storage.listProfiles().length, 1);
});
