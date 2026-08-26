/*
  確認作業の進み具合と、残りの見積もりを出す道具です。

  使い方:
    node tools/verification-progress.mjs

  難易度別・出典の種類別に「確認済み / 残り」を数えます。
  出典の種類で分けるのは、添付文書由来はPMDAで確認できる一方、
  ガイドライン由来は別の手順が必要で、かかる手間が大きく違うためです。
*/

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractDrugName } from './list-drugs-to-fetch.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(HERE, '..', '.pmda-cache');

function sourceKind(name) {
  if (/添付文書/.test(name)) return '添付文書';
  if (/インタビューフォーム/.test(name)) return 'インタビューフォーム';
  if (/ガイドライン|指針|手引き|学会/.test(name)) return 'ガイドライン';
  return 'その他';
}

function hasCachedDoc(q) {
  const drug = extractDrugName(q.source.name);
  if (!drug) return false;
  const file = join(CACHE_DIR, `${drug.replace(/[^\p{L}\p{N}]/gu, '_').slice(0, 80)}.json`);
  if (!existsSync(file)) return false;
  const doc = JSON.parse(readFileSync(file, 'utf8'));
  return !doc.notFound && Boolean(doc.packUrl);
}

function main() {
  const questions = JSON.parse(readFileSync(join(HERE, '..', 'data', 'questions.json'), 'utf8'));
  const verified = questions.filter((q) => q.verified);

  console.log(`問題総数: ${questions.length}問`);
  console.log(`確認済み: ${verified.length}問 (${(verified.length / questions.length * 100).toFixed(1)}%)`);
  console.log(`残り:     ${questions.length - verified.length}問\n`);

  // 難易度別
  console.log('■ 難易度別');
  for (const level of ['beginner', 'intermediate', 'advanced']) {
    const all = questions.filter((q) => q.difficulty === level);
    const done = all.filter((q) => q.verified).length;
    console.log(`  ${level.padEnd(13)} ${String(done).padStart(4)} / ${String(all.length).padStart(4)}問`);
  }

  // 出典の種類別(残りのみ)
  console.log('\n■ 未確認分の出典の種類');
  const kinds = {};
  questions.filter((q) => !q.verified).forEach((q) => {
    const k = sourceKind(q.source.name);
    kinds[k] = (kinds[k] || 0) + 1;
  });
  Object.entries(kinds).sort((a, b) => b[1] - a[1]).forEach(([k, n]) => {
    console.log(`  ${k.padEnd(20)} ${String(n).padStart(4)}問`);
  });

  // すぐ着手できる分(添付文書が手元にある)
  const unverified = questions.filter((q) => !q.verified);
  const ready = unverified.filter(hasCachedDoc);
  console.log(`\n■ すぐ着手できる分(添付文書が取得済み): ${ready.length}問`);
  console.log(`  うち beginner: ${ready.filter((q) => q.difficulty === 'beginner').length}問`);
  console.log(`  うち intermediate: ${ready.filter((q) => q.difficulty === 'intermediate').length}問`);
  console.log(`  うち advanced: ${ready.filter((q) => q.difficulty === 'advanced').length}問`);

  // 添付文書をまだ取っていない薬の数
  const needFetch = new Set();
  unverified.forEach((q) => {
    const drug = extractDrugName(q.source.name);
    if (drug && !hasCachedDoc(q)) needFetch.add(drug);
  });
  console.log(`\n■ これから添付文書を取る必要がある薬: ${needFetch.size}種類`);
  const cached = existsSync(CACHE_DIR)
    ? readdirSync(CACHE_DIR).filter((f) => f.endsWith('.json')).length
    : 0;
  console.log(`  (取得済み: ${cached}件)`);
}

main();
