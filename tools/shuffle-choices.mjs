/*
  問題データの選択肢の並び順を整え直す道具です。

  使い方:
    node tools/shuffle-choices.mjs [--dry-run]

  なぜ必要か:
    問題文を書き直していくと、どうしても「正解を1番目に書く」癖が出て、
    正解の位置が0番目に偏ってしまいます。
    アプリは出題のたびに選択肢を並び替えるので実害は出にくいのですが、
    「中身を読まずに位置で当てられる」状態をデータとして残さないために、
    保存されている並び順そのものも散らしておきます。

  やり方:
    問題をID順に並べ、0番目・1番目・2番目・3番目…と順ぐりに正解の置き場所を
    決めて、そこへ正解を移します。乱数を使わないので、
     - 4つの位置にきっちり均等に散る
     - 何度実行しても同じ結果になる(差分を追いやすい)
    という2つを同時に満たせます。

  ※ 選択肢の並びに意味がある問題(「上記すべて」など)は今のところありません。
     もし作る場合は、この道具の対象から外す仕組みが必要になります。
*/

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateQuestions } from '../js/validate-questions.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const QUESTIONS_PATH = join(HERE, '..', 'data', 'questions.json');

function main() {
  const dryRun = process.argv.includes('--dry-run');
  const questions = JSON.parse(readFileSync(QUESTIONS_PATH, 'utf8'));

  // ID順に並べたときの順番で置き場所を決める(データ内の並び順に左右されないように)
  const order = [...questions].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  order.forEach((q, i) => {
    const target = i % q.choices.length;
    if (q.correctIndex === target) return;
    const choices = [...q.choices];
    // 正解と、置きたい場所にあるものを入れ替える
    [choices[q.correctIndex], choices[target]] = [choices[target], choices[q.correctIndex]];
    q.choices = choices;
    q.correctIndex = target;
  });

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
  console.log('選択肢の並び順を整え直しました。');
}

main();
