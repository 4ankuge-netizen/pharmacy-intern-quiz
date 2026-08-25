import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeCategoryAccuracy } from '../js/stats.js';

const categories = [
  { id: 'cancer', name: 'がん' },
  { id: 'diabetes', name: '糖尿病' },
];

const questions = [
  { id: 'a', category: 'cancer' },
  { id: 'b', category: 'cancer' },
  { id: 'c', category: 'diabetes' },
];

test('正答率が正しく計算される', () => {
  const history = {
    a: { lastResult: 'correct' },
    b: { lastResult: 'wrong' },
  };
  const result = computeCategoryAccuracy(questions, history, categories);
  const cancerStats = result.find((r) => r.categoryId === 'cancer');
  assert.equal(cancerStats.correct, 1);
  assert.equal(cancerStats.answered, 2);
  assert.equal(cancerStats.accuracyPercent, 50);
});

test('まだ1問も解いていないカテゴリーは0%になる', () => {
  const result = computeCategoryAccuracy(questions, {}, categories);
  const diabetesStats = result.find((r) => r.categoryId === 'diabetes');
  assert.equal(diabetesStats.answered, 0);
  assert.equal(diabetesStats.accuracyPercent, 0);
});
