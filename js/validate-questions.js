// 1問分のデータが、正しい形になっているかチェックする関数です。
// 問題データを追加・修正したときに、うっかりミス(必須項目の書き忘れなど)に
// 気づけるようにするためのものです。

const VALID_DIFFICULTIES = ['beginner', 'intermediate', 'advanced'];
const VALID_TYPES = ['single', 'case'];

export function validateQuestion(q) {
  const errors = [];

  // idの検証
  if (typeof q.id !== 'string' || q.id.length === 0) {
    errors.push('id が文字列で入っていません');
  }
  // categoryの検証
  if (typeof q.category !== 'string' || q.category.length === 0) {
    errors.push('category が文字列で入っていません');
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
    typeof q.correctIndex !== 'number' ||
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

  return errors;
}

export function validateQuestions(questions) {
  const results = [];
  for (const q of questions) {
    const errors = validateQuestion(q);
    // エラーがある問題だけを結果配列に加える
    if (errors.length > 0) {
      results.push({ id: q.id, errors });
    }
  }
  return results;
}
