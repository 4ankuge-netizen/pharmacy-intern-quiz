/*
  以前のプロジェクト(pharmacy-core8-quiz)で作った問題データを、
  今のアプリの形式に変換して取り込むための道具です。

  使い方:
    node tools/import-legacy-questions.mjs <古いdata.jsのパス>

  やっていること:
   1. 古い形式 { q, choices, a, exp, src } を新しい形式に変換する
   2. カテゴリー名を今の名前に対応付ける(heart → heart-disease など)
   3. 選択肢を並び替える(古いデータは全問「正解が1番目」に固定されていたため)
   4. PMDAの一次資料での確認はまだ済んでいないので verified: false を付ける

  ※ 何度実行しても同じ結果になるよう、並び替えの乱数は種(seed)を固定しています。
*/

import { readFileSync, writeFileSync } from 'node:fs';
import { validateQuestions } from '../js/validate-questions.js';

// 古いカテゴリー名 → 今のカテゴリー名
const CATEGORY_MAP = {
  cancer: 'cancer',
  hypertension: 'hypertension',
  diabetes: 'diabetes',
  heart: 'heart-disease',
  cerebrovascular: 'cerebrovascular',
  psychiatric: 'psychiatric',
  allergy: 'immune-allergy',
  infection: 'infection',
};

// 種(seed)から同じ並びを再現できる簡易的な乱数。
// Math.random() だと実行のたびに結果が変わり、差分が読めなくなるため。
function createSeededRandom(seed) {
  let state = seed >>> 0;
  return function random() {
    // xorshift32
    state ^= state << 13; state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;  state >>>= 0;
    return state / 4294967296;
  };
}

// 選択肢を並び替えて、正解が何番目に移ったかも一緒に返す
function shuffleChoicesWithAnswer(choices, correctIndex, random) {
  const indexed = choices.map((text, i) => ({ text, isCorrect: i === correctIndex }));
  for (let i = indexed.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [indexed[i], indexed[j]] = [indexed[j], indexed[i]];
  }
  return {
    choices: indexed.map((c) => c.text),
    correctIndex: indexed.findIndex((c) => c.isCorrect),
  };
}

// 症例問題らしいか(「65歳男性。…」のように年齢と患者像が書かれているもの)
function looksLikeCaseQuestion(text) {
  return /\d+\s*歳/.test(text) && /患者|男性|女性/.test(text);
}

function main() {
  const legacyPath = process.argv[2];
  if (!legacyPath) {
    console.error('使い方: node tools/import-legacy-questions.mjs <古いdata.jsのパス>');
    process.exit(2);
  }

  // 古い data.js は「const QUIZ_DATA = {...}」という形なので、
  // 末尾に取り出し用の一行を足して読み込む
  const legacySource = readFileSync(legacyPath, 'utf8');
  const getData = new Function(`${legacySource}\nreturn QUIZ_DATA;`);
  const legacyData = getData();

  const random = createSeededRandom(20260826);
  const converted = [];
  const report = {};

  for (const [legacyKey, category] of Object.entries(legacyData)) {
    const categoryId = CATEGORY_MAP[legacyKey];
    if (!categoryId) {
      console.error(`知らないカテゴリーがありました: ${legacyKey}`);
      process.exit(1);
    }
    report[categoryId] = {};

    for (const [difficulty, questions] of Object.entries(category.levels || {})) {
      report[categoryId][difficulty] = questions.length;

      questions.forEach((old, i) => {
        const shuffled = shuffleChoicesWithAnswer(old.choices, old.a, random);
        converted.push({
          // 連番は3桁。以前のサンプルデータ(2桁)とIDがぶつからないようにしている
          id: `${categoryId}-${difficulty}-${String(i + 1).padStart(3, '0')}`,
          category: categoryId,
          difficulty,
          type: looksLikeCaseQuestion(old.q) ? 'case' : 'single',
          question: old.q,
          choices: shuffled.choices,
          correctIndex: shuffled.correctIndex,
          explanation: old.exp,
          source: {
            name: old.src,
            // 古いデータには資料のURLが入っていないため空。
            // PMDAで確認したときに、実際に見た資料のURLを入れる
            url: '',
            // 確認日も、実際にPMDAで確認したときに初めて記録する
            confirmedDate: '',
          },
          // 古いデータは一般的な知識をもとに作られており、
          // PMDAの添付文書・インタビューフォーム・ガイドラインでの確認は未実施
          verified: false,
        });
      });
    }
  }

  // 出来上がったデータが、アプリの決まりに合っているか点検する
  const problems = validateQuestions(converted);
  if (problems.length > 0) {
    console.error('変換後のデータに問題が見つかりました:');
    console.error(JSON.stringify(problems.slice(0, 10), null, 2));
    process.exit(1);
  }

  // 正解の位置が偏っていないか(古いデータは全問1番目だった)
  const positions = {};
  converted.forEach((q) => { positions[q.correctIndex] = (positions[q.correctIndex] || 0) + 1; });

  const outPath = new URL('../data/questions.json', import.meta.url);
  writeFileSync(outPath, JSON.stringify(converted, null, 1) + '\n', 'utf8');

  console.log(`変換した問題数: ${converted.length}問`);
  console.log('正解の位置の分布:', positions);
  console.log('カテゴリー別:');
  for (const [cat, levels] of Object.entries(report)) {
    const total = Object.values(levels).reduce((a, b) => a + b, 0);
    console.log(`  ${cat.padEnd(16)} ${String(total).padStart(4)}問  (${JSON.stringify(levels)})`);
  }
  console.log(`症例問題として判定: ${converted.filter((q) => q.type === 'case').length}問`);
  console.log(`確認済み(verified: true): ${converted.filter((q) => q.verified).length}問`);
  console.log(`書き出し先: ${outPath.pathname}`);
}

main();
