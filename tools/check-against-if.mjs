/*
  「上級の問題」と「その薬のインタビューフォーム(IF)」を突き合わせるための下ごしらえをする道具です。

  使い方:
    node tools/check-against-if.mjs "<薬剤名>"        (出典の先頭がその薬の未確認問題を全部)
    node tools/check-against-if.mjs "<薬剤名>" <問題ID>

  やること:
   1. その薬を出典にしている未確認の問題を並べる
   2. 正解の選択肢から特徴的な語(数値・カタカナ語・英字など)を抜き出す
   3. その語をIF本文から探して、前後を表示する

  ねらい:
    上級の問題はIFの細かい記載(AUC、解離速度、試験名など)を問うものが多く、
    1問ずつ手で探すと時間がかかります。正解に出てくる特徴的な語を機械的に拾って
    IFの該当箇所を先に出しておくことで、「本当にそう書いてあるか」の確認に集中できます。

  ※ ここで出るのは「候補」です。最終的にIFの文章を読んで判断すること。
*/

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const QUESTIONS_PATH = join(HERE, '..', 'data', 'questions.json');
const IF_DIR = join(HERE, '..', '.pmda-if');
const toFileName = (n) => n.replace(/[^\p{L}\p{N}]/gu, '_').slice(0, 80);

// よく出るが手がかりにならない語は外す
const STOP = new Set(['ある', 'ない', 'こと', 'もの', 'ため', 'れる', 'られる', 'する', 'いる', 'される']);

/*
  正解の文から「探す手がかり」を作る。
  数字を含むかたまり(45%、10～40倍、CYP2C9 など)と、
  長めのカタカナ語・漢字語を優先して拾う。
*/
function keywordsOf(text) {
  const out = [];
  const add = (s) => {
    const t = s.trim();
    if (t.length >= 2 && !STOP.has(t) && !out.includes(t)) out.push(t);
  };
  // 数値まわり(単位つき)
  for (const m of text.matchAll(/[0-9０-９][0-9０-９.,～〜\-–]*\s*(?:%|％|倍|mg|μg|時間|例|mL|分)/g)) add(m[0].replace(/\s+/g, ''));
  // 英数字のかたまり(CYP2C9、AUC、E-3174 など)
  for (const m of text.matchAll(/[A-Za-z][A-Za-z0-9\-]{1,12}/g)) add(m[0]);
  // カタカナ語(4文字以上)
  for (const m of text.matchAll(/[ァ-ヴー]{4,}/g)) add(m[0]);
  // 漢字の熟語(3文字以上)
  for (const m of text.matchAll(/[一-龥]{3,}/g)) add(m[0]);
  return out.slice(0, 8);
}

function main() {
  const [drug, onlyId] = process.argv.slice(2);
  if (!drug) {
    console.error('使い方: node tools/check-against-if.mjs "<薬剤名>" [問題ID]');
    process.exit(1);
  }
  const ifPath = join(IF_DIR, `${toFileName(drug)}.txt`);
  if (!existsSync(ifPath)) {
    console.error(`IFが未取得です: ${drug}`);
    process.exit(1);
  }
  const body = readFileSync(ifPath, 'utf8').replace(/\s+/g, ' ');

  const questions = JSON.parse(readFileSync(QUESTIONS_PATH, 'utf8'));
  const targets = questions.filter(
    (q) => !q.verified && (onlyId ? q.id === onlyId : String(q.source?.name || '').startsWith(drug.split('(')[0]))
  );
  if (targets.length === 0) {
    console.log('対象の問題が見つかりませんでした。');
    return;
  }

  for (const q of targets) {
    console.log('='.repeat(70));
    console.log(`${q.id}`);
    console.log(`出典: ${q.source.name}`);
    console.log(`問: ${q.question}`);
    console.log(`正解: ${q.choices[q.correctIndex]}`);
    const kws = keywordsOf(q.choices[q.correctIndex]);
    console.log(`手がかり: ${kws.join(' / ')}`);
    let shown = 0;
    for (const kw of kws) {
      if (shown >= 2) break;
      const i = body.indexOf(kw);
      if (i < 0) continue;
      shown += 1;
      console.log(`\n  ▼ IF内「${kw}」の前後`);
      console.log('  ' + body.slice(Math.max(0, i - 220), i + kw.length + 320));
    }
    if (shown === 0) console.log('\n  ▼ 手がかりがIF本文で見つかりませんでした(手で探す必要あり)');
    console.log();
  }
}

main();
