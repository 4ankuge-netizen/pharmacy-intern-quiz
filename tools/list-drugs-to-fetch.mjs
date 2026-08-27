/*
  問題データの出典から薬剤名を取り出し、「これから添付文書を取ってくる薬の一覧」を作る道具です。

  使い方:
    node tools/list-drugs-to-fetch.mjs [--difficulty beginner] [--limit 100]

  同じ薬を出典にしている問題はまとめて検証できるので、
  「1つ取ってくると何問検証できるか」の多い順に並べます。
*/

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

// 出典から薬剤名を取り出す。添付文書・インタビューフォーム由来のものだけが対象。
// (ガイドライン由来の出典はPMDAの添付文書検索では確認できないため除く)
/*
  出典の書き方と、PMDAで実際に添付文書が見つかる製品名が違うことがある。
   - 「抗菌薬」「ステロイド外用薬」のように薬の種類でしか書かれていない
   - 一般名では検索に当たらない(チカグレロル錠 → 販売名はブリリンタ錠)
  その読み替え表が tools/drug-aliases.json。
*/
const ALIASES = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'drug-aliases.json'), 'utf8')
);

export function extractDrugName(sourceName) {
  if (!/添付文書|インタビューフォーム/.test(sourceName)) return null;
  let head = String(sourceName).split(/\s+/)[0];
  head = head.replace(/(添付文書|インタビューフォーム).*$/, '').trim();
  if (!head) return null;
  return ALIASES[head] || head;
}

function main() {
  const args = process.argv.slice(2);
  const difficulty = args.includes('--difficulty') ? args[args.indexOf('--difficulty') + 1] : null;
  const limit = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : Infinity;

  const questions = JSON.parse(readFileSync(join(HERE, '..', 'data', 'questions.json'), 'utf8'));
  const target = difficulty ? questions.filter((q) => q.difficulty === difficulty) : questions;

  const byDrug = new Map();
  for (const q of target) {
    const drug = extractDrugName(q.source.name);
    if (!drug) continue;
    if (!byDrug.has(drug)) byDrug.set(drug, 0);
    byDrug.set(drug, byDrug.get(drug) + 1);
  }

  const sorted = [...byDrug.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
  // 1行に1つの薬剤名。そのまま fetch-pmda-documents.mjs --from-file に渡せる形にする
  sorted.forEach(([drug]) => console.log(drug));
}

// このファイルを直接実行したときだけ一覧を出す。
// 他の道具から extractDrugName を読み込むだけのときは何も出力しない
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
