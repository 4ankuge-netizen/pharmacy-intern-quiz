/*
  「PMDAの資料で内容を確認できた問題」に確認済みの印を付ける道具です。

  使い方:
    node tools/mark-verified.mjs <判定を書いたJSONファイル>

  渡すJSONの形(確認できた問題だけを並べる):
    [
      { "id": "cancer-beginner-001", "sourceName": "アプレピタントカプセル 添付文書(効能・効果)",
        "url": "https://www.info.pmda.go.jp/go/pack/xxxx/?view=body&lang=ja" },
      ...
    ]

  この道具がやること:
   - 指定された問題の verified を true にする
   - source.url と source.confirmedDate(確認した日)を記録する
   - sourceName が指定されていれば、実際に見た資料名に更新する

  ※ 確認できなかった問題は触りません。verified を false から true にするのは、
     必ず人(または一次資料を実際に読んだうえでの判断)を通します。
*/

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateQuestions } from '../js/validate-questions.js';
import { extractDrugName } from './list-drugs-to-fetch.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const QUESTIONS_PATH = join(HERE, '..', 'data', 'questions.json');
const CACHE_DIR = join(HERE, '..', '.pmda-cache');

// その問題の出典にあたる、取得済みの添付文書を読み込む
function loadCachedDoc(question) {
  const drug = extractDrugName(question.source.name);
  if (!drug) return null;
  const file = join(CACHE_DIR, `${drug.replace(/[^\p{L}\p{N}]/gu, '_').slice(0, 80)}.json`);
  if (!existsSync(file)) return null;
  const doc = JSON.parse(readFileSync(file, 'utf8'));
  return doc.notFound || !doc.packUrl ? null : doc;
}

function todayLocalDate() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function main() {
  const decisionsPath = process.argv[2];
  if (!decisionsPath) {
    console.error('使い方: node tools/mark-verified.mjs <判定を書いたJSONファイル>');
    process.exit(2);
  }

  const decisions = JSON.parse(readFileSync(decisionsPath, 'utf8'));
  const questions = JSON.parse(readFileSync(QUESTIONS_PATH, 'utf8'));
  const byId = new Map(questions.map((q) => [q.id, q]));

  const today = todayLocalDate();
  let updated = 0;
  const missing = [];

  for (const d of decisions) {
    const q = byId.get(d.id);
    if (!q) { missing.push(d.id); continue; }

    // URLと資料名が省略されていれば、取得済みの添付文書から補う。
    // (検証は、その保存済みの文書を実際に読んで行っているため一致する)
    let url = d.url;
    let sourceName = d.sourceName;

    // 書籍(教科書・成書)を出典にする場合はURLがない。
    // うっかりURLを書き忘れた場合と区別するため、noUrl を明示したときだけ許す。
    if (d.noUrl) {
      if (!sourceName) {
        console.error(`書籍を出典にする場合は sourceName(書名・版・ページ)が必要です: ${d.id}`);
        process.exit(1);
      }
      url = '';
    } else if (!url) {
      const doc = loadCachedDoc(q);
      if (!doc) {
        console.error(`URLが指定されておらず、添付文書も見つかりません: ${d.id}`);
        process.exit(1);
      }
      url = doc.packUrl;
      const product = String(doc.selectedProductName || '').replace(/\s*\.\.\.$/, '').trim();
      // 「どの製品の、どの項目で確認したか」が後から分かる形にする
      sourceName = sourceName || `${product} 添付文書${d.section ? ' ' + d.section : ''}`;
    }

    q.verified = true;
    q.source.url = url;
    q.source.confirmedDate = d.confirmedDate || today;
    if (sourceName) q.source.name = sourceName;
    updated++;
  }

  if (missing.length > 0) {
    console.error(`次のIDが問題データに見つかりません: ${missing.join(', ')}`);
    process.exit(1);
  }

  // 書き込む前に、データ全体が決まりに合っているか点検する
  const problems = validateQuestions(questions);
  if (problems.length > 0) {
    console.error('データに問題が見つかったため書き込みを中止しました:');
    console.error(JSON.stringify(problems.slice(0, 5), null, 2));
    process.exit(1);
  }

  writeFileSync(QUESTIONS_PATH, JSON.stringify(questions, null, 1) + '\n', 'utf8');

  const verifiedTotal = questions.filter((q) => q.verified).length;
  console.log(`確認済みにした問題: ${updated}問`);
  console.log(`確認済みの合計: ${verifiedTotal} / ${questions.length}問`);
}

main();
