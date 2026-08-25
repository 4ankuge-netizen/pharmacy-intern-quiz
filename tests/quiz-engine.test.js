import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterQuestions, getWeakPointQuestions, checkAnswer, shuffle } from '../js/quiz-engine.js';

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
