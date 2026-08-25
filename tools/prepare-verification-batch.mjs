/*
  問題と、その根拠になるはずの添付文書の該当箇所を並べて表示する道具です。
  これを見ながら「問題の内容が資料と合っているか」を判断します。

  使い方:
    node tools/prepare-verification-batch.mjs --difficulty beginner --offset 0 --count 15

  仕組み:
   - 出典から薬剤名を取り出し、.pmda-cache/ に保存済みの添付文書を探す
   - 問題文・選択肢・正解・解説と、添付文書の関連しそうな部分を並べて出す

  ※ 添付文書がまだ取れていない問題は飛ばします(先に fetch-pmda-documents.mjs で取得)。
*/

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractDrugName } from './list-drugs-to-fetch.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(HERE, '..', '.pmda-cache');

function toFileName(drugName) {
  return drugName.replace(/[^\p{L}\p{N}]/gu, '_').slice(0, 80);
}

// 問題の内容から、添付文書のどの項目を見るべきか見当をつける。
// 関係の薄い項目まで出すと読む量が増えるだけなので、上位2つに絞る。
function guessRelevantSections(question) {
  const t = question.question + ' ' + question.explanation;
  const picks = [];
  if (/禁忌|投与しない|避け/.test(t)) picks.push('禁忌');
  if (/併用/.test(t)) picks.push('相互作用');
  if (/用法|用量|投与量|回数|減量/.test(t)) picks.push('用法及び用量');
  if (/副作用|有害|初期症状/.test(t)) picks.push('副作用');
  if (/機序|作用|阻害|拮抗|分類|薬効/.test(t)) picks.push('薬効薬理');
  if (/妊婦|授乳|小児|高齢者/.test(t)) picks.push('特定の背景');
  // 「何に使う薬か」を問う問題が多いので、効能・効果は基本の確認先として常に含める
  picks.push('効能又は効果');
  return [...new Set(picks)].slice(0, 2);
}

// 添付文書の抜粋から、問題に関係しそうな行だけを拾って短くする
function condense(section, question, maxChars) {
  const lines = section.split('\n').map((l) => l.trim()).filter(Boolean);
  // 問題文・解説に出てくる特徴的な言葉(3文字以上のかたまり)を手がかりにする
  const keywords = (question.question + question.explanation)
    .split(/[、。()（）「」\s,.]/)
    .filter((w) => w.length >= 3);

  const scored = lines.map((line) => ({
    line,
    hits: keywords.filter((k) => line.includes(k)).length,
  }));
  const relevant = scored.filter((s) => s.hits > 0).map((s) => s.line);
  // 手がかりが見つからなければ、項目の冒頭を出す(見出し直後に要点があることが多い)
  const chosen = relevant.length > 0 ? relevant : lines;
  return chosen.join('\n').slice(0, maxChars);
}

function main() {
  const args = process.argv.slice(2);
  const get = (flag, fallback) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : fallback);
  const difficulty = get('--difficulty', null);
  const offset = Number(get('--offset', 0));
  const count = Number(get('--count', 15));
  const onlyUnverified = !args.includes('--include-verified');

  const questions = JSON.parse(readFileSync(join(HERE, '..', 'data', 'questions.json'), 'utf8'));
  let pool = questions;
  if (difficulty) pool = pool.filter((q) => q.difficulty === difficulty);
  if (onlyUnverified) pool = pool.filter((q) => !q.verified);

  // 添付文書が手元にある問題だけを対象にする
  const ready = [];
  for (const q of pool) {
    const drug = extractDrugName(q.source.name);
    if (!drug) continue;
    const file = join(CACHE_DIR, `${toFileName(drug)}.json`);
    if (!existsSync(file)) continue;
    const doc = JSON.parse(readFileSync(file, 'utf8'));
    if (doc.notFound || !doc.packUrl) continue;
    ready.push({ q, drug, doc });
  }

  const batch = ready.slice(offset, offset + count);
  console.log(`# 検証バッチ  (対象 ${ready.length}問中 ${offset + 1}〜${offset + batch.length}問目)\n`);

  for (const { q, drug, doc } of batch) {
    console.log('─'.repeat(70));
    console.log(`${q.id}  [${q.category}/${q.difficulty}]`);
    console.log(`Q: ${q.question}`);
    console.log(`正解: ${q.choices[q.correctIndex]}`);
    console.log(`解説: ${q.explanation}`);
    console.log(`文書: ${doc.selectedProductName.replace(/\s*\.\.\.$/, '')}`);
    console.log(`URL: ${doc.packUrl}`);

    for (const key of guessRelevantSections(q)) {
      const section = doc.sections?.[key];
      if (section) {
        console.log(`[${key}] ${condense(section, q, 420).replace(/\n+/g, ' / ')}`);
      }
    }
    console.log();
  }

  console.log('='.repeat(78));
  console.log(`このバッチ: ${batch.length}問 / 添付文書が手元にある未確認の問題: ${ready.length}問`);
}

main();
