// 成績を短い文字列にまとめる部品(report-code.js)のテストです。
// 「まとめて → 元に戻したら、同じ成績になる」ことを確かめるのが中心です。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { encodeReport, decodeReport, parsePastedReports } from '../js/report-code.js';

const questions = JSON.parse(readFileSync(new URL('../data/questions.json', import.meta.url), 'utf8'));
const categories = JSON.parse(readFileSync(new URL('../data/categories.json', import.meta.url), 'utf8'));

// 履歴を手早く作るための小さな道具
function makeHistory(pairs) {
  const history = {};
  for (const [id, result] of pairs) {
    history[id] = {
      correctCount: result === 'correct' ? 1 : 0,
      wrongCount: result === 'correct' ? 0 : 1,
      lastResult: result,
      lastAnsweredAt: '2026-09-11',
    };
  }
  return history;
}

test('問題IDはすべて「カテゴリー-難易度-3桁の番号」の形になっている', () => {
  // この形を前提に短い文字列へ置き換えているので、崩れていないか確かめる
  const broken = questions.filter((q) => !/-\d{3}$/.test(q.id));
  assert.equal(broken.length, 0, `形が違うID: ${broken.slice(0, 3).map((q) => q.id).join(', ')}`);
});

test('まとめてから元に戻すと、同じ正誤に戻る', () => {
  const history = makeHistory([
    ['cancer-beginner-001', 'correct'],
    ['cancer-beginner-002', 'correct'],
    ['cancer-beginner-003', 'wrong'],
    ['prescription-query-advanced-004', 'wrong'],
    ['national-exam-intermediate-012', 'correct'],
  ]);

  const code = encodeReport({ history, questions, categories, date: '2026-09-11', streak: 7 });
  const back = decodeReport(code, categories);

  assert.equal(back.date, '2026-09-11');
  assert.equal(back.streak, 7);
  assert.equal(back.answeredCount, 5);
  for (const id of Object.keys(history)) {
    assert.equal(back.history[id].lastResult, history[id].lastResult, id);
  }
});

test('全問回答した場合でも、元どおりに戻る', () => {
  // 1問おきに正解・不正解を入れて、いちばん重い状態を作る
  const history = {};
  questions.forEach((q, index) => {
    history[q.id] = {
      correctCount: index % 2 === 0 ? 1 : 0,
      wrongCount: index % 2 === 0 ? 0 : 1,
      lastResult: index % 2 === 0 ? 'correct' : 'wrong',
      lastAnsweredAt: '2026-09-11',
    };
  });

  const code = encodeReport({ history, questions, categories, date: '2026-09-11', streak: 30 });
  const back = decodeReport(code, categories);

  assert.equal(back.answeredCount, questions.length);
  for (const q of questions) {
    assert.equal(back.history[q.id].lastResult, history[q.id].lastResult, q.id);
  }
});

test('連続した番号はまとめられ、文字数が短くなる', () => {
  const ids = questions.filter((q) => q.category === 'cancer' && q.difficulty === 'beginner').slice(0, 20);
  const history = makeHistory(ids.map((q) => [q.id, 'correct']));
  const code = encodeReport({ history, questions, categories, date: '2026-09-11', streak: 1 });

  // 20問ぶんの番号を並べるより、ずっと短くなっているはず
  assert.ok(code.length < 60, `思ったより長い: ${code}`);
  assert.equal(decodeReport(code, categories).answeredCount, 20);
});

test('1問も答えていなくても、まとめて元に戻せる', () => {
  const code = encodeReport({ history: {}, questions, categories, date: '2026-09-11', streak: 0 });
  const back = decodeReport(code, categories);
  assert.equal(back.answeredCount, 0);
  assert.deepEqual(back.history, {});
});

test('おかしな文字列は受け付けない', () => {
  for (const bad of ['', 'こんにちは', 'PQZ9~2026-09-11~1~a11', 'PQZ1~2026-09-11', 'PQZ1~2026/09/11~1~a11', 'PQZ1~2026-09-11~-3~a11', 'PQZ1~2026-09-11~1~z91']) {
    assert.equal(decodeReport(bad, categories), null, `受け付けてはいけない: ${bad}`);
  }
});

test('表計算から貼り付けた複数行をまとめて読み取れる', () => {
  const a = encodeReport({
    history: makeHistory([['cancer-beginner-001', 'correct']]),
    questions, categories, date: '2026-09-01', streak: 3,
  });
  const b = encodeReport({
    history: makeHistory([['ethics-beginner-002', 'wrong']]),
    questions, categories, date: '2026-09-05', streak: 8,
  });

  const pasted = [
    `2026/09/01 10:00:00\t田中\t${a}`,
    `2026/09/05 18:30:00\t佐藤\t${b}`,
    '', // 空行は読み飛ばす
    'これは成績データではない行',
  ].join('\n');

  const { reports, skipped } = parsePastedReports(pasted, categories);
  assert.equal(reports.length, 2);
  assert.equal(skipped, 1);
  assert.equal(reports[0].name, '田中');
  assert.equal(reports[0].streak, 3);
  assert.equal(reports[1].name, '佐藤');
  assert.equal(reports[1].history['ethics-beginner-002'].lastResult, 'wrong');
});

test('名前の列がなくても読み取れる', () => {
  const code = encodeReport({
    history: makeHistory([['cancer-beginner-001', 'correct']]),
    questions, categories, date: '2026-09-01', streak: 1,
  });
  const { reports } = parsePastedReports(code, categories);
  assert.equal(reports.length, 1);
  assert.equal(reports[0].name, '(名前なし)');
});
