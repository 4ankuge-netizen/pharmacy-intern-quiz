/*
  「この薬のIFで確認できた問題」を、mark-verified.mjs に渡せる形のJSONにする道具です。

  使い方:
    node tools/make-if-verify.mjs "<薬剤名>" <出力先JSON> [除外する問題ID ...]

  やること:
   - その薬を出典にしている未確認の問題を集める
   - 出典名を「<製品名> インタビューフォーム <章>」の形に整える
     (元の出典名には版数や会社名まで入っていて長いので、章だけ残す)
   - 実際に取得したIFのPDFのURLを出典URLにする

  ※ 中身を確認していない問題を混ぜないこと。確認できなかったIDは引数で除外する。
*/

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const QUESTIONS_PATH = join(HERE, '..', 'data', 'questions.json');
const IF_DIR = join(HERE, '..', '.pmda-if');
const toFileName = (n) => n.replace(/[^\p{L}\p{N}]/gu, '_').slice(0, 80);

function main() {
  const [drug, outPath, ...skip] = process.argv.slice(2);
  if (!drug || !outPath) {
    console.error('使い方: node tools/make-if-verify.mjs "<薬剤名>" <出力先JSON> [除外ID ...]');
    process.exit(1);
  }
  const metaPath = join(IF_DIR, `${toFileName(drug)}.meta.json`);
  if (!existsSync(metaPath)) {
    console.error(`IFが未取得です: ${drug}`);
    process.exit(1);
  }
  const meta = JSON.parse(readFileSync(metaPath, 'utf8'));

  const questions = JSON.parse(readFileSync(QUESTIONS_PATH, 'utf8'));
  const prefix = drug.split('(')[0];
  const out = [];
  for (const q of questions) {
    if (q.verified) continue;
    if (!String(q.source?.name || '').startsWith(prefix)) continue;
    if (skip.includes(q.id)) continue;
    // 「…インタビューフォーム(第26版・2025年9月改訂、○○社) Ⅶ-4.吸収」→「Ⅶ-4.吸収」
    const section = String(q.source.name).replace(/^.*?インタビューフォーム(\([^)]*\))?\s*/, '');
    out.push({ id: q.id, sourceName: `${drug} インタビューフォーム ${section}`.trim(), url: meta.ifUrl });
  }
  writeFileSync(outPath, JSON.stringify(out, null, 1) + '\n', 'utf8');
  console.log(`${out.length}問を書き出しました: ${outPath}`);
  out.forEach((o) => console.log('  ' + o.id));
}

main();
