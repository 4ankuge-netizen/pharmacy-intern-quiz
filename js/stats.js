// カテゴリーごとの正答率を計算するための部品です。
// history は storage.js の getHistory() が返す形式のオブジェクトです。

// 渡された問題の集まりについて、「何問答えたか」「何問正解したか」「正答率」を数える。
// カテゴリー別でも難易度別でも、絞り込んだ問題を渡せば同じように使えるようにしてある
export function summarizeAccuracy(questions, history) {
  let correct = 0; // 正解した問題の数
  let answered = 0; // 回答済みの問題の数

  for (const q of questions) {
    const record = history[q.id];
    // 履歴がない場合はスキップ（未回答）
    if (!record) continue;
    answered += 1;
    // 「最後に答えたとき正解だったか」で数える。
    // 何度も解き直せるので、直近の結果を今の実力とみなしている
    if (record.lastResult === 'correct') correct += 1;
  }

  return {
    correct,
    answered,
    totalQuestions: questions.length, // その集まりに入っている全問題数
    // 正答率をパーセンテージで計算する。1問も答えていない場合は0%
    accuracyPercent: answered === 0 ? 0 : Math.round((correct / answered) * 100),
  };
}

export function computeCategoryAccuracy(questions, history, categories) {
  // categories配列をループして、各カテゴリーの統計情報を計算します
  return categories.map((category) => {
    // 現在のカテゴリーに属する問題を抽出します
    const categoryQuestions = questions.filter((q) => q.category === category.id);
    return {
      categoryId: category.id,
      categoryName: category.name,
      ...summarizeAccuracy(categoryQuestions, history),
    };
  });
}
