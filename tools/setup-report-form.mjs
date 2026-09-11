/*
  成績の送信先(Googleフォーム)を設定する道具です。

  使い方:
    node tools/setup-report-form.mjs "<Googleフォームの公開URL>"

  例:
    node tools/setup-report-form.mjs "https://docs.google.com/forms/d/e/1FAIpQLSxxxx/viewform"

  この道具がやること:
   - そのフォームのページを読みに行く
   - 中にある「質問」と「質問ごとの番号(entry.〇〇)」を取り出す
   - 「名前」の質問と「成績データ」の質問を見つけて data/report-form.json に書き込む

  ※ フォームは「リンクを知っている全員が回答できる」状態にしておいてください。
     (Googleフォームの初期設定のままならそうなっています)

  うまく見つからなかったときは、見つかった質問を一覧で表示するので、
  data/report-form.json を手で書き換えることもできます。
*/

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SETTINGS_PATH = join(HERE, '..', 'data', 'report-form.json');

// Googleフォームのページには FB_PUBLIC_LOAD_DATA_ という長いデータが埋まっている。
// その中に「質問文」と「entry の番号」が入っているので、そこから取り出す。
function extractQuestions(html) {
  const marker = 'FB_PUBLIC_LOAD_DATA_';
  const start = html.indexOf(marker);
  if (start === -1) return null;

  const open = html.indexOf('=', start);
  const end = html.indexOf('</script>', open);
  if (open === -1 || end === -1) return null;

  let raw = html.slice(open + 1, end).trim();
  if (raw.endsWith(';')) raw = raw.slice(0, -1);

  let data;
  try {
    // JSON.parse では読めない形(undefined ではなく null が並ぶ配列)なので、
    // 中身を評価せずに済むよう JSON として読めるか先に試す
    data = JSON.parse(raw);
  } catch {
    return null;
  }

  // data[1][1] に質問の配列が入っている
  const items = data?.[1]?.[1];
  if (!Array.isArray(items)) return null;

  const questions = [];
  for (const item of items) {
    const title = typeof item?.[1] === 'string' ? item[1] : '';
    const fields = item?.[4];
    if (!Array.isArray(fields)) continue;
    for (const field of fields) {
      const entryId = field?.[0];
      if (typeof entryId === 'number') questions.push({ title, entryId: `entry.${entryId}` });
    }
  }
  return questions;
}

// 「名前」「成績」といった言葉で、どの質問がどれかを見分ける
function pickByKeywords(questions, keywords) {
  return questions.find((q) => keywords.some((word) => q.title.includes(word)));
}

async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error('GoogleフォームのURLを渡してください。');
    console.error('例: node tools/setup-report-form.mjs "https://docs.google.com/forms/d/e/xxxx/viewform"');
    process.exit(1);
  }

  // 送信用のURLは末尾を formResponse にする決まりになっている
  const viewUrl = url.split('?')[0].replace(/\/(formResponse|viewform)?$/, '') + '/viewform';

  console.log('フォームを読みに行きます:', viewUrl);
  const response = await fetch(viewUrl, { redirect: 'follow' });
  if (!response.ok) {
    console.error(`読み込めませんでした (${response.status})。URLと公開設定を確認してください。`);
    process.exit(1);
  }
  const html = await response.text();

  const questions = extractQuestions(html);
  if (!questions || questions.length === 0) {
    console.error('質問を見つけられませんでした。');
    console.error('フォームが「リンクを知っている全員が回答できる」状態か確認してください。');
    process.exit(1);
  }

  console.log('\n見つかった質問:');
  questions.forEach((q, i) => console.log(`  ${i + 1}. 「${q.title}」 → ${q.entryId}`));

  const nameField = pickByKeywords(questions, ['名前', '氏名', 'なまえ']);
  const dataField = pickByKeywords(questions, ['成績データ', '成績', 'データ']);

  if (!nameField || !dataField) {
    console.error('\n「名前」と「成績データ」の質問を見分けられませんでした。');
    console.error('上の一覧を見て、data/report-form.json を手で書き換えてください。');
    process.exit(1);
  }
  if (nameField.entryId === dataField.entryId) {
    console.error('\n「名前」と「成績データ」が同じ質問になってしまいました。質問名を見直してください。');
    process.exit(1);
  }

  const settings = JSON.parse(readFileSync(SETTINGS_PATH, 'utf8'));
  settings.enabled = true;
  settings.formUrl = viewUrl.replace(/\/viewform$/, '/formResponse');
  settings.nameEntryId = nameField.entryId;
  settings.dataEntryId = dataField.entryId;

  writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2) + '\n', 'utf8');

  console.log('\n設定しました:');
  console.log(`  名前       → ${nameField.entryId} (「${nameField.title}」)`);
  console.log(`  成績データ → ${dataField.entryId} (「${dataField.title}」)`);
  console.log(`\ndata/report-form.json に書き込みました。`);
  console.log('アプリの「利用者」画面に「先生に成績を送る」ボタンが出るようになります。');
}

main().catch((error) => {
  console.error('失敗しました:', error.message);
  process.exit(1);
});
