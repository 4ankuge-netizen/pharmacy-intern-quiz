// カテゴリーごとの正答率を計算するための部品です。
// history は storage.js の getHistory() が返す形式のオブジェクトです。

export function computeCategoryAccuracy(questions, history, categories) {
  // categories配列をループして、各カテゴリーの統計情報を計算します
  return categories.map((category) => {
    // 現在のカテゴリーに属する問題を抽出します
    const categoryQuestions = questions.filter((q) => q.category === category.id);
    let correct = 0; // 正解した問題の数
    let answered = 0; // 回答済みの問題の数

    // カテゴリーの各問題について、履歴データをチェックします
    for (const q of categoryQuestions) {
      const record = history[q.id];
      // 履歴がない場合はスキップ（未回答）
      if (!record) continue;
      // 回答済みカウントを増やします
      answered += 1;
      // 正解の場合は正解カウントを増やします
      if (record.lastResult === 'correct') correct += 1;
    }

    // 正答率をパーセンテージで計算します
    // 回答がない場合は0%です
    const accuracyPercent = answered === 0 ? 0 : Math.round((correct / answered) * 100);

    // カテゴリーの統計情報を返します
    return {
      categoryId: category.id,
      categoryName: category.name,
      correct, // 正解した問題の数
      answered, // 回答した問題の数
      totalQuestions: categoryQuestions.length, // そのカテゴリーの全問題数
      accuracyPercent, // 正答率（0～100）
    };
  });
}
