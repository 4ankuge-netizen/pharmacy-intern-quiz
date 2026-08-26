/*
  Web上で公開されている診療ガイドラインのPDFを取ってきて、
  文字を検索できる形(テキスト)にして保存する道具です。

  使い方:
    node tools/fetch-guideline.mjs <保存名> <PDFのURL>

  例:
    node tools/fetch-guideline.mjs 脳卒中GL2021改訂2025 https://www.jsts.gr.jp/img/....pdf

  仕組み:
   1. PDFをダウンロードする
   2. pdftotext でテキストに変換する(検索できるようにするため)
   3. .guideline-cache/ に PDFとテキストの両方を保存する

  添付文書と違い、ガイドラインは資料ごとに公開場所がばらばらなので、
  URLは人が調べて渡す前提の作りにしてある。

  ※ 有料の書籍として販売されているガイドラインは対象外。
     無料で公開されているものだけを扱う。
*/

import { writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(HERE, '..', '.guideline-cache');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

function toFileName(name) {
  return name.replace(/[^\p{L}\p{N}]/gu, '_').slice(0, 80);
}

async function main() {
  const [name, url] = process.argv.slice(2);
  if (!name || !url) {
    console.error('使い方: node tools/fetch-guideline.mjs <保存名> <PDFのURL>');
    process.exit(2);
  }
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });

  const base = join(CACHE_DIR, toFileName(name));
  const pdfPath = `${base}.pdf`;
  const txtPath = `${base}.txt`;

  if (existsSync(txtPath)) {
    console.log(`すでに保存済み: ${txtPath}`);
    return;
  }

  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) {
    console.error(`取得できませんでした (${res.status}): ${url}`);
    process.exit(1);
  }
  const contentType = res.headers.get('content-type') || '';
  if (!/pdf/i.test(contentType)) {
    console.error(`PDFではないようです (${contentType}): ${url}`);
    process.exit(1);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(pdfPath, buf);

  // PDFを検索できるテキストに変換する。-layout で段組みの読み順を保ちやすくする
  try {
    execFileSync('pdftotext', ['-layout', '-enc', 'UTF-8', pdfPath, txtPath]);
  } catch (e) {
    console.error('pdftotext での変換に失敗しました:', e.message);
    process.exit(1);
  }

  const size = statSync(txtPath).size;
  writeFileSync(`${base}.meta.json`, JSON.stringify({
    name, url, fetchedAt: new Date().toISOString(),
    pdfBytes: buf.length, textBytes: size,
  }, null, 1), 'utf8');

  console.log(`取得: ${name}`);
  console.log(`  PDF : ${(buf.length / 1024 / 1024).toFixed(1)} MB`);
  console.log(`  文字: ${size.toLocaleString()} 文字`);
  console.log(`  保存: ${txtPath}`);
}

main();
