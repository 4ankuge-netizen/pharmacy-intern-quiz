import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  filterQuestions,
  getWeakPointQuestions,
  checkAnswer,
  shuffle,
  pickRandomQuestions,
  shuffleChoices,
} from '../js/quiz-engine.js';

const sampleQuestions = [
  { id: 'a', category: 'cancer', difficulty: 'beginner', correctIndex: 0 },
  { id: 'b', category: 'cancer', difficulty: 'advanced', correctIndex: 1 },
  { id: 'c', category: 'diabetes', difficulty: 'beginner', correctIndex: 2 },
];

test('カテゴリーで絞り込める', () => {
  const result = filterQuestions(sampleQuestions, { categoryId: 'cancer' });
  assert.deepEqual(result.map((q) => q.id), ['a', 'b']);
});

test('難易度で絞り込める', () => {
  const result = filterQuestions(sampleQuestions, { difficulty: 'beginner' });
  assert.deepEqual(result.map((q) => q.id), ['a', 'c']);
});

test('カテゴリーと難易度を両方指定して絞り込める', () => {
  const result = filterQuestions(sampleQuestions, { categoryId: 'cancer', difficulty: 'advanced' });
  assert.deepEqual(result.map((q) => q.id), ['b']);
});

test('間違えた問題だけを取り出せる', () => {
  const result = getWeakPointQuestions(sampleQuestions, ['b', 'c']);
  assert.deepEqual(result.map((q) => q.id), ['b', 'c']);
});

test('正解の選択肢を選ぶとtrueになる', () => {
  assert.equal(checkAnswer(sampleQuestions[0], 0), true);
});

test('不正解の選択肢を選ぶとfalseになる', () => {
  assert.equal(checkAnswer(sampleQuestions[0], 1), false);
});

test('シャッフルしても中身の要素は変わらない(順番だけ変わる)', () => {
  const original = ['a', 'b', 'c', 'd'];
  const result = shuffle(original, () => 0);
  assert.deepEqual([...result].sort(), [...original].sort());
  assert.notDeepEqual(result, original); // 実際に順番が変わったことも確認する
});

// --- 問題プールからランダムに選ぶ ---

test('プールから指定した数だけ問題を選べる', () => {
  const pool = Array.from({ length: 50 }, (_, i) => ({ id: `q${i}` }));
  const picked = pickRandomQuestions(pool, 10);
  assert.equal(picked.length, 10);
});

test('選ばれた問題に同じものが混ざらない', () => {
  const pool = Array.from({ length: 50 }, (_, i) => ({ id: `q${i}` }));
  const picked = pickRandomQuestions(pool, 10);
  const uniqueIds = new Set(picked.map((q) => q.id));
  assert.equal(uniqueIds.size, 10);
});

test('プールの数が指定数より少ないときは、ある分だけ返す', () => {
  const pool = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.equal(pickRandomQuestions(pool, 10).length, 3);
});

test('プールが空なら空を返す', () => {
  assert.deepEqual(pickRandomQuestions([], 10), []);
});

test('選ぶたびに違う顔ぶれになりうる(元のプールを壊さない)', () => {
  const pool = Array.from({ length: 50 }, (_, i) => ({ id: `q${i}` }));
  const before = pool.map((q) => q.id);
  pickRandomQuestions(pool, 10);
  // 元の配列の順番や中身が変わっていないこと
  assert.deepEqual(pool.map((q) => q.id), before);
});

// --- 選択肢の並び替え ---

test('選択肢を並び替えても、正解の中身は変わらない', () => {
  const question = {
    choices: ['ア', 'イ', 'ウ', 'エ'],
    correctIndex: 0, // 正解は「ア」
  };
  const result = shuffleChoices(question, () => 0);
  // 並び替え後の正解の位置にある文字が、元の正解と同じであること
  assert.equal(result.choices[result.correctIndex], 'ア');
});

test('選択肢を並び替えても、選択肢の顔ぶれは変わらない', () => {
  const question = { choices: ['ア', 'イ', 'ウ', 'エ'], correctIndex: 2 };
  const result = shuffleChoices(question, () => 0);
  assert.deepEqual([...result.choices].sort(), ['ア', 'イ', 'ウ', 'エ'].sort());
});

test('選択肢の並び替えは、実際に順番を変える', () => {
  const question = { choices: ['ア', 'イ', 'ウ', 'エ'], correctIndex: 0 };
  const result = shuffleChoices(question, () => 0);
  assert.notDeepEqual(result.choices, question.choices);
});

test('選択肢の並び替えは、元の問題データを書き換えない', () => {
  const question = { choices: ['ア', 'イ', 'ウ', 'エ'], correctIndex: 0 };
  shuffleChoices(question, () => 0);
  assert.deepEqual(question.choices, ['ア', 'イ', 'ウ', 'エ']);
  assert.equal(question.correctIndex, 0);
});
