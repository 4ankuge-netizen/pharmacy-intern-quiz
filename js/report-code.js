// 成績を「短い文字列」にまとめたり、元に戻したりする部品です。
//
// なぜ短くするのか:
//   実習生の端末から先生の手元へ成績を送るときに、Googleフォームの
//   URLに成績を埋め込んで開きます。URLには長さの限界があるため、
//   1,900問ぶんの回答を、できるだけ短い文字に置き換える必要があります。
//
// どう短くしているか:
//   問題のIDは "prescription-query-intermediate-027" のように長いので、
//   「カテゴリー1文字 + 難易度1桁 + 番号」に置き換えます。
//   さらに 3,4,5,6 のように連続した番号は "3-6" とまとめます。
//
//   例) l2 3-6.12!8.9
//       → 疑義照会・中級の 3,4,5,6,12番が正解、8,9番が不正解
//
// 区切り文字について:
//   URLに入れても記号が %7C のような形に化けない文字だけを選んでいます。
//   (~ * ! . - は化けない。, : | は化ける)

const FORMAT_VERSION = 'PQZ1'; // 形式の版。将来変えたときに見分けるため

const FIELD_SEPARATOR = '~'; // 名前・日付などの大きな区切り
const GROUP_SEPARATOR = '*'; // カテゴリー×難易度のまとまりの区切り
const WRONG_SEPARATOR = '!'; // 正解の並びと不正解の並びの区切り
const NUMBER_SEPARATOR = '.'; // 番号どうしの区切り
const RANGE_SEPARATOR = '-'; // 連続した番号をまとめる印

// 難易度を1桁の数字に置き換える表
const DIFFICULTY_CODES = { beginner: '1', intermediate: '2', advanced: '3' };
const DIFFICULTY_BY_CODE = { 1: 'beginner', 2: 'intermediate', 3: 'advanced' };

// カテゴリーを1文字に置き換える表を作る。
// categories.json の並び順をそのまま使うので、カテゴリーを増やしても
// 既存のカテゴリーの文字は変わらない(後ろに足されるだけ)。
const LETTERS = 'abcdefghijklmnopqrstuvwxyz';

export function buildCategoryCodes(categories) {
  const toCode = new Map();
  const toId = new Map();
  categories.forEach((category, index) => {
    const letter = LETTERS[index];
    if (!letter) return; // 26カテゴリーを超えたら入りきらない(今は12なので余裕がある)
    toCode.set(category.id, letter);
    toId.set(letter, category.id);
  });
  return { toCode, toId };
}

// 問題IDの末尾の番号(例: "...-027" の 27)を取り出す
function idNumber(questionId) {
  const matched = questionId.match(/-(\d+)$/);
  return matched ? Number(matched[1]) : null;
}

// [1,2,3,5,9,10] を "1-3.5.9-10" のようにまとめる
function packNumbers(numbers) {
  if (numbers.length === 0) return '';
  const sorted = [...numbers].sort((a, b) => a - b);
  const parts = [];
  let runStart = sorted[0];
  let runEnd = sorted[0];

  const flush = () => {
    if (runStart === runEnd) parts.push(String(runStart));
    else if (runEnd === runStart + 1) parts.push(`${runStart}${NUMBER_SEPARATOR}${runEnd}`);
    else parts.push(`${runStart}${RANGE_SEPARATOR}${runEnd}`);
  };

  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i] === runEnd + 1) {
      runEnd = sorted[i]; // 連続しているので伸ばす
    } else {
      flush();
      runStart = sorted[i];
      runEnd = sorted[i];
    }
  }
  flush();
  return parts.join(NUMBER_SEPARATOR);
}

// "1-3.5.9-10" を [1,2,3,5,9,10] に戻す
function unpackNumbers(text) {
  if (!text) return [];
  const numbers = [];
  for (const chunk of text.split(NUMBER_SEPARATOR)) {
    if (!chunk) continue;
    const range = chunk.split(RANGE_SEPARATOR);
    if (range.length === 2) {
      const from = Number(range[0]);
      const to = Number(range[1]);
      if (!Number.isInteger(from) || !Number.isInteger(to) || to < from) return null;
      for (let n = from; n <= to; n += 1) numbers.push(n);
    } else {
      const n = Number(chunk);
      if (!Number.isInteger(n)) return null;
      numbers.push(n);
    }
  }
  return numbers;
}

/**
 * 今の成績を、送信用の短い文字列にまとめる。
 *
 * @param {object} params
 * @param {object} params.history    storage.getHistory() が返すもの
 * @param {Array}  params.questions  問題データ全体
 * @param {Array}  params.categories categories.json
 * @param {string} params.date       書き出した日 ("2026-09-11")
 * @param {number} params.streak     連続学習日数
 * @returns {string} 例: "PQZ1~2026-09-11~12~a1 3-6.12!8.9"
 */
export function encodeReport({ history, questions, categories, date, streak }) {
  const { toCode } = buildCategoryCodes(categories);

  // 問題IDから「どのカテゴリー・難易度か」をすぐ引けるようにしておく
  const byGroup = new Map(); // "a1" → { correct: [番号], wrong: [番号] }

  for (const question of questions) {
    const record = history[question.id];
    if (!record) continue; // 未回答の問題は入れない

    const categoryCode = toCode.get(question.category);
    const difficultyCode = DIFFICULTY_CODES[question.difficulty];
    const number = idNumber(question.id);
    if (!categoryCode || !difficultyCode || number === null) continue;

    const key = categoryCode + difficultyCode;
    if (!byGroup.has(key)) byGroup.set(key, { correct: [], wrong: [] });
    byGroup.get(key)[record.lastResult === 'correct' ? 'correct' : 'wrong'].push(number);
  }

  const groups = [];
  // 並び順を固定しておくと、同じ成績なら毎回同じ文字列になって確認しやすい
  for (const key of [...byGroup.keys()].sort()) {
    const { correct, wrong } = byGroup.get(key);
    const body = packNumbers(correct) + (wrong.length ? WRONG_SEPARATOR + packNumbers(wrong) : '');
    groups.push(key + body);
  }

  return [FORMAT_VERSION, date, String(streak), groups.join(GROUP_SEPARATOR)].join(FIELD_SEPARATOR);
}

/**
 * 送信用の文字列を、元の成績に戻す。
 * 形がおかしければ null を返す(貼り付けミスをそのまま受け入れないため)。
 *
 * @returns {null | { date, streak, history, answeredCount }}
 */
export function decodeReport(text, categories) {
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (!trimmed.startsWith(FORMAT_VERSION + FIELD_SEPARATOR)) return null;

  const fields = trimmed.split(FIELD_SEPARATOR);
  if (fields.length < 4) return null;

  const [, date, streakText, groupsText = ''] = fields;
  const streak = Number(streakText);
  if (!Number.isInteger(streak) || streak < 0) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  const { toId } = buildCategoryCodes(categories);
  const history = {};
  let answeredCount = 0;

  if (groupsText) {
    for (const group of groupsText.split(GROUP_SEPARATOR)) {
      if (group.length < 3) return null;
      const categoryId = toId.get(group[0]);
      const difficulty = DIFFICULTY_BY_CODE[group[1]];
      if (!categoryId || !difficulty) return null;

      const [correctText, wrongText] = group.slice(2).split(WRONG_SEPARATOR);
      const correct = unpackNumbers(correctText);
      const wrong = unpackNumbers(wrongText);
      if (correct === null || wrong === null) return null;

      // 問題IDを組み立て直す。番号は3桁ぞろえ(027 のような形)
      const put = (numbers, result) => {
        for (const n of numbers) {
          const id = `${categoryId}-${difficulty}-${String(n).padStart(3, '0')}`;
          history[id] = {
            correctCount: result === 'correct' ? 1 : 0,
            wrongCount: result === 'correct' ? 0 : 1,
            lastResult: result,
            lastAnsweredAt: date,
          };
          answeredCount += 1;
        }
      };
      put(correct, 'correct');
      put(wrong, 'wrong');
    }
  }

  return { date, streak, history, answeredCount };
}

/**
 * 先生が表計算から貼り付けた文字をまとめて読み取る。
 *
 * 想定している貼り付け方:
 *   - 1行に1人。タブ区切り(表計算からコピーすると自動でタブになる)
 *   - 「PQZ1~...」で始まる列が成績データ、その1つ手前の列が名前
 *   - 名前の列がなければ「(名前なし)」として扱う
 *
 * @returns {{ reports: Array, skipped: number }}
 */
export function parsePastedReports(pasted, categories) {
  const reports = [];
  let skipped = 0;

  for (const rawLine of String(pasted).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    // タブ区切り。表計算以外から貼られた場合に備えて、空白の連続も区切りとみなす
    const columns = line.includes('\t') ? line.split('\t') : [line];
    const dataIndex = columns.findIndex((c) => c.trim().startsWith(FORMAT_VERSION + FIELD_SEPARATOR));

    if (dataIndex === -1) {
      skipped += 1;
      continue;
    }

    const decoded = decodeReport(columns[dataIndex], categories);
    if (!decoded) {
      skipped += 1;
      continue;
    }

    // 成績データの1つ手前の列を名前とみなす。空なら「(名前なし)」
    const name = dataIndex > 0 ? columns[dataIndex - 1].trim() : '';
    reports.push({ name: name || '(名前なし)', ...decoded });
  }

  return { reports, skipped };
}

export const REPORT_FORMAT_VERSION = FORMAT_VERSION;
