/*
  「この問題を、この添付文書と突き合わせたい」を指定して中身を並べる道具です。

  出典に書かれた薬剤名では添付文書が見つからない問題(「抗菌薬」のような
  総称や、一般名では検索に当たらない薬)を確認するときに使います。

  使い方:
    node tools/show-with-doc.mjs <対応表のJSONファイル>

  渡すJSONの形:
    [ { "id": "infection-beginner-005", "drug": "バクタ配合錠" }, ... ]
    ("drug" は .pmda-cache/ に保存済みの名前)
*/

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(HERE, '..', '.pmda-cache');

const toFileName = (n) => n.replace(/[^\p{L}\p{N}]/gu, '_').slice(0, 80);

// 添付文書は番号付きの見出しで区切られているので、その見出しを狙って切り出す
const ANCHORS = {
  '効能': /\n\s*4\.\s*効能又は効果/,
  '用法': /\n\s*6\.\s*用法及び用量/,
  '用法注意': /\n\s*7\.\s*用法及び用量に関連する注意/,
  '禁忌': /\n\s*2\.\s*禁忌/,
  '基本的注意': /\n\s*8\.\s*重要な基本的注意/,
  '相互作用': /\n\s*10\.\s*相互作用/,
  '副作用': /11\.1\s*重大な副作用/,
  '薬効薬理': /18\.1\s*作用機序/,
};

function main() {
  const pairs = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  const want = process.argv[3] ? process.argv[3].split(',') : null;
  const questions = JSON.parse(readFileSync(join(HERE, '..', 'data', 'questions.json'), 'utf8'));
  const byId = new Map(questions.map((q) => [q.id, q]));

  for (const p of pairs) {
    const q = byId.get(p.id);
    console.log('─'.repeat(70));
    if (!q) { console.log(`${p.id}: 問題が見つかりません`); continue; }
    console.log(`${p.id}  [${q.category}]`);
    console.log(`Q: ${q.question}`);
    console.log(`選択肢: ${q.choices.join(' / ')}`);
    console.log(`正解: ${q.choices[q.correctIndex]}`);
    console.log(`解説: ${q.explanation}`);

    const base = join(CACHE_DIR, toFileName(p.drug));
    if (!existsSync(`${base}.txt`)) { console.log(`【${p.drug}: 未取得】`); continue; }
    const doc = JSON.parse(readFileSync(`${base}.json`, 'utf8'));
    const text = readFileSync(`${base}.txt`, 'utf8');
    console.log(`文書: ${String(doc.selectedProductName || '').replace(/\s*\.\.\.$/, '')}`);
    const cls = text.match(/薬効分類名\s*([^\n]{1,60})/);
    if (cls) console.log(`[薬効分類名] ${cls[1].trim()}`);

    for (const key of want || ['効能']) {
      const a = ANCHORS[key];
      if (!a) continue;
      const m = text.match(a);
      if (!m) { console.log(`[${key}] (見つからず)`); continue; }
      const len = Number(p.len) || 700;
      console.log(`[${key}] ${text.slice(m.index, m.index + len).replace(/\n+/g, ' ')}`);
    }
    console.log();
  }
}

main();
