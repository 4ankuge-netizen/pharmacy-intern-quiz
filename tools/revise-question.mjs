/*
  資料(添付文書など)の記載に合うように、問題文や選択肢を直す道具です。

  使い方:
    node tools/revise-question.mjs <修正内容を書いたJSONファイル>

  渡すJSONの形:
    [
      {
        "id": "hypertension-beginner-019",
        "question": "インダパミドが主に作用する腎臓の部位はどれか。",   // 省略可
        "choices": ["遠位尿細管", "ヘンレ係蹄", "集合管", "糸球体"],   // 省略可
        "correctAnswer": "遠位尿細管",                                  // choices を変えたら必須
        "explanation": "…",                                            // 省略可
        "reason": "添付文書の薬効分類名は「非チアジド系」であり、…"      // 必須(なぜ直したか)
      }
    ]

  この道具がやること:
   - 変更前の内容を docs/question-revisions.md に残してから書き換える
   - correctAnswer(正解の文言)から correctIndex を計算し直す
   - 書き込む前にデータ全体を点検する

  ※ 変更履歴を必ず残すのは、あとから「なぜこの問題文になったのか」を
     たどれるようにするため。医療系の内容なので、勝手に書き換わった状態を作らない。
*/

import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateQuestions } from '../js/validate-questions.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const QUESTIONS_PATH = join(HERE, '..', 'data', 'questions.json');
const LOG_PATH = join(HERE, '..', 'docs', 'question-revisions.md');

function todayLocalDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function main() {
  const path = process.argv[2];
  if (!path) {
    console.error('使い方: node tools/revise-question.mjs <修正内容を書いたJSONファイル>');
    process.exit(2);
  }

  const revisions = JSON.parse(readFileSync(path, 'utf8'));
  const questions = JSON.parse(readFileSync(QUESTIONS_PATH, 'utf8'));
  const byId = new Map(questions.map((q) => [q.id, q]));
  const today = todayLocalDate();

  if (!existsSync(LOG_PATH)) {
    writeFileSync(LOG_PATH,
      '# 問題文の修正履歴\n\n' +
      '資料(添付文書・公的機関の公開資料)の記載に合わせて問題文や選択肢を直した記録です。\n' +
      '**変更前の内容をすべて残しています。** あとから見直したり元に戻したりできるようにするためです。\n\n' +
      '修正は `node tools/revise-question.mjs` で行い、この記録は自動で追記されます。\n',
      'utf8');
  }

  let count = 0;
  const entries = [];
  for (const r of revisions) {
    const q = byId.get(r.id);
    if (!q) { console.error(`問題が見つかりません: ${r.id}`); process.exit(1); }
    if (!r.reason) { console.error(`reason(なぜ直したか)が必要です: ${r.id}`); process.exit(1); }

    const before = {
      question: q.question,
      choices: [...q.choices],
      correctAnswer: q.choices[q.correctIndex],
      explanation: q.explanation,
    };

    if (r.question) q.question = r.question;
    if (r.choices) {
      if (!r.correctAnswer) {
        console.error(`choices を変える場合は correctAnswer(正解の文言)が必要です: ${r.id}`);
        process.exit(1);
      }
      q.choices = r.choices;
    }
    if (r.correctAnswer) {
      const idx = q.choices.indexOf(r.correctAnswer);
      if (idx === -1) {
        console.error(`correctAnswer が choices の中にありません: ${r.id} / ${r.correctAnswer}`);
        process.exit(1);
      }
      q.correctIndex = idx;
    }
    if (r.explanation) q.explanation = r.explanation;

    // 変更前の内容を控えておく(書き込みが成功したあとでまとめて記録する)
    const entry = [
      `\n## ${r.id}  (${today})`,
      '',
      `**直した理由**: ${r.reason}`,
      '',
      '### 変更前',
      `- 問題: ${before.question}`,
      `- 選択肢: ${before.choices.join(' / ')}`,
      `- 正解: ${before.correctAnswer}`,
      `- 解説: ${before.explanation}`,
      '',
      '### 変更後',
      `- 問題: ${q.question}`,
      `- 選択肢: ${q.choices.join(' / ')}`,
      `- 正解: ${q.choices[q.correctIndex]}`,
      `- 解説: ${q.explanation}`,
      '',
    ].join('\n');
    entries.push(entry);
    count++;
  }

  const problems = validateQuestions(questions);
  if (problems.length > 0) {
    console.error('データに問題が見つかったため書き込みを中止しました:');
    console.error(JSON.stringify(problems.slice(0, 5), null, 2));
    process.exit(1);
  }

  writeFileSync(QUESTIONS_PATH, JSON.stringify(questions, null, 1) + '\n', 'utf8');

  /*
    変更履歴は、問題データの書き込みが成功したあとで残す。
    先に書いてしまうと、途中で入力の誤りに気づいて中止したときに
    「実際には変えていない変更」が履歴に残ってしまうため。
  */
  for (const entry of entries) appendFileSync(LOG_PATH, entry, 'utf8');
  console.log(`修正した問題: ${count}問`);
  console.log(`変更履歴: ${LOG_PATH}`);
}

main();
