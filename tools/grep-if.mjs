/*
  取得済みのインタビューフォーム(IF)の本文から、キーワードの前後を切り出して見る道具です。

  使い方:
    node tools/grep-if.mjs <薬剤名> <正規表現> [前後の幅]

  例:
    node tools/grep-if.mjs "アムロジピン錠(ノルバスク)" "バイオアベイラビリティ"
    node tools/grep-if.mjs "アムロジピン錠(ノルバスク)" "解離" 400

  IFは100ページ以上あることも多いので、全部読まずに必要な箇所だけ取り出します。
  見つかった箇所は最大5件まで表示します。
*/

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const IF_DIR = join(HERE, '..', '.pmda-if');
const toFileName = (n) => n.replace(/[^\p{L}\p{N}]/gu, '_').slice(0, 80);

function main() {
  const [drug, pattern, widthArg] = process.argv.slice(2);
  if (!drug || !pattern) {
    console.error('使い方: node tools/grep-if.mjs <薬剤名> <正規表現> [前後の幅]');
    process.exit(1);
  }
  const width = Number(widthArg) || 300;
  const path = join(IF_DIR, `${toFileName(drug)}.txt`);
  if (!existsSync(path)) {
    console.error(`IFが未取得です: ${drug}`);
    console.error('先に node tools/fetch-interview-form.mjs "<薬剤名>" を実行してください。');
    process.exit(1);
  }

  // 改行やスペースが多いので、探すときは一続きの文字列に均してから見る
  const text = readFileSync(path, 'utf8').replace(/\s+/g, ' ');
  const re = new RegExp(pattern, 'g');
  let hit = 0;
  let m;
  while ((m = re.exec(text)) !== null && hit < 5) {
    hit += 1;
    const start = Math.max(0, m.index - width);
    console.log(`--- ${hit}件目 (位置 ${m.index})`);
    console.log(text.slice(start, m.index + m[0].length + width));
    console.log();
    if (m.index === re.lastIndex) re.lastIndex += 1; // 空マッチで止まらないように
  }
  if (hit === 0) console.log('該当なし');
}

main();
