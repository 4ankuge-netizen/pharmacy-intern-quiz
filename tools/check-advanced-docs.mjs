/*
  上級の「添付文書・インタビューフォームを出典にした未確認問題」を、
  まとめて資料と突き合わせるための道具です。

  使い方:
    node tools/check-advanced-docs.mjs --from 0 --count 20     (未確認の先頭から20問)
    node tools/check-advanced-docs.mjs --drug "キイトルーダ点滴静注"
    node tools/check-advanced-docs.mjs --category cancer --count 15

  やり方:
   1. 出典に「添付文書」と書いてあれば添付文書を、
      「インタビューフォーム」と書いてあればIFを先に見る(なければもう一方も見る)
   2. 正解の文から特徴的な語(数値・英字・カタカナ・漢字熟語)を取り出す
   3. その語が資料本文のどこにあるかを短く表示する

  出力の ○ は「語が見つかった」だけの意味です。
  本当に正解の内容と合っているかは、表示された文を読んで判断すること。
*/

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const QUESTIONS_PATH = join(HERE, '..', 'data', 'questions.json');
const IF_DIR = join(HERE, '..', '.pmda-if');
const CACHE_DIR = join(HERE, '..', '.pmda-cache');
const toFileName = (n) => n.replace(/[^\p{L}\p{N}]/gu, '_').slice(0, 80);

// 略語表や目次にばかり当たる語、どの資料にもある語は手がかりから外す
const STOP = new Set([
  'こと', 'もの', 'ため', 'ある', 'ない', 'する', 'される', 'られる', '場合', '患者',
  '投与', '本剤', '使用', '記載', '報告', '可能', '必要', '注意', '治療', '効果',
]);

function keywordsOf(text) {
  const out = [];
  const add = (s) => {
    const t = s.trim();
    if (t.length >= 2 && !STOP.has(t) && !out.includes(t)) out.push(t);
  };
  // 数値つきの語がいちばん確実(言い換えが効かないため)
  for (const m of text.matchAll(/[0-9０-９][0-9０-９.,]*\s*(?:%|％|倍|mg|μg|mL|時間|日|週|例|点|kg|mEq|mmHg)/g)) add(m[0].replace(/\s+/g, ''));
  for (const m of text.matchAll(/[一-龥]{4,}/g)) add(m[0]);
  for (const m of text.matchAll(/[ァ-ヴ][ァ-ヴー]{4,}/g)) add(m[0]);
  for (const m of text.matchAll(/[A-Za-z][A-Za-z0-9\-]{2,14}/g)) add(m[0]);
  for (const m of text.matchAll(/[一-龥]{3}/g)) add(m[0]);
  return out.slice(0, 6);
}

function loadBodies(drug, prefersIF) {
  const list = [];
  const ifPath = join(IF_DIR, `${toFileName(drug)}.txt`);
  const docPath = join(CACHE_DIR, `${toFileName(drug)}.txt`);
  const ifDoc = existsSync(ifPath) ? { kind: 'IF', text: readFileSync(ifPath, 'utf8').replace(/\s+/g, ' ') } : null;
  const insert = existsSync(docPath) ? { kind: '添付文書', text: readFileSync(docPath, 'utf8').replace(/\s+/g, ' ') } : null;
  // 出典に書いてあるほうを先に見る
  if (prefersIF) { if (ifDoc) list.push(ifDoc); if (insert) list.push(insert); }
  else { if (insert) list.push(insert); if (ifDoc) list.push(ifDoc); }
  return list;
}

function main() {
  const args = process.argv.slice(2);
  const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
  const from = Number(opt('--from', 0));
  const count = Number(opt('--count', 20));
  const onlyDrug = opt('--drug', null);
  const onlyCat = opt('--category', null);

  const questions = JSON.parse(readFileSync(QUESTIONS_PATH, 'utf8'));
  let targets = questions.filter(
    (q) => !q.verified && q.difficulty === 'advanced' && /添付文書|インタビューフォーム/.test(String(q.source?.name || ''))
  );
  if (onlyCat) targets = targets.filter((q) => q.category === onlyCat);
  if (onlyDrug) targets = targets.filter((q) => String(q.source.name).startsWith(onlyDrug));
  else targets = targets.slice(from, from + count);

  console.log(`対象 ${targets.length} 問\n`);
  for (const q of targets) {
    const name = String(q.source.name);
    const drug = name.split(/インタビューフォーム|添付文書/)[0].trim();
    const prefersIF = /インタビューフォーム/.test(name);
    const bodies = loadBodies(drug, prefersIF);
    const answer = q.choices[q.correctIndex];
    console.log('─'.repeat(58));
    console.log(`${q.id}  ／ ${name.slice(0, 60)}`);
    console.log(`正解: ${answer.slice(0, 130)}`);
    if (bodies.length === 0) { console.log('  × 資料が未取得'); continue; }

    const kws = keywordsOf(answer);
    let hit = null;
    for (const kw of kws) {
      for (const b of bodies) {
        const i = b.text.indexOf(kw);
        if (i >= 0) { hit = { kw, b, i }; break; }
      }
      if (hit) break;
    }
    if (!hit) { console.log(`  × 手がかり(${kws.join('/')})が見つからず`); continue; }
    console.log(`  ○[${hit.b.kind}]「${hit.kw}」 …${hit.b.text.slice(Math.max(0, hit.i - 150), hit.i + hit.kw.length + 250)}…`);
  }
}

main();
