/*
  公的機関・学会がWebで公開している解説ページを取ってきて、
  検索できる形(テキスト)にして保存する道具です。

  使い方:
    node tools/fetch-web-source.mjs <保存名> <ページのURL>

  例:
    node tools/fetch-web-source.mjs NCVC_脳卒中 https://www.ncvc.go.jp/hospital/pub/knowledge/disease/stroke-2/

  なぜHTMLを狙うか:
    ガイドラインのPDFは、この環境では日本語が文字化けして読めないものが多い
    (日本語フォントの対応表が入っていないため)。HTMLページならその問題が起きない。

  出典として使ってよいのは3次情報だけ。具体的には:
    - 国立研究開発法人・厚生労働省など公的機関の解説ページ
    - 学会が公開する診療ガイドライン・一般向け資料
  個人のブログ・まとめサイトは使わない。
*/

import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(HERE, '..', '.guideline-cache');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

// 出典として認める公開元。ここに無いドメインは受け付けない。
// (個人サイトをうっかり出典にしないための歯止め)
const ALLOWED_HOSTS = [
  'ncvc.go.jp',          // 国立循環器病研究センター
  'mhlw.go.jp',          // 厚生労働省
  'e-healthnet.mhlw.go.jp',
  'niid.go.jp',          // 国立感染症研究所
  'ncgm.go.jp',          // 国立国際医療研究センター
  'ncc.go.jp',           // 国立がん研究センター
  'ganjoho.jp',          // がん情報サービス(国立がん研究センター)
  'ncnp.go.jp',          // 国立精神・神経医療研究センター
  'jsts.gr.jp',          // 日本脳卒中学会
  'jpnsh.jp',            // 日本高血圧学会
  'jds.or.jp',           // 日本糖尿病学会
  'j-circ.or.jp',        // 日本循環器学会
  'jshp.or.jp',          // 日本病院薬剤師会
  'pmda.go.jp',
  'minds.jcqhc.or.jp',   // Minds(日本医療機能評価機構)
  'jihs.go.jp',          // 国立健康危機管理研究機構(感染研・国際医療研究センターの後継)
  'erca.go.jp',          // 環境再生保全機構(ぜん息などの解説)
  'allergyportal.jp',    // アレルギーポータル(日本アレルギー学会・厚生労働省)
  'jsa-web.org',         // 日本脳卒中協会
  'nittokyo.or.jp',      // 日本糖尿病協会
  'jpn-geriat-soc.or.jp',// 日本老年医学会
];

function toFileName(name) {
  return name.replace(/[^\p{L}\p{N}]/gu, '_').slice(0, 80);
}

function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h\d|table|section)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/[ \t　]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();
}

async function main() {
  const [name, url] = process.argv.slice(2);
  if (!name || !url) {
    console.error('使い方: node tools/fetch-web-source.mjs <保存名> <ページのURL>');
    process.exit(2);
  }

  const host = new URL(url).hostname;
  if (!ALLOWED_HOSTS.some((h) => host === h || host.endsWith('.' + h))) {
    console.error(`出典として認めていない公開元です: ${host}`);
    console.error('公的機関・学会のドメインのみ受け付けます(tools/fetch-web-source.mjs の一覧を参照)');
    process.exit(1);
  }

  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
  const base = join(CACHE_DIR, toFileName(name));
  if (existsSync(`${base}.txt`)) {
    console.log(`すでに保存済み: ${base}.txt`);
    return;
  }

  // つながらない・見つからない場合は、原因を一行で伝えて終わる
  // (エラーをそのまま投げると読みにくいメッセージが大量に出るため)
  let res;
  try {
    res = await fetch(url, { headers: { 'User-Agent': UA } });
  } catch (e) {
    const reason = /ENOTFOUND/.test(String(e)) ? 'このアドレスが見つかりません(DNS)' : e.message;
    console.error(`取得できませんでした: ${url}\n  理由: ${reason}`);
    process.exit(1);
  }
  if (!res.ok) {
    console.error(`取得できませんでした (${res.status}): ${url}`);
    process.exit(1);
  }
  const text = htmlToText(await res.text());

  writeFileSync(`${base}.txt`, text, 'utf8');
  writeFileSync(`${base}.meta.json`, JSON.stringify({
    name, url, host, fetchedAt: new Date().toISOString(), textLength: text.length,
  }, null, 1), 'utf8');

  console.log(`取得: ${name}  (${text.length.toLocaleString()} 文字)`);
  console.log(`  ${url}`);
}

main();
