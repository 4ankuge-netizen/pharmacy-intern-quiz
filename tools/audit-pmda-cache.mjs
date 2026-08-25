/*
  取ってきた添付文書が、本当にその薬のものかを点検する道具です。

  「クロニジン」を探したのに「アプラクロニジン」の添付文書を掴む、といった
  取り違えが起きうるため、保存済みのものをまとめて洗い直します。

  使い方:
    node tools/audit-pmda-cache.mjs
*/

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(HERE, '..', '.pmda-cache');

const KATAKANA = /[ァ-ヶー]/;

// 薬名が「より長い別の薬名の一部」として現れていないかを見る
function appearsStandalone(text, needle) {
  let from = 0;
  while (true) {
    const at = text.indexOf(needle, from);
    if (at === -1) return false;
    const before = at > 0 ? text[at - 1] : '';
    if (!KATAKANA.test(before)) return true;
    from = at + 1;
  }
}

function main() {
  const files = readdirSync(CACHE_DIR).filter((f) => f.endsWith('.json') && f !== 'drug-list.json');
  const suspicious = [];
  let ok = 0, notFound = 0;

  for (const f of files) {
    const doc = JSON.parse(readFileSync(join(CACHE_DIR, f), 'utf8'));
    if (doc.notFound || !doc.packUrl) { notFound++; continue; }

    const stem = doc.drugName.replace(/(錠|カプセル|注射液|注|細粒|顆粒|散|液).*$/, '').trim();
    const needle = stem.length >= 3 ? stem : doc.drugName;
    const textFile = join(CACHE_DIR, f.replace(/\.json$/, '.txt'));
    let text = '';
    try { text = readFileSync(textFile, 'utf8'); } catch { /* 本文が無ければ判定できない */ }

    if (!text) { suspicious.push({ drug: doc.drugName, product: doc.selectedProductName, reason: '本文が保存されていない' }); continue; }

    if (!appearsStandalone(text, needle)) {
      suspicious.push({
        drug: doc.drugName,
        product: doc.selectedProductName,
        reason: `「${needle}」が別の薬名の一部としてしか出てこない`,
      });
      continue;
    }
    // 単剤を探しているのに配合剤を掴んでいないか
    if (/配合(錠|剤|カプセル|顆粒)/.test(doc.selectedProductName || '') && !/配合/.test(doc.drugName)) {
      suspicious.push({ drug: doc.drugName, product: doc.selectedProductName, reason: '単剤を探したが配合剤を取得' });
      continue;
    }
    ok++;
  }

  console.log(`点検した添付文書: ${files.length}件`);
  console.log(`  問題なし: ${ok}件 / 見つからず: ${notFound}件 / 要確認: ${suspicious.length}件`);
  if (suspicious.length > 0) {
    console.log('\n要確認:');
    suspicious.forEach((s) => console.log(`  ${s.drug} -> ${s.product}\n    理由: ${s.reason}`));
  }
}

main();
