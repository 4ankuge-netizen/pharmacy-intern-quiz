/*
  複数の薬について、「未確認の上級問題」と「その根拠がIF(または添付文書)のどこにあるか」を
  まとめて短く並べる道具です。

  使い方:
    node tools/check-if-batch.mjs "<薬剤名>" "<薬剤名>" ...
    node tools/check-if-batch.mjs --top 8          (未確認の問題が多い薬から8剤)

  なぜ必要か:
    上級には1剤あたり1〜3問しかない薬が150剤以上あります。
    1剤ずつ手で探すと時間がかかるので、
    「正解の文に出てくる特徴的な語」でIF本文を検索し、
    見つかった箇所だけを短く並べて、まとめて突き合わせられるようにします。

  出力の見方:
    ○ … 正解の中の語がIF本文で見つかった(前後の文を表示。中身は自分で読んで判断する)
    × … 見つからなかった(手で探すか、問題文の書き直しが必要)

  ※ ここで出るのは「候補」です。最終的な可否は必ず本文を読んで判断すること。
*/

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const QUESTIONS_PATH = join(HERE, '..', 'data', 'questions.json');
const IF_DIR = join(HERE, '..', '.pmda-if');
const CACHE_DIR = join(HERE, '..', '.pmda-cache');
const toFileName = (n) => n.replace(/[^\p{L}\p{N}]/gu, '_').slice(0, 80);

// 手がかりにならない一般語は外す
const STOP = new Set([
  'こと', 'もの', 'ため', 'これ', 'それ', 'ある', 'ない', 'する', 'される', 'られる',
  'および', 'または', '場合', '患者', '投与', '本剤', '使用', '記載', '報告', '可能',
]);

/*
  正解の文から「探す手がかり」を作る。
  数値つきの語 → 英数字 → 長いカタカナ → 漢字熟語 の順に優先する。
  数値は言い換えが効かないので、いちばん確実な手がかりになる。
*/
function keywordsOf(text) {
  const out = [];
  const add = (s) => {
    const t = s.trim();
    if (t.length >= 2 && !STOP.has(t) && !out.includes(t)) out.push(t);
  };
  for (const m of text.matchAll(/[0-9０-９][0-9０-９.,]*\s*(?:%|％|倍|mg|μg|mL|時間|日|週|例|点|kg)/g)) add(m[0].replace(/\s+/g, ''));
  for (const m of text.matchAll(/[A-Za-z][A-Za-z0-9\-]{2,14}/g)) add(m[0]);
  for (const m of text.matchAll(/[ァ-ヴ][ァ-ヴー]{4,}/g)) add(m[0]);
  for (const m of text.matchAll(/[一-龥]{4,}/g)) add(m[0]);
  for (const m of text.matchAll(/[一-龥]{3}/g)) add(m[0]);
  return out.slice(0, 6);
}

// IFを優先し、なければ添付文書の本文を使う
function loadBody(drug) {
  const ifPath = join(IF_DIR, `${toFileName(drug)}.txt`);
  if (existsSync(ifPath)) return { kind: 'IF', text: readFileSync(ifPath, 'utf8').replace(/\s+/g, ' ') };
  const docPath = join(CACHE_DIR, `${toFileName(drug)}.txt`);
  if (existsSync(docPath)) return { kind: '添付文書', text: readFileSync(docPath, 'utf8').replace(/\s+/g, ' ') };
  return null;
}

function main() {
  const args = process.argv.slice(2);
  const questions = JSON.parse(readFileSync(QUESTIONS_PATH, 'utf8'));

  let drugs = args;
  if (args[0] === '--top') {
    const n = Number(args[1]) || 8;
    const count = {};
    for (const q of questions) {
      if (q.verified || q.difficulty !== 'advanced') continue;
      const name = String(q.source?.name || '');
      if (!/添付文書|インタビューフォーム/.test(name)) continue;
      const d = name.split(/インタビューフォーム|添付文書/)[0].trim();
      count[d] = (count[d] || 0) + 1;
    }
    drugs = Object.entries(count).sort((a, b) => b[1] - a[1]).slice(0, n).map(([d]) => d);
  }

  for (const drug of drugs) {
    const body = loadBody(drug);
    console.log('#'.repeat(60));
    console.log(`■ ${drug}  [${body ? body.kind : '資料なし'}]`);
    if (!body) { console.log('  → 先にIFか添付文書を取得すること'); continue; }

    const targets = questions.filter(
      (q) => !q.verified && String(q.source?.name || '').startsWith(drug)
    );
    for (const q of targets) {
      const answer = q.choices[q.correctIndex];
      console.log(`\n[${q.id}] ${String(q.source.name).replace(/^.*?(インタビューフォーム|添付文書)(\([^)]*\))?\s*/, '').slice(0, 45)}`);
      console.log(`  正解: ${answer.slice(0, 150)}`);
      const kws = keywordsOf(answer);
      let shown = 0;
      for (const kw of kws) {
        if (shown >= 1) break;
        const i = body.text.indexOf(kw);
        if (i < 0) continue;
        shown += 1;
        console.log(`  ○「${kw}」: ...${body.text.slice(Math.max(0, i - 160), i + kw.length + 260)}...`);
      }
      if (shown === 0) console.log(`  × 手がかり(${kws.join('/')})が本文で見つからず`);
    }
    console.log();
  }
}

main();
