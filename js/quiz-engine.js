// 出題する問題を選んだり、正解かどうかを判定したりするための部品です。
// 画面の見た目(HTML)には一切関わらず、データの計算だけを行います。

// カテゴリーや難易度で問題を絞り込む関数
// categoryId と difficulty の両方を指定することもできます
export function filterQuestions(questions, { categoryId, difficulty } = {}) {
  return questions.filter((q) => {
    // カテゴリーIDが指定されていて、この問題が異なるカテゴリーならスキップ
    if (categoryId && q.category !== categoryId) return false;
    // 難易度が指定されていて、この問題が異なる難易度ならスキップ
    if (difficulty && q.difficulty !== difficulty) return false;
    // どちらにも合致したのでこの問題を含める
    return true;
  });
}

// 直近で間違えた問題だけを取り出す(弱点復習モード用)
// wrongQuestionIds には問題のIDの配列が入ります
export function getWeakPointQuestions(questions, wrongQuestionIds) {
  // IDの配列をセット(集合)に変換して、高速に検索できるようにします
  const wrongSet = new Set(wrongQuestionIds);
  // 間違えた問題IDに含まれる問題だけを返します
  return questions.filter((q) => wrongSet.has(q.id));
}

// 選んだ選択肢が正解かどうかを判定する
// selectedIndex は選んだ選択肢の番号(0から始まります)
export function checkAnswer(question, selectedIndex) {
  // 選んだ番号が正解の番号と同じかどうかをチェック
  return selectedIndex === question.correctIndex;
}

// 配列の中身をランダムな順番に並べ替える(Fisher-Yatesシャッフル)
// randomFn を差し替えられるようにして、テストのときは結果が毎回変わらないようにしている
export function shuffle(array, randomFn = Math.random) {
  // 元の配列を変更しないように、コピーを作ります
  const result = array.slice();
  // 配列の最後から2番目の要素まで、順番にシャッフルします
  for (let i = result.length - 1; i > 0; i--) {
    // 0 から i までのランダムな位置を選びます
    const j = Math.floor(randomFn() * (i + 1));
    // 現在の位置とランダムに選んだ位置の要素を入れ替えます
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
