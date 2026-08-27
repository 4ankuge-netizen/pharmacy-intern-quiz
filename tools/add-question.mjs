/*
  問題を新しく追加する道具です。

  使い方:
    node tools/add-question.mjs <追加する問題を書いたJSONファイル>

  渡すJSONの形:
    [
      {
        "category": "hypertension",
        "difficulty": "intermediate",
        "question": "…",
        "choices": ["…", "…", "…", "…"],
        "correctAnswer": "…",          // choices の中の文言
        "explanation": "…",
        "source": { "name": "…", "url": "…" },   // url は省略可(書籍・ガイドライン)
        "verified": true,               // 出典を確認済みなら true
        "note": "…"                     // 追加した経緯(任意、履歴に残す)
      }
    ]

  この道具がやること:
   - そのカテゴリー・難易度の中で次に空いている番号のIDを付ける
   - correctAnswer から correctIndex を計算する
   - 書き込む前にデータ全体を点検する
   - 追加した内容を docs/question-revisions.md に記録する

  ※ 記録を残すのは、あとから「なぜこの問題が入ったのか」をたどれるようにするため。
*/

import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateQuestions } from '../js/validate-questions.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const QUESTIONS_PATH = join(HERE, '..', 'data', 'questions.json');
const LOG_PATH = join(HERE, '..', 'docs', 'question-revisions.md');

function todayLocalDate() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

// そのカテゴリー・難易度で、まだ使われていない一番小さい番号を探す
function nextId(questions, category, difficulty) {
  const used = new Set();
  for (const q of questions) {
    if (q.category !== category || q.difficulty !== difficulty) continue;
    const m = q.id.match(/-(\d{3})$/);
    if (m) used.add(Number(m[1]));
  }
  let n = 1;
  while (used.has(n)) n++;
  return `${category}-${difficulty}-${String(n).padStart(3, '0')}`;
}

function main() {
  const path = process.argv[2];
  if (!path) {
    console.error('使い方: node tools/add-question.mjs <追加する問題を書いたJSONファイル>');
    process.exit(2);
  }

  const additions = JSON.parse(readFileSync(path, 'utf8'));
  const questions = JSON.parse(readFileSync(QUESTIONS_PATH, 'utf8'));
  const today = todayLocalDate();
  const entries = [];
  const added = [];

  for (const a of additions) {
    for (const key of ['category', 'difficulty', 'question', 'choices', 'correctAnswer', 'explanation', 'source']) {
      if (!a[key]) { console.error(`${key} が必要です`); process.exit(1); }
    }
    const idx = a.choices.indexOf(a.correctAnswer);
    if (idx === -1) {
      console.error(`correctAnswer が choices の中にありません: ${a.correctAnswer}`);
      process.exit(1);
    }
    const id = nextId(questions, a.category, a.difficulty);
    const q = {
      id,
      category: a.category,
      difficulty: a.difficulty,
      type: 'single',
      question: a.question,
      choices: a.choices,
      correctIndex: idx,
      explanation: a.explanation,
      source: { name: a.source.name, url: a.source.url || '', confirmedDate: today },
      verified: a.verified === true,
    };
    questions.push(q);
    added.push(id);
    entries.push([
      `\n## ${id}  (${today}) 【新規追加】`, '',
      `**追加した理由**: ${a.note || '(記載なし)'}`, '',
      `- 問題: ${q.question}`,
      `- 選択肢: ${q.choices.join(' / ')}`,
      `- 正解: ${q.choices[q.correctIndex]}`,
      `- 解説: ${q.explanation}`,
      `- 出典: ${q.source.name}${q.source.url ? ' / ' + q.source.url : ''}`,
      `- 確認済み: ${q.verified ? 'はい' : 'いいえ'}`, '',
    ].join('\n'));
  }

  const problems = validateQuestions(questions);
  if (problems.length > 0) {
    console.error('データに問題が見つかったため書き込みを中止しました:');
    console.error(JSON.stringify(problems.slice(0, 5), null, 2));
    process.exit(1);
  }

  writeFileSync(QUESTIONS_PATH, JSON.stringify(questions, null, 1) + '\n', 'utf8');
  for (const e of entries) appendFileSync(LOG_PATH, e, 'utf8');

  console.log(`追加した問題: ${added.length}問 (${added.join(', ')})`);
  console.log(`問題総数: ${questions.length}問`);
}

main();
