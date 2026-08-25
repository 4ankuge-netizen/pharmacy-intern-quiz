/*
  PMDAから添付文書の本文を取ってきて、手元に保存する道具です。

  使い方:
    node tools/fetch-pmda-documents.mjs <薬剤名> [<薬剤名> ...]
    node tools/fetch-pmda-documents.mjs --from-file <薬剤名を1行ずつ書いたファイル>

  仕組み:
   1. PMDAの添付文書検索(info.pmda.go.jp)に薬剤名で問い合わせる
   2. 見つかった添付文書のページ(本文)を取ってくる
   3. 必要な部分だけ抜き出して .pmda-cache/ に保存する

  保存したものは、問題の内容が資料と合っているかを確かめるときに使います。
  同じ薬を何度も取りに行かないよう、すでに保存済みならそのまま使います。

  ※ PMDAのサーバーに負担をかけないよう、1件ごとに少し間隔を空けています。
*/

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(HERE, '..', '.pmda-cache');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const SEARCH_URL = 'https://www.info.pmda.go.jp/psearch/PackinsSearch';
const PACK_BASE = 'https://www.info.pmda.go.jp';

// PMDAのサーバーに配慮して、リクエストの間隔を空ける(ミリ秒)
const DELAY_MS = 1200;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// 薬剤名を、保存するファイル名に使える形に変える
function toFileName(drugName) {
  return drugName.replace(/[^\p{L}\p{N}]/gu, '_').slice(0, 80);
}

// HTMLからタグを取り除いて、読める文章にする
function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h\d|table)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/[ \t　]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();
}

/*
  検索結果から「一番ふさわしい添付文書」を選ぶ。

  単に先頭を取ると、たとえば「カンデサルタン」で検索したときに
  配合剤(エカード配合錠など)を拾ってしまう。それでは問題の検証に使えないので、
  販売名を見て点数を付け、一番素直に一致するものを選ぶ。
*/
function scoreCandidate(name, drugName) {
  let score = 0;
  const isCombo = /配合/.test(name);
  const wantsCombo = /配合/.test(drugName);

  if (name.includes(drugName)) score += 10;
  // 探している薬名で始まるものを優先(「カンデサルタン錠」など)
  if (name.startsWith(drugName)) score += 8;
  // 配合剤は、explicitly探していない限り避ける
  if (isCombo && !wantsCombo) score -= 20;
  if (isCombo && wantsCombo) score += 5;
  // 複数の製品がまとめられた長い名前より、単純な名前を優先
  score -= Math.min(name.length / 20, 5);
  return score;
}

async function findPackCandidates(searchTerm, drugName) {
  const url = `${SEARCH_URL}?dragname=${encodeURIComponent(searchTerm)}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) return [];
  const html = await res.text();

  // <A href="/go/pack/....">販売名</A> の組を取り出す
  const pairs = [...html.matchAll(/<A href="(\/go\/pack\/[^"]+)"[^>]*>([\s\S]*?)<\/A>/gi)].map((m) => ({
    path: m[1].split('?')[0],
    name: m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(),
  }));

  return pairs
    .map((p) => ({ ...p, score: scoreCandidate(p.name, drugName) }))
    .sort((a, b) => b.score - a.score);
}

/*
  出典に書かれた薬名から、検索に使う言葉の候補をいくつか作る。

  PMDAの検索は言葉の選び方で結果が大きく変わる。たとえば「カンデサルタン」だと
  配合剤ばかり出てくるが、「カンデサルタン錠」なら単剤が出てくる。
  そこで何通りか試し、実際に取れた文書がその薬のものか確かめる。
*/
export function buildSearchTerms(rawName) {
  const terms = [];
  const name = rawName.trim();

  // 「アムロジピン錠(ノルバスク)」のような括弧付きは、括弧の中身(商品名)も試す
  const bracket = name.match(/[（(]([^）)]+)[）)]/);
  const withoutBracket = name.replace(/[（(][^）)]*[）)]/g, '').trim();

  // 剤形を表す言葉。ひとかたまりの語として判定する。
  // (文字の集まりとして [錠カプセル…] のように書くと、「カンデサルタン」の
  //  「カ」「ル」にまで反応してしまうため)
  const DOSAGE_FORM = /(錠|カプセル|注射液|注射用|注|細粒|顆粒|散剤|散|内用液|液|軟膏|クリーム|貼付剤|テープ|吸入|点眼|坐剤|シロップ)/;

  if (bracket) terms.push(bracket[1].trim()); // 商品名は候補が絞れることが多いので先に試す
  if (withoutBracket) terms.push(withoutBracket);
  // 剤形が付いていなければ「錠」を足したものも試す(単剤にたどり着きやすい)
  if (withoutBracket && !DOSAGE_FORM.test(withoutBracket)) {
    terms.push(withoutBracket + '錠');
    terms.push(withoutBracket + 'カプセル');
  }
  // 「〜錠」から剤形を外したものも一応試す
  const stem = withoutBracket.replace(new RegExp(DOSAGE_FORM.source + '.*$'), '').trim();
  if (stem && stem !== withoutBracket && stem.length >= 3) terms.push(stem);

  return [...new Set(terms.filter(Boolean))];
}

// 取ってきた文書が、本当に目当ての薬のものかを確かめる。
// 別の薬の添付文書を根拠にしてしまうと検証の意味がなくなるため。
function documentMatchesDrug(text, drugName, productName = '') {
  const stem = drugName.replace(/(錠|カプセル|注射液|注|細粒|顆粒|散|液).*$/, '').trim();
  const needle = stem.length >= 3 ? stem : drugName;

  /*
    単なる部分一致だと、別の薬を同じ薬だと誤認する。
    例:「クロニジン」で検索して「アプラクロニジン」(緑内障の点眼薬)の
    添付文書を掴んでしまう。名前の一部として含まれているだけだから。

    そこで、薬名の直前がカタカナでないこと(=より長い薬名の一部ではないこと)を
    確かめる。
  */
  const KATAKANA = /[ァ-ヶー]/;
  let standalone = false;
  let from = 0;
  while (true) {
    const at = text.indexOf(needle, from);
    if (at === -1) break;
    const before = at > 0 ? text[at - 1] : '';
    if (!KATAKANA.test(before)) { standalone = true; break; }
    from = at + 1;
  }
  if (!standalone) return false;

  // 配合剤は、その成分名を含むので素通ししてしまう。
  // 単剤を探しているのに配合剤の添付文書を根拠にすると内容がずれるため除く
  const wantsCombo = /配合/.test(drugName);
  const isCombo = /配合(錠|剤|カプセル|顆粒)/.test(productName) || /配合(錠|剤|カプセル|顆粒)/.test(text.slice(0, 300));
  if (isCombo && !wantsCombo) return false;

  return true;
}

// 添付文書の本文から、問題の検証によく使う項目を抜き出す
function extractSections(text) {
  const wanted = [
    '警告', '禁忌', '効能又は効果', '効能・効果', '用法及び用量', '用法・用量',
    '相互作用', '併用禁忌', '併用注意', '重要な基本的注意', '特定の背景',
    '副作用', '薬効薬理', '薬物動態', '組成・性状',
  ];
  const found = {};
  for (const key of wanted) {
    // 「効能又は効果」などの見出しから、次の見出しらしき場所までを取り出す
    const re = new RegExp(`${key}[\\s\\S]{0,3000}`);
    const m = text.match(re);
    if (m) found[key] = m[0].slice(0, 1800);
  }
  return found;
}

async function fetchOne(drugName) {
  const file = join(CACHE_DIR, `${toFileName(drugName)}.json`);
  if (existsSync(file)) {
    return { drugName, status: 'すでに保存済み', file };
  }

  // 検索の言葉を何通りか試し、その薬の添付文書にたどり着けたものを採用する
  const searchTerms = buildSearchTerms(drugName);
  const tried = [];

  for (const term of searchTerms) {
    const candidates = await findPackCandidates(term, drugName);
    await wait(DELAY_MS);
    // 上位3件まで、実際に中身を見て目当ての薬か確かめる
    for (const candidate of candidates.slice(0, 3)) {
      const packUrl = `${PACK_BASE}${candidate.path}?view=body&lang=ja`;
      const res = await fetch(packUrl, { headers: { 'User-Agent': UA } });
      await wait(DELAY_MS);
      if (!res.ok) continue;
      const text = htmlToText(await res.text());

      tried.push({ term, name: candidate.name, matched: documentMatchesDrug(text, drugName, candidate.name) });
      if (!documentMatchesDrug(text, drugName, candidate.name)) continue;

      const record = {
        drugName,
        searchTermUsed: term,
        selectedProductName: candidate.name,
        packUrl,
        fetchedAt: new Date().toISOString(),
        // 添付文書の冒頭(販売名・一般名・改訂年月などが載っている部分)
        head: text.slice(0, 1200),
        sections: extractSections(text),
        fullTextLength: text.length,
      };
      writeFileSync(file, JSON.stringify(record, null, 1), 'utf8');
      // 本文まるごとも別途保存しておく(細かく確認したいとき用)
      writeFileSync(join(CACHE_DIR, `${toFileName(drugName)}.txt`), text, 'utf8');
      return { drugName, status: '取得', file, packUrl, product: candidate.name };
    }
  }

  // どの言葉でも、その薬の添付文書にたどり着けなかった
  const record = {
    drugName, packUrl: null, fetchedAt: new Date().toISOString(),
    notFound: true, searchTermsTried: searchTerms, candidatesTried: tried,
  };
  writeFileSync(file, JSON.stringify(record, null, 1), 'utf8');
  return { drugName, status: '添付文書が見つからず', file };
}

async function main() {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });

  let names = process.argv.slice(2);
  if (names[0] === '--from-file') {
    names = readFileSync(names[1], 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);
  }
  if (names.length === 0) {
    console.error('使い方: node tools/fetch-pmda-documents.mjs <薬剤名> ...');
    console.error('     または: node tools/fetch-pmda-documents.mjs --from-file <一覧ファイル>');
    process.exit(2);
  }

  let ok = 0, missing = 0, cached = 0, failed = 0;
  for (const name of names) {
    try {
      const r = await fetchOne(name);
      if (r.status === '取得') ok++;
      else if (r.status === 'すでに保存済み') cached++;
      else if (r.status === '添付文書が見つからず') missing++;
      else failed++;
      console.log(`${r.status.padEnd(16)} ${name}`);
    } catch (e) {
      failed++;
      console.log(`エラー           ${name}: ${e.message}`);
    }
    await wait(DELAY_MS);
  }
  console.log(`\n取得 ${ok} / 保存済み ${cached} / 見つからず ${missing} / 失敗 ${failed}`);
  console.log(`保存先: ${CACHE_DIR}`);
}

main();
