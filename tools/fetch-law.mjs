/*
  法律・省令の条文を e-Gov法令検索から取ってきて、手元に保存する道具です。

  使い方:
    node tools/fetch-law.mjs <法令名> [<法令名> ...]

  例:
    node tools/fetch-law.mjs 薬剤師法 麻薬及び向精神薬取締法

  仕組み:
   1. e-Gov法令検索に法令名で問い合わせ、その法令の番号(law_id)を調べる
   2. その番号で条文全体(XML形式)を取ってくる
   3. タグを取り除いて読める文章にし、.law-cache/ に保存する

  なぜ e-Gov を使うか:
    法律の条文は「国が公開している正式なもの」を出典にする必要があります。
    e-Gov法令検索(デジタル庁)は、その公式な提供元です。

  ※ 同じ法令を何度も取りに行かないよう、すでに保存済みならそのまま使います。
*/

import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(HERE, '..', '.law-cache');
const API = 'https://laws.e-gov.go.jp/api/2';

// e-Govのサーバーに配慮して、1件ごとに少し間隔を空ける(ミリ秒)
const DELAY_MS = 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ファイル名に使えない文字を「_」に置き換える
function toFileName(name) {
  return name.replace(/[^\p{L}\p{N}]/gu, '_').slice(0, 80);
}

/*
  XMLのタグを取り除いて、読める文章にする。
  条文は <Article>…</Article>、条番号は <ArticleTitle>…</ArticleTitle> のように
  入れ子になっているので、区切りとして改行を入れてから中身だけを残す。
*/
function xmlToText(xml) {
  return xml
    .replace(/<\?xml[\s\S]*?\?>/g, ' ')
    .replace(/<Ruby>([\s\S]*?)<Rt>[\s\S]*?<\/Rt><\/Ruby>/g, '$1') // ふりがなは本文だけ残す
    .replace(/<\/(ArticleTitle|ArticleCaption|ParagraphNum|ItemTitle|Sentence|Column)>/g, '$& ')
    .replace(/<\/(Article|Paragraph|Item|Subitem1|Subitem2|Chapter|Section|LawTitle)>/g, '$&\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/[ \t　]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();
}

// 法令名から law_id(法令の背番号)を調べる
async function findLawId(title) {
  const res = await fetch(`${API}/laws?law_title=${encodeURIComponent(title)}`);
  if (!res.ok) throw new Error(`検索に失敗しました (${res.status})`);
  const json = await res.json();
  const laws = json.laws || json.items || [];
  if (laws.length === 0) return null;

  // 法令名がぴったり一致するものを優先する(部分一致だと別の法令が混ざるため)
  const exact = laws.find((l) => l.revision_info?.law_title === title);
  const hit = exact || laws[0];
  return {
    lawId: hit.law_info?.law_id,
    lawTitle: hit.revision_info?.law_title,
    lawNum: hit.law_info?.law_num,
  };
}

async function fetchOne(title) {
  const base = join(CACHE_DIR, toFileName(title));
  if (existsSync(`${base}.txt`)) {
    console.log(`すでに保存済み        ${title}`);
    return;
  }

  const found = await findLawId(title);
  if (!found || !found.lawId) {
    console.log(`見つからず            ${title}`);
    return;
  }

  const url = `${API}/law_data/${found.lawId}?response_format=xml`;
  const res = await fetch(url);
  if (!res.ok) {
    console.log(`取得できず (${res.status})   ${title}`);
    return;
  }
  const text = xmlToText(await res.text());

  writeFileSync(`${base}.txt`, text, 'utf8');
  writeFileSync(`${base}.meta.json`, JSON.stringify({
    name: title,
    lawTitle: found.lawTitle,
    lawId: found.lawId,
    lawNum: found.lawNum,
    // 出典として問題に書くときは、この人が読める形のURLを使う
    viewUrl: `https://laws.e-gov.go.jp/law/${found.lawId}`,
    apiUrl: url,
    fetchedAt: new Date().toISOString(),
    textLength: text.length,
  }, null, 1), 'utf8');

  console.log(`取得                  ${found.lawTitle}  (${text.length.toLocaleString()} 文字)`);
}

async function main() {
  const titles = process.argv.slice(2);
  if (titles.length === 0) {
    console.error('使い方: node tools/fetch-law.mjs <法令名> [<法令名> ...]');
    process.exit(2);
  }
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });

  for (const [i, t] of titles.entries()) {
    try {
      await fetchOne(t);
    } catch (e) {
      console.log(`失敗                  ${t}  (${e.message})`);
    }
    if (i < titles.length - 1) await sleep(DELAY_MS);
  }
  console.log(`保存先: ${CACHE_DIR}`);
}

main();
