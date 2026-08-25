// 1問分のデータが、正しい形になっているかチェックする関数です。
// 問題データを追加・修正したときに、うっかりミス(必須項目の書き忘れなど)に
// 気づけるようにするためのものです。

const VALID_DIFFICULTIES = ['beginner', 'intermediate', 'advanced'];
const VALID_TYPES = ['single', 'case'];

// 出題カテゴリーの正式な名前(id)の一覧。
// data/categories.json と同じ内容にしておく必要があり、
// ずれていないかはテストで見張っている。
// カテゴリー名を打ち間違えると、その問題はホーム画面からも正答率画面からも
// 消えてしまい、しかもエラーも出ないため、ここで必ず照合する。
export const VALID_CATEGORY_IDS = [
  'cancer',
  'hypertension',
  'diabetes',
  'heart-disease',
  'cerebrovascular',
  'psychiatric',
  'immune-allergy',
  'infection',
  'calculation',
  'ethics',
];

export function validateQuestion(q) {
  const errors = [];

  // idの検証
  if (typeof q.id !== 'string' || q.id.length === 0) {
    errors.push('id が文字列で入っていません');
  }
  // categoryの検証。決められた10個のどれかであること
  if (!VALID_CATEGORY_IDS.includes(q.category)) {
    errors.push(`category が正しくありません(${VALID_CATEGORY_IDS.join(' / ')} のいずれか)`);
  }
  // difficultyの検証
  if (!VALID_DIFFICULTIES.includes(q.difficulty)) {
    errors.push(`difficulty は ${VALID_DIFFICULTIES.join(' / ')} のいずれかである必要があります`);
  }
  // typeの検証
  if (!VALID_TYPES.includes(q.type)) {
    errors.push(`type は ${VALID_TYPES.join(' / ')} のいずれかである必要があります`);
  }
  // questionの検証
  if (typeof q.question !== 'string' || q.question.length === 0) {
    errors.push('question が文字列で入っていません');
  }
  // choicesの検証
  if (!Array.isArray(q.choices) || q.choices.length < 2) {
    errors.push('choices は2つ以上の配列である必要があります');
  }
  // correctIndexの検証
  if (
    !Number.isInteger(q.correctIndex) ||
    !Array.isArray(q.choices) ||
    q.correctIndex < 0 ||
    q.correctIndex >= q.choices.length
  ) {
    errors.push('correctIndex が choices の範囲内の数字ではありません');
  }
  // explanationの検証
  if (typeof q.explanation !== 'string' || q.explanation.length === 0) {
    errors.push('explanation が文字列で入っていません');
  }
  // source.nameの検証
  if (!q.source || typeof q.source.name !== 'string' || q.source.name.length === 0) {
    errors.push('source.name が入っていません');
  }
  // source.confirmedDateの検証
  if (!q.source || typeof q.source.confirmedDate !== 'string') {
    errors.push('source.confirmedDate が入っていません');
  }
  // verifiedの検証。PMDAの一次資料で内容を確認済みかどうかを表す
  if (typeof q.verified !== 'boolean') {
    errors.push('verified が true / false で入っていません');
  }

  return errors;
}

export function validateQuestions(questions) {
  const results = [];
  // 同じIDの問題が2つあると、解答履歴が混ざってしまうので見張る
  const seenIds = new Set();

  for (const q of questions) {
    const errors = validateQuestion(q);
    if (seenIds.has(q.id)) {
      errors.push(`id「${q.id}」が重複しています`);
    } else {
      seenIds.add(q.id);
    }
    // エラーがある問題だけを結果配列に加える
    if (errors.length > 0) {
      results.push({ id: q.id, errors });
    }
  }
  return results;
}
