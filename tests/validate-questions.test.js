import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateQuestion, validateQuestions } from '../js/validate-questions.js';
import { readFileSync } from 'node:fs';

test('正しい問題データはエラーが出ない', () => {
  const goodQuestion = {
    id: 'sample-001',
    category: 'cancer',
    difficulty: 'beginner',
    type: 'single',
    question: 'サンプル問題文',
    choices: ['A', 'B', 'C', 'D'],
    correctIndex: 0,
    explanation: 'サンプル解説',
    source: { name: 'サンプル資料', url: '', confirmedDate: '2026-08-25' },
  };
  const errors = validateQuestion(goodQuestion);
  assert.deepEqual(errors, []);
});

test('correctIndexがchoicesの範囲外だとエラーになる', () => {
  const badQuestion = {
    id: 'sample-002',
    category: 'cancer',
    difficulty: 'beginner',
    type: 'single',
    question: 'サンプル問題文',
    choices: ['A', 'B'],
    correctIndex: 5,
    explanation: 'サンプル解説',
    source: { name: 'サンプル資料', url: '', confirmedDate: '2026-08-25' },
  };
  const errors = validateQuestion(badQuestion);
  assert.ok(errors.some((e) => e.includes('correctIndex')));
});

test('difficultyが不正な値だとエラーになる', () => {
  const badQuestion = {
    id: 'sample-003',
    category: 'cancer',
    difficulty: 'super-hard',
    type: 'single',
    question: 'サンプル問題文',
    choices: ['A', 'B'],
    correctIndex: 0,
    explanation: 'サンプル解説',
    source: { name: 'サンプル資料', url: '', confirmedDate: '2026-08-25' },
  };
  const errors = validateQuestion(badQuestion);
  assert.ok(errors.some((e) => e.includes('difficulty')));
});

test('サンプルデータ全体が正しい形式になっている', () => {
  const raw = readFileSync(new URL('../data/questions-sample.json', import.meta.url));
  const questions = JSON.parse(raw);
  const results = validateQuestions(questions);
  assert.deepEqual(results, [], `不正なデータがあります: ${JSON.stringify(results)}`);
});
