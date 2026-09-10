import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateQuestion, validateQuestions, VALID_CATEGORY_IDS } from '../js/validate-questions.js';
import { readFileSync } from 'node:fs';

// 各テストで使う「正しい1問」のひな形。
// 一部だけ書き換えて「この項目が不正だとエラーになるか」を確かめる
function makeQuestion(overrides = {}) {
  return {
    id: 'sample-001',
    category: 'cancer',
    difficulty: 'beginner',
    type: 'single',
    question: 'サンプル問題文',
    choices: ['A', 'B', 'C', 'D'],
    correctIndex: 0,
    explanation: 'サンプル解説',
    source: { name: 'サンプル資料', url: '', confirmedDate: '2026-08-25' },
    verified: false,
    ...overrides,
  };
}

test('正しい問題データはエラーが出ない', () => {
  const errors = validateQuestion(makeQuestion());
  assert.deepEqual(errors, []);
});

test('verified が真偽値でないとエラーになる', () => {
  const errors = validateQuestion(makeQuestion({ verified: 'yes' }));
  assert.ok(errors.some((e) => e.includes('verified')));
});

test('verified が書かれていないとエラーになる', () => {
  const q = makeQuestion();
  delete q.verified;
  const errors = validateQuestion(q);
  assert.ok(errors.some((e) => e.includes('verified')));
});

test('カテゴリー名の打ち間違いがエラーになる', () => {
  // 正しくは diabetes。1文字違いでも見逃さないこと
  const errors = validateQuestion(makeQuestion({ category: 'diabetis' }));
  assert.ok(errors.some((e) => e.includes('category')));
});

test('決められた10個のカテゴリーはすべて通る', () => {
  for (const id of VALID_CATEGORY_IDS) {
    const errors = validateQuestion(makeQuestion({ category: id }));
    assert.deepEqual(errors, [], `${id} でエラーが出ました`);
  }
});

test('カテゴリー一覧がcategories.jsonと一致している', () => {
  const raw = readFileSync(new URL('../data/categories.json', import.meta.url));
  const idsInFile = JSON.parse(raw).map((c) => c.id);
  assert.deepEqual([...VALID_CATEGORY_IDS].sort(), idsInFile.sort());
});

test('IDが重複しているとエラーになる', () => {
  const questions = [
    makeQuestion({ id: 'dup-001' }),
    makeQuestion({ id: 'dup-001' }),
  ];
  const results = validateQuestions(questions);
  assert.ok(
    results.some((r) => r.errors.some((e) => e.includes('重複'))),
    `重複が検出されませんでした: ${JSON.stringify(results)}`
  );
});

test('IDが重複していなければ通る', () => {
  const questions = [
    makeQuestion({ id: 'uniq-001' }),
    makeQuestion({ id: 'uniq-002' }),
  ];
  assert.deepEqual(validateQuestions(questions), []);
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

test('correctIndexがNaNだとエラーになる', () => {
  const badQuestion = {
    id: 'sample-004',
    category: 'cancer',
    difficulty: 'beginner',
    type: 'single',
    question: 'サンプル問題文',
    choices: ['A', 'B', 'C', 'D'],
    correctIndex: NaN,
    explanation: 'サンプル解説',
    source: { name: 'サンプル資料', url: '', confirmedDate: '2026-08-25' },
  };
  const errors = validateQuestion(badQuestion);
  assert.ok(errors.some((e) => e.includes('correctIndex')));
});

test('correctIndexが小数だとエラーになる', () => {
  const badQuestion = {
    id: 'sample-005',
    category: 'cancer',
    difficulty: 'beginner',
    type: 'single',
    question: 'サンプル問題文',
    choices: ['A', 'B', 'C', 'D'],
    correctIndex: 1.5,
    explanation: 'サンプル解説',
    source: { name: 'サンプル資料', url: '', confirmedDate: '2026-08-25' },
  };
  const errors = validateQuestion(badQuestion);
  assert.ok(errors.some((e) => e.includes('correctIndex')));
});

test('本番の問題データ全体が正しい形式になっている', () => {
  const raw = readFileSync(new URL('../data/questions.json', import.meta.url));
  const questions = JSON.parse(raw);
  const results = validateQuestions(questions);
  assert.deepEqual(results, [], `不正なデータがあります: ${JSON.stringify(results.slice(0, 5))}`);
});

test('正解の位置が特定の場所に偏っていない', () => {
  // 以前のデータは全問「正解が1番目」だった。取り込み時に並び替えたので、
  // それぞれの位置にだいたい均等に散らばっているはず。
  // (偏っていると、中身を読まずに位置だけで答えられてしまう)
  //
  // 選択肢が4つの問題と、5つの問題(国家試験の必須問題)が混ざっているので、
  // 「選択肢の数」ごとに分けて偏りを見る。まとめて数えると、
  // 4択には無い5番目の位置のぶんだけ数が合わなくなってしまう。
  const raw = readFileSync(new URL('../data/questions.json', import.meta.url));
  const questions = JSON.parse(raw);

  const countsByLength = new Map();
  questions.forEach((q) => {
    const size = q.choices.length;
    if (!countsByLength.has(size)) countsByLength.set(size, new Array(size).fill(0));
    countsByLength.get(size)[q.correctIndex] += 1;
  });

  for (const [size, counts] of countsByLength) {
    const total = counts.reduce((sum, n) => sum + n, 0);
    const expected = total / size;
    counts.forEach((count, position) => {
      assert.ok(
        count > expected * 0.7 && count < expected * 1.3,
        `${size}択のうち、正解が${position}番目の問題が${count}問と偏っています(目安は${Math.round(expected)}問前後)`
      );
    });
  }
});
