/*
  問題データの選択肢の並び順を、いったん機械的に混ぜ直す道具です。

  使い方:
    node tools/shuffle-choices.mjs [--dry-run]

  なぜ必要か:
    問題文を書き直していくと、どうしても「正解を1番目に書く」癖が出て、
    正解の位置が0番目に偏ってしまいます。
    アプリは出題のたびに選択肢を並び替えるので実害は出にくいのですが、
    「中身を読まずに位置で当てられる」状態をデータとして残さないために、
    保存されている並び順そのものも散らしておきます。

  混ぜ方:
    問題ID から決まる種(seed)を使って混ぜます。同じデータに何度実行しても
    同じ結果になるので、あとから差分を追いやすくなります。
*/

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateQuestions } from '../js/validate-questions.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const QUESTIONS_PATH = join(HERE, '..', 'data', 'questions.json');

// 問題IDから種(数値)を作る
function seedFrom(id) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0 || 1;
}

// 同じ種なら必ず同じ並びになる乱数(xorshift32)
function makeRandom(seed) {
  let x = seed;
  return () => {
    x ^= x << 13; x >>>= 0;
    x ^= x >> 17;
    x ^= x << 5; x >>>= 0;
    return x / 0x100000000;
  };
}

function main() {
  const dryRun = process.argv.includes('--dry-run');
  const questions = JSON.parse(readFileSync(QUESTIONS_PATH, 'utf8'));

  for (const q of questions) {
    const answer = q.choices[q.correctIndex];
    const rnd = makeRandom(seedFrom(q.id));
    const shuffled = [...q.choices];
    // Fisher-Yates シャッフル
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    q.choices = shuffled;
    q.correctIndex = shuffled.indexOf(answer);
  }

  const counts = [0, 0, 0, 0];
  questions.forEach((q) => { counts[q.correctIndex] += 1; });
  console.log(`正解の位置の分布: ${counts.join(' / ')} (目安 ${Math.round(questions.length / 4)} 前後)`);

  const problems = validateQuestions(questions);
  if (problems.length > 0) {
    console.error('データに問題が見つかったため書き込みを中止しました:');
    console.error(JSON.stringify(problems.slice(0, 5), null, 2));
    process.exit(1);
  }

  if (dryRun) { console.log('--dry-run のため書き込みませんでした。'); return; }
  writeFileSync(QUESTIONS_PATH, JSON.stringify(questions, null, 1) + '\n', 'utf8');
  console.log('選択肢の並び順を混ぜ直しました。');
}

main();
