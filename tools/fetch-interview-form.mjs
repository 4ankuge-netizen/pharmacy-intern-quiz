/*
  PMDAから「医薬品インタビューフォーム(IF)」のPDFを取ってきて、
  検索できるテキストにして保存する道具です。

  使い方:
    node tools/fetch-interview-form.mjs <薬剤名> [<薬剤名> ...]
    node tools/fetch-interview-form.mjs --from-file <1行1薬剤名のファイル>
    node tools/fetch-interview-form.mjs --all      (取得済み添付文書のぶん全部)

  添付文書とIFの違い:
    添付文書は「使うときに必ず読む短い文書」、IFは「その裏づけまで書いた分厚い資料」です。
    上級の問題は、作用機序の詳細・受容体への結合性・薬物動態(AUCなど)といった
    IFにしか載っていない内容を問うものが多いので、IFが必要になります。

  やり方:
   1. .pmda-cache/<薬剤名>.json に保存してある添付文書のURLからYJコードを取り出す
      例: .../go/pack/2171022F1029_4_07/  →  2171022F1029_4
   2. PMDAの製品詳細ページを開き、そこに並んでいるPDFリンクからIFのURLを拾う
      (IFのURLは .../go/interview/ を含む)
   3. PDFをダウンロードし、pdftotext でテキストにして .pmda-if/ に保存する

  ※ 添付文書と同じく、PMDAへ短い間隔で連続アクセスしないよう1件ごとに待ちを入れます。
*/

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(HERE, '..', '.pmda-cache');
const IF_DIR = join(HERE, '..', '.pmda-if');

const UA = 'Mozilla/5.0 (compatible; pharmacy-quiz-verifier/1.0)';
const WAIT_MS = 1500;

const toFileName = (n) => n.replace(/[^\p{L}\p{N}]/gu, '_').slice(0, 80);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 添付文書のURLから、製品詳細ページに使う「YJコード_版番号」を取り出す
function detailIdFromPackUrl(packUrl) {
  // .../go/pack/2171022F1029_4_07/?view=body&lang=ja  →  2171022F1029_4
  const m = String(packUrl).match(/\/go\/pack\/([0-9A-Za-z]+)_(\d+)_(\d+)\//);
  if (!m) return null;
  return `${m[1]}_${m[2]}`;
}

async function findInterformUrl(detailId) {
  const url = `https://www.pmda.go.jp/PmdaSearch/rdDetail/iyaku/${detailId}?user=1`;
  const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
  if (!res.ok) return null;
  const html = await res.text();
  // ページ内のリンクから、IFのPDF( /go/interview/ を含むもの)を拾う
  const m = html.match(/https:\/\/www\.info\.pmda\.go\.jp\/go\/interview\/[^"']+\.pdf/);
  return m ? m[0] : null;
}

async function fetchOne(drugName) {
  const base = join(IF_DIR, toFileName(drugName));
  if (existsSync(`${base}.txt`)) return { drugName, status: 'すでに保存済み' };

  const docPath = join(CACHE_DIR, `${toFileName(drugName)}.json`);
  if (!existsSync(docPath)) return { drugName, status: '添付文書が未取得' };
  const doc = JSON.parse(readFileSync(docPath, 'utf8'));
  if (!doc.packUrl) return { drugName, status: '添付文書のURLがない' };

  const detailId = detailIdFromPackUrl(doc.packUrl);
  if (!detailId) return { drugName, status: 'URLからYJコードを読み取れない' };

  const ifUrl = await findInterformUrl(detailId);
  if (!ifUrl) return { drugName, status: 'IFのリンクが見つからず' };

  const res = await fetch(ifUrl, { headers: { 'User-Agent': UA } });
  if (!res.ok) return { drugName, status: `IFの取得に失敗 (${res.status})` };
  const buf = Buffer.from(await res.arrayBuffer());
  if (!existsSync(IF_DIR)) mkdirSync(IF_DIR, { recursive: true });
  writeFileSync(`${base}.pdf`, buf);

  // PDFを検索できるテキストへ。-layout は段組みの読み順を保ちやすくするため
  try {
    execFileSync('pdftotext', ['-layout', '-enc', 'UTF-8', `${base}.pdf`, `${base}.txt`]);
  } catch (e) {
    return { drugName, status: `pdftotextに失敗: ${e.message}` };
  }

  const text = readFileSync(`${base}.txt`, 'utf8');
  writeFileSync(
    `${base}.meta.json`,
    JSON.stringify({ drugName, ifUrl, packUrl: doc.packUrl, fetchedAt: new Date().toISOString(), textLength: text.length }, null, 1),
    'utf8'
  );
  return { drugName, status: `取得 (${text.length.toLocaleString()} 文字)`, ifUrl };
}

async function main() {
  const args = process.argv.slice(2);
  let names = [];
  if (args[0] === '--from-file') {
    names = readFileSync(args[1], 'utf8').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  } else if (args[0] === '--all') {
    names = readdirSync(CACHE_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => JSON.parse(readFileSync(join(CACHE_DIR, f), 'utf8')).drugName)
      .filter(Boolean);
  } else {
    names = args;
  }
  if (names.length === 0) {
    console.error('使い方: node tools/fetch-interview-form.mjs <薬剤名> / --from-file <ファイル> / --all');
    process.exit(1);
  }

  const counts = { 取得: 0, 済: 0, 失敗: 0 };
  for (const name of names) {
    const r = await fetchOne(name);
    console.log(`${r.status.padEnd(18)} ${name}`);
    if (r.status.startsWith('取得')) counts.取得 += 1;
    else if (r.status === 'すでに保存済み') counts.済 += 1;
    else counts.失敗 += 1;
    if (!r.status.startsWith('すでに')) await sleep(WAIT_MS);
  }
  console.log(`\n取得 ${counts.取得} / 保存済み ${counts.済} / 取れず ${counts.失敗}`);
  console.log(`保存先: ${IF_DIR}`);
}

main();
