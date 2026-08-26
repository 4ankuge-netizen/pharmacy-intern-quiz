/*
  問題のIDを指定して、その問題の出典にあたる添付文書の中を検索する道具です。

  使い方:
    node tools/grep-doc.mjs <問題ID> <探したい言葉(正規表現)> [前後の文字数]

  例:
    node tools/grep-doc.mjs cancer-intermediate-025 "血栓塞栓|心筋梗塞"

  ※ 出典に書かれた薬剤名から .pmda-cache/ の保存済み文書を探します
     (mark-verified.mjs と同じ探し方)。
*/

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractDrugName } from './list-drugs-to-fetch.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

function main() {
  const [id, pattern, widthArg] = process.argv.slice(2);
  if (!id || !pattern) {
    console.error('使い方: node tools/grep-doc.mjs <問題ID> <探したい言葉> [前後の文字数]');
    process.exit(2);
  }
  const width = Number(widthArg) || 160;

  const questions = JSON.parse(readFileSync(join(HERE, '..', 'data', 'questions.json'), 'utf8'));
  const q = questions.find((x) => x.id === id);
  if (!q) { console.error(`問題が見つかりません: ${id}`); process.exit(1); }

  const drug = extractDrugName(q.source.name);
  const base = join(HERE, '..', '.pmda-cache', String(drug).replace(/[^\p{L}\p{N}]/gu, '_').slice(0, 80));
  if (!existsSync(`${base}.txt`)) { console.error(`添付文書が未取得です: ${drug}`); process.exit(1); }

  const doc = JSON.parse(readFileSync(`${base}.json`, 'utf8'));
  const text = readFileSync(`${base}.txt`, 'utf8');
  console.log(`# ${id}  文書: ${String(doc.selectedProductName || '').split('／')[0].trim()}`);

  const re = new RegExp(`.{0,${Math.floor(width / 3)}}(?:${pattern}).{0,${width}}`, 'g');
  const hits = [...text.matchAll(re)].slice(0, 5);
  if (hits.length === 0) { console.log('  該当なし'); return; }
  for (const h of hits) console.log('  -', h[0].replace(/\n+/g, ' ').replace(/\s+/g, ' '));
}

main();
