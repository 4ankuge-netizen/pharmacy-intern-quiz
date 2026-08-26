/*
  問題と、公的機関の公開ページ(取得済み)の関係しそうな部分を並べて表示する道具です。

  ガイドラインのPDFが読めない問題を、公的機関がWebで公開している解説ページで
  確認するときに使います。

  使い方:
    node tools/show-with-web.mjs <対応表のJSONファイル>

  渡すJSONの形:
    [ { "id": "hypertension-beginner-030", "page": "NCVC_高血圧" }, ... ]
    ("page" は .guideline-cache/ に保存済みの名前。fetch-web-source.mjs で取得する)

  ※ 表示されるのは「問題文と正解に出てくる言葉を含む行」だけです。
     根拠が出てこなければ、そのページでは確認できないということ。
*/

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(HERE, '..', '.guideline-cache');
const toFileName = (n) => n.replace(/[^\p{L}\p{N}]/gu, '_').slice(0, 80);

// 文章を3文字ずつのかたまりに切り出す(助詞だけのかたまりなどは手がかりにならないので除く)
function ngrams(text) {
  const cleaned = text.replace(/[、。()（）「」・,.\s]+/g, '');
  const stop = /^[はがのにをでとやもへか、。ですますこれそれどれのはとしてれかいるあるためよいれる]+$/;
  const out = new Set();
  for (let i = 0; i + 3 <= cleaned.length; i++) {
    const g = cleaned.slice(i, i + 3);
    if (!stop.test(g)) out.add(g);
  }
  return [...out];
}

function main() {
  const pairs = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  const questions = JSON.parse(readFileSync(join(HERE, '..', 'data', 'questions.json'), 'utf8'));
  const byId = new Map(questions.map((q) => [q.id, q]));

  for (const p of pairs) {
    const q = byId.get(p.id);
    console.log('─'.repeat(66));
    if (!q) { console.log(`${p.id}: 問題が見つかりません`); continue; }
    console.log(`${p.id}`);
    console.log(`Q: ${q.question}`);
    console.log(`答: ${q.choices[q.correctIndex]}`);

    const base = join(CACHE_DIR, toFileName(p.page));
    if (!existsSync(`${base}.txt`)) { console.log(`【${p.page}: 未取得】`); continue; }
    const text = readFileSync(`${base}.txt`, 'utf8');

    /*
      探す言葉の作り方。

      日本語の文は英語と違って単語の間に空白がないので、記号で区切るだけでは
      文がまるごと1つの「言葉」になってしまい、何にも一致しない。
      そこで、問題文と正解を3文字ずつずらしながら切り出して手がかりにする
      (「心房細動が」→「心房細」「房細動」「細動が」…)。
      こうすると、言い回しが多少違っても共通する部分で拾える。
    */
    const keywords = p.keywords ? p.keywords : ngrams(q.question + q.choices[q.correctIndex]);

    const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 4);
    const hits = lines
      .map((line) => ({ line, n: keywords.filter((k) => line.includes(k)).length }))
      .filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n)
      .slice(0, Number(p.max) || 6);

    if (hits.length === 0) { console.log('  → 該当する記述が見つかりません'); continue; }
    for (const h of hits) console.log(`  [${h.n}] ${h.line.slice(0, 260)}`);
  }
}

main();
