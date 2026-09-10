// アプリ全体の司令塔です。画面の切り替えと、各部品(クイズエンジンや保存モジュール)の
// つなぎ込みを行います。

import {
  filterQuestions,
  getWeakPointQuestions,
  checkAnswer,
  pickRandomQuestions,
  shuffleChoices,
} from './quiz-engine.js';
import { createStorage } from './storage.js';
import { computeCategoryAccuracy, summarizeAccuracy } from './stats.js';

const storage = createStorage(window.localStorage);

// 1回の出題で出す問題数。問題プールが増えても、1回分はこの数で区切る
const QUESTIONS_PER_SESSION = 10;

// 難易度の一覧。表示する名前と、どんな問題かの一言説明をここにまとめておく。
// 順番もこの配列のとおりに画面へ並ぶ
const DIFFICULTIES = [
  { id: 'beginner', name: '初級', description: 'まず押さえておきたい基本' },
  { id: 'intermediate', name: '中級', description: '実務で判断が必要になる内容' },
  { id: 'advanced', name: '上級', description: '専門的・応用的な内容' },
];

// 出題に使う問題(PMDAの一次資料で確認済みのものだけ)
let allQuestions = [];
// 確認前のものも含めた全問題。「確認待ちが何問あるか」を案内するために持っておく
let allQuestionsIncludingUnverified = [];
let categories = [];
let currentSession = []; // 今出題中の問題の配列
let currentIndex = 0;
// 出題できる問題が0件だったときに表示する案内文。
// 「まだクイズを始めていない」のか「弱点がない」のかで文言を変えたいので、
// 出題を始めるたびにその状況に合った文をここに入れておく
let emptySessionMessage = 'ホームからカテゴリーを選んでください。';
// 今回の出題での正解数(結果画面で使う)
let sessionCorrectCount = 0;
// 今回の出題ですでに答えた問題の記録。
// 「問題のID → 正解だったか(true/false)」の形で持つ。
// 二重に成績を記録しないための目印と、結果画面のふりかえり一覧の両方に使う
let answeredInSession = new Map();
// 「もう一度解く」で同じ出題内容をやり直せるよう、直前の出題方法を覚えておく
let lastQuizStarter = null;
// 難易度選択画面で、今どのカテゴリーを開いているか
let selectedCategory = null;
// 結果画面の見出しに出す「がん ・ 初級」のような文字列
let sessionLabel = '';
// 今回の出題がカテゴリー選択から始まったか(弱点復習モードなら false)。
// 結果画面の「別の難易度を選ぶ」ボタンを出すかどうかの判断に使う
let sessionUsedCategory = false;
// 今表示している選択肢の並びと、その中で正解が何番目か。
// 表示のたびに並び替えるため、正解の位置は問題データではなくこちらを見る
let currentChoices = null;

// 端末の現地時間で「今日」を求める(UTCの日付を使うと、日本時間では朝9時まで前日扱いになってしまうため)
function getTodayLocalDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 起動時に、問題データとカテゴリー一覧を読み込む
async function loadData() {
  const [questionsRes, categoriesRes] = await Promise.all([
    fetch('data/questions.json'),
    fetch('data/categories.json'),
  ]);
  allQuestionsIncludingUnverified = await questionsRes.json();
  // PMDAの添付文書・インタビューフォーム・ガイドラインで内容を確認できた問題だけを出題する。
  // 未確認の問題は、確認作業が済むまでアプリには出さない
  allQuestions = allQuestionsIncludingUnverified.filter((q) => q.verified);
  categories = await categoriesRes.json();
}

// 画面切り替え:指定したscreenだけ表示し、他は隠す
function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach((el) => {
    el.hidden = el.id !== screenId;
  });
  // 今いる画面のタブに印を付けて、現在地が分かるようにする。
  // 難易度を選ぶ画面はカテゴリー選びの続きなので「ホーム」、
  // 結果画面はクイズの流れの一部なので「クイズ」を選択中として扱う
  let tabToHighlight = screenId;
  if (screenId === 'result-screen') tabToHighlight = 'quiz-screen';
  if (screenId === 'difficulty-screen') tabToHighlight = 'home-screen';
  document.querySelectorAll('.app-nav button').forEach((button) => {
    const isCurrent = button.dataset.screen === tabToHighlight;
    button.classList.toggle('active', isCurrent);
    button.setAttribute('aria-current', isCurrent ? 'page' : 'false');
  });
  if (screenId === 'difficulty-screen') renderDifficultyScreen();
  if (screenId === 'stats-screen') renderStats();
  if (screenId === 'bookmark-screen') renderBookmarks();
  if (screenId === 'quiz-screen') renderQuestion();
  if (screenId === 'result-screen') renderResult();
}

// カテゴリーごとの色を、その部品に持たせる。
// CSS側で --cat-cancer のような名前の色をあらかじめ用意してあるので、
// ここでは「この部品の --cat は、がんの色を使う」と指定するだけでよい。
// これでホーム・正答率・ブックマークの3画面が同じ色で揃う
function applyCategoryColor(element, categoryId) {
  element.style.setProperty('--cat', `var(--cat-${categoryId}, var(--cat-default))`);
}

function renderHome() {
  const list = document.getElementById('category-list');
  list.innerHTML = '';
  categories.forEach((category) => {
    const button = document.createElement('button');
    button.className = 'category-item';
    applyCategoryColor(button, category.id);

    const nameEl = document.createElement('span');
    nameEl.textContent = category.name;

    // そのカテゴリーに何問入っているかを添えて、選ぶときの目安にしてもらう
    const count = filterQuestions(allQuestions, { categoryId: category.id }).length;
    const countEl = document.createElement('span');
    countEl.className = 'category-count';
    countEl.textContent = `全${count}問`;

    button.append(nameEl, countEl);
    // カテゴリーを選んだら、すぐ出題せずに難易度を選ぶ画面へ進む
    button.addEventListener('click', () => openDifficultyScreen(category));
    list.appendChild(button);
  });
}

// 難易度を選ぶ画面を開く
function openDifficultyScreen(category) {
  selectedCategory = category;
  showScreen('difficulty-screen');
}

// 難易度を選ぶ画面の中身を作る。
// 初級・中級・上級それぞれについて「何問あるか」「これまでの正答率」を添える
function renderDifficultyScreen() {
  if (!selectedCategory) return;

  document.getElementById('difficulty-title').textContent = `${selectedCategory.name} － 難易度を選んでください`;

  const list = document.getElementById('difficulty-list');
  list.innerHTML = '';
  const history = storage.getHistory();

  DIFFICULTIES.forEach((difficulty) => {
    const pool = filterQuestions(allQuestions, {
      categoryId: selectedCategory.id,
      difficulty: difficulty.id,
    });
    const summary = summarizeAccuracy(pool, history);

    const button = document.createElement('button');
    button.className = 'difficulty-item';
    button.dataset.difficulty = difficulty.id; // 難易度ごとに色を変えるための目印(CSS側で使う)

    const nameEl = document.createElement('span');
    nameEl.className = 'difficulty-name';
    nameEl.textContent = difficulty.name;

    const descEl = document.createElement('span');
    descEl.className = 'difficulty-desc';
    descEl.textContent = difficulty.description;

    // 問題数と、これまでの正答率(まだ解いていなければ「未回答」)
    const metaEl = document.createElement('span');
    metaEl.className = 'difficulty-meta';
    metaEl.textContent =
      summary.answered === 0
        ? `全${summary.totalQuestions}問 ・ 未回答`
        : `全${summary.totalQuestions}問 ・ 正答率 ${summary.accuracyPercent}%`;

    button.append(nameEl, descEl, metaEl);

    // 問題が1問も入っていない難易度は、押しても出題できないので押せなくする
    if (pool.length === 0) {
      button.disabled = true;
      metaEl.textContent = '準備中';
    } else {
      button.addEventListener('click', () =>
        startQuiz({ categoryId: selectedCategory.id, difficulty: difficulty.id })
      );
    }

    list.appendChild(button);
  });
}

// 出題を始めるときの共通の準備(点数や答えた記録をまっさらに戻す)。
// プール全体からランダムに10問だけ選ぶので、問題が増えても1回分の長さは変わらない
function beginSession({ pool, emptyMessage, starter, label, fromCategory = false }) {
  currentSession = pickRandomQuestions(pool, QUESTIONS_PER_SESSION);
  currentIndex = 0;
  sessionCorrectCount = 0;
  answeredInSession = new Map();
  emptySessionMessage = emptyMessage;
  lastQuizStarter = starter;
  sessionLabel = label;
  sessionUsedCategory = fromCategory;
  showScreen('quiz-screen');
}

function startQuiz({ categoryId, difficulty } = {}) {
  const pool = filterQuestions(allQuestions, { categoryId, difficulty });
  // 問題自体は入っているのに、確認作業がまだ済んでいないだけ、という場合は
  // その理由が分かる案内にする
  const unverifiedCount = filterQuestions(allQuestionsIncludingUnverified, { categoryId, difficulty })
    .filter((q) => !q.verified).length;
  const message =
    unverifiedCount > 0
      ? `ここには確認待ちの問題が${unverifiedCount}問あります。PMDAの資料での確認が済んだものから出題されます。`
      : 'ここにはまだ問題がありません。';

  // 結果画面に出す見出し(「がん ・ 初級」など)を作っておく
  const categoryName = categories.find((c) => c.id === categoryId)?.name ?? '';
  const difficultyName = DIFFICULTIES.find((d) => d.id === difficulty)?.name ?? '';
  const label = [categoryName, difficultyName].filter(Boolean).join(' ・ ');

  beginSession({
    pool,
    emptyMessage: message,
    starter: () => startQuiz({ categoryId, difficulty }),
    label,
    fromCategory: Boolean(categoryId),
  });
}

function startWeakPointQuiz() {
  const wrongIds = storage.getWrongQuestionIds();
  beginSession({
    pool: getWeakPointQuestions(allQuestions, wrongIds),
    emptyMessage: '間違えた問題はまだありません。まずはカテゴリーを選んで解いてみましょう。',
    starter: startWeakPointQuiz,
    label: '弱点復習モード',
  });
}

function renderQuestion() {
  const feedback = document.getElementById('answer-feedback');
  feedback.hidden = true;

  // 前の問題で押された判子が残っていたら消しておく
  document.getElementById('hanko-slot').innerHTML = '';

  const progressFill = document.getElementById('quiz-progress-fill');

  if (currentSession.length === 0) {
    // 出題できる問題がないときは、次に何をすればいいかが分かる案内を出す
    document.getElementById('question-text').textContent = emptySessionMessage;
    document.getElementById('choice-list').innerHTML = '';
    document.getElementById('quiz-progress').textContent = '';
    progressFill.style.width = '0%';
    return;
  }

  const question = currentSession[currentIndex];
  document.getElementById('quiz-progress').textContent =
    `${currentIndex + 1} / ${currentSession.length} 問目`;
  // 進み具合のバーを伸ばす。1問目でも少しは色が見えるよう、今の問題を含めた割合にする
  progressFill.style.width = `${((currentIndex + 1) / currentSession.length) * 100}%`;
  document.getElementById('question-text').textContent = question.question;

  const bookmarkIds = storage.getBookmarkIds();
  const bookmarkButton = document.getElementById('bookmark-toggle-button');
  bookmarkButton.textContent = bookmarkIds.includes(question.id) ? '★ ブックマーク解除' : '☆ ブックマーク';

  // 選択肢は表示するたびに並び替える。
  // 位置を覚えて答えてしまうのを防ぐため、同じ問題でも毎回並びが変わる
  currentChoices = shuffleChoices(question);

  const choiceList = document.getElementById('choice-list');
  choiceList.innerHTML = '';
  currentChoices.choices.forEach((choiceText, index) => {
    const button = document.createElement('button');
    button.textContent = choiceText;
    button.addEventListener('click', () => onAnswer(question, index, button));
    choiceList.appendChild(button);
  });
}

function onAnswer(question, selectedIndex, selectedButton) {
  // 正解かどうかは、今表示している並びの中での位置で判定する
  const isCorrect = checkAnswer(currentChoices, selectedIndex);

  // 同じ問題を1回の出題の中で二度答えた場合、成績を二重に数えない。
  // (画面を切り替えて戻ってきたときに、もう一度答えられてしまうため)
  if (!answeredInSession.has(question.id)) {
    answeredInSession.set(question.id, isCorrect);
    if (isCorrect) sessionCorrectCount += 1;

    const today = getTodayLocalDate();
    storage.recordAnswer(question.id, isCorrect, today);
    storage.updateStreakOnAnswer(today);
    renderStreak();
  }

  // 選んだボタンと、正解のボタンに色をつける
  const buttons = document.querySelectorAll('#choice-list button');
  buttons[currentChoices.correctIndex].classList.add('correct');
  if (!isCorrect) selectedButton.classList.add('incorrect');
  buttons.forEach((b) => (b.disabled = true));

  // 正解したときだけ、問題番号の横に判子(はんこ)が押される演出を出す
  if (isCorrect) {
    const hanko = document.createElement('div');
    hanko.id = 'hanko-mark';
    hanko.className = 'hanko';
    const hankoText = document.createElement('span');
    hankoText.textContent = '正';
    hanko.appendChild(hankoText);
    document.getElementById('hanko-slot').appendChild(hanko);
  }

  document.getElementById('feedback-result').textContent = isCorrect ? '正解!' : '不正解';
  // 不正解のときだけ解説パネルに目印を付ける。見出しの文字色を朱色にするのはCSS側の役目
  document.getElementById('answer-feedback').classList.toggle('is-wrong', !isCorrect);
  document.getElementById('feedback-explanation').textContent = question.explanation;

  // 出典を表示する。URLがある場合はクリックできるリンクにする
  const sourceContainer = document.getElementById('feedback-source');
  sourceContainer.textContent = ''; // 前の問題の表示をクリアする
  const sourceName = question.source?.name ?? '不明';
  const sourceUrl = question.source?.url ?? '';
  // http/httpsのURLだけをリンクにする(他の形式のURLが紛れ込んでも実行されないようにするため)
  const isSafeUrl = /^https?:\/\//i.test(sourceUrl);

  sourceContainer.append(`出典: ${sourceName}`);
  if (isSafeUrl) {
    sourceContainer.append('(');
    const link = document.createElement('a');
    link.href = sourceUrl;
    link.textContent = sourceUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    sourceContainer.append(link);
    sourceContainer.append(')');
  }

  document.getElementById('answer-feedback').hidden = false;
}

function onNextQuestion() {
  currentIndex += 1;
  // 最後の問題まで解き終えたら、1問目に戻さず結果画面を出す
  if (currentIndex >= currentSession.length) {
    showScreen('result-screen');
    return;
  }
  renderQuestion();
}

function renderResult() {
  const total = currentSession.length;
  const correct = sessionCorrectCount;

  // 正答率の円グラフ。--pct に 0〜100 を入れると、その割合だけ緑に塗られる
  const percent = total === 0 ? 0 : Math.round((correct / total) * 100);
  document.getElementById('score-ring').style.setProperty('--pct', percent);
  document.getElementById('score-ring-pct').textContent = `${percent}`;

  // 「10問中 8問正解」の、数字の部分だけ大きく見せる
  const scoreEl = document.getElementById('result-score');
  scoreEl.textContent = '';
  const countEl = document.createElement('span');
  countEl.className = 'result-count';
  countEl.textContent = `${correct}`;
  scoreEl.append(`${total}問中 `, countEl, '問正解');

  const wrongCount = total - correct;
  document.getElementById('result-correct-count').textContent = `${correct}`;
  document.getElementById('result-wrong-count').textContent = `${wrongCount}`;

  // どのカテゴリー・難易度を解いたのかを、カードの上に小さく出す
  const eyebrowEl = document.getElementById('result-eyebrow');
  eyebrowEl.textContent = sessionLabel;

  // 成績に応じてねぎらいの言葉を変える。同じ文面が毎回出ると飽きるため
  const commentEl = document.getElementById('result-comment');
  if (total === 0) {
    commentEl.textContent = '';
  } else if (wrongCount === 0) {
    commentEl.textContent = '全問正解です。この調子で次の難易度に進みましょう。';
  } else if (percent >= 80) {
    commentEl.textContent = `よくできています。間違えた${wrongCount}問を見直せば完璧です。`;
  } else if (percent >= 50) {
    commentEl.textContent = `半分以上正解できました。間違えた${wrongCount}問は「弱点復習モード」で解き直せます。`;
  } else {
    commentEl.textContent = '解説を読み返してから、もう一度解いてみましょう。間違えた問題は「弱点復習モード」にたまっています。';
  }

  // 「別の難易度を選ぶ」は、カテゴリーから始めたときだけ意味があるので、
  // 弱点復習モードで解いたときは隠しておく
  document.getElementById('other-difficulty-button').hidden = selectedCategory === null || !sessionUsedCategory;

  renderResultReview();
}

// 今回出た問題を1行ずつ並べる。行を開くと解説と出典が読める。
// 解き終えた直後にその場で復習できるようにするための一覧
function renderResultReview() {
  const list = document.getElementById('result-review-list');
  const title = document.getElementById('result-review-title');
  list.innerHTML = '';

  // 1問も解いていないとき(出題できる問題が無かったとき)は一覧ごと隠す
  const answered = currentSession.filter((q) => answeredInSession.has(q.id));
  const isEmpty = answered.length === 0;
  title.hidden = isEmpty;
  list.hidden = isEmpty;
  if (isEmpty) return;

  answered.forEach((question, index) => {
    const isCorrect = answeredInSession.get(question.id);

    // <details> は、クリックすると中身が開く仕組みがブラウザに元から備わっているタグ。
    // 自分で開閉の処理を書かなくてよいので、動きが安定する
    const item = document.createElement('details');
    item.className = 'review-item';
    item.dataset.result = isCorrect ? 'correct' : 'wrong';

    const summary = document.createElement('summary');
    const badge = document.createElement('span');
    badge.className = 'review-badge';
    badge.textContent = isCorrect ? '○' : '×';
    const text = document.createElement('span');
    text.className = 'review-question';
    text.textContent = `${index + 1}. ${question.question}`;
    summary.append(badge, text);

    const body = document.createElement('div');
    body.className = 'review-body';

    const answerEl = document.createElement('p');
    answerEl.className = 'review-answer';
    answerEl.append('正解: ');
    const answerText = document.createElement('b');
    answerText.textContent = question.choices[question.correctIndex];
    answerEl.append(answerText);

    const explanationEl = document.createElement('p');
    explanationEl.className = 'review-explanation';
    explanationEl.textContent = question.explanation;

    const sourceEl = document.createElement('p');
    sourceEl.className = 'review-source';
    sourceEl.textContent = `出典: ${question.source?.name ?? '不明'}`;

    body.append(answerEl, explanationEl, sourceEl);
    item.append(summary, body);
    list.appendChild(item);
  });
}

function onToggleBookmark() {
  const question = currentSession[currentIndex];
  if (!question) return;
  storage.toggleBookmark(question.id);
  // renderQuestion()を呼ぶと解答後の色付けや解説パネルまで消えてリセットされてしまうため、
  // ここではブックマークボタンの表示(星マーク)だけを直接書き換える
  const bookmarkIds = storage.getBookmarkIds();
  const bookmarkButton = document.getElementById('bookmark-toggle-button');
  bookmarkButton.textContent = bookmarkIds.includes(question.id) ? '★ ブックマーク解除' : '☆ ブックマーク';
}

function renderStats() {
  const result = computeCategoryAccuracy(allQuestions, storage.getHistory(), categories);
  const container = document.getElementById('stats-list');
  container.innerHTML = '';
  result.forEach((row) => {
    // カテゴリー名・棒グラフ・パーセントを横に並べた、帳簿の1行のような見た目にする
    // まだ1問も解いていないカテゴリーかどうか。
    // 「全問間違えて0%」と「未回答」を同じ0%と表示すると誤解を生むので区別する
    const isUnanswered = row.answered === 0;

    const rowEl = document.createElement('div');
    rowEl.className = 'stats-row';
    applyCategoryColor(rowEl, row.categoryId); // 棒の色をホーム画面のカードと揃える
    // マウスを乗せる(スマホでは長押しする)と、正解数の内訳が見られるようにしておく
    rowEl.title = isUnanswered
      ? 'まだ解いていません'
      : `${row.correct} / ${row.answered} 問正解`;

    const nameEl = document.createElement('span');
    nameEl.className = 'stats-name';
    nameEl.textContent = row.categoryName;

    const trackEl = document.createElement('div');
    trackEl.className = 'bar-track';
    const fillEl = document.createElement('div');
    fillEl.className = 'bar-fill';
    fillEl.style.width = isUnanswered ? '0%' : `${row.accuracyPercent}%`;
    trackEl.appendChild(fillEl);

    const pctEl = document.createElement('span');
    pctEl.className = isUnanswered ? 'stats-pct unanswered' : 'stats-pct';
    pctEl.textContent = isUnanswered ? '未回答' : `${row.accuracyPercent}%`;

    rowEl.append(nameEl, trackEl, pctEl);
    container.appendChild(rowEl);
  });
}

function renderBookmarks() {
  const bookmarkIds = storage.getBookmarkIds();
  const bookmarked = allQuestions.filter((q) => bookmarkIds.includes(q.id));
  const container = document.getElementById('bookmark-list');
  container.innerHTML = '';
  if (bookmarked.length === 0) {
    container.textContent = 'まだブックマークがありません。';
    return;
  }
  bookmarked.forEach((q) => {
    // 控え(レシート)のように、カテゴリー名のタグ+問題文を1行にする
    const rowEl = document.createElement('div');
    rowEl.className = 'bookmark-row';
    applyCategoryColor(rowEl, q.category); // 左端の線とタグの色をカテゴリーに合わせる

    const category = categories.find((c) => c.id === q.category);
    const tagEl = document.createElement('span');
    tagEl.className = 'bookmark-tag';
    tagEl.textContent = category ? category.name : q.category;

    const textEl = document.createElement('div');
    textEl.className = 'bookmark-text';
    textEl.textContent = q.question;

    rowEl.append(tagEl, textEl);
    container.appendChild(rowEl);
  });
}

function renderStreak() {
  const streak = storage.getStreak();
  // まだ1問も解いていないときに「0日目」と出ると不自然なので、
  // その場合は誘い文句に切り替える
  document.getElementById('streak-display').textContent =
    streak === 0 ? '今日から始めましょう' : `連続学習 ${streak}日目`;
}

function setupNav() {
  document.querySelectorAll('.app-nav button').forEach((button) => {
    button.addEventListener('click', () => showScreen(button.dataset.screen));
  });
  document.getElementById('weak-point-button').addEventListener('click', startWeakPointQuiz);
  // 難易度選択画面から、カテゴリー一覧へ戻る
  document.getElementById('difficulty-back-button').addEventListener('click', () => showScreen('home-screen'));
  document.getElementById('next-question-button').addEventListener('click', onNextQuestion);
  document.getElementById('bookmark-toggle-button').addEventListener('click', onToggleBookmark);
  // 結果画面のボタン
  document.getElementById('retry-button').addEventListener('click', () => {
    if (lastQuizStarter) lastQuizStarter(); // 直前と同じ内容をもう一度出題する
  });
  // 解き終わったあと、同じカテゴリーの別の難易度にすぐ移れるようにする
  document.getElementById('other-difficulty-button').addEventListener('click', () => showScreen('difficulty-screen'));
  document.getElementById('back-home-button').addEventListener('click', () => showScreen('home-screen'));
}

async function init() {
  await loadData();
  setupNav();
  renderHome();
  renderStreak();
  showScreen('home-screen');
}

init();

// service-worker.js を登録する。オフライン対応と自動更新のために必要。
// ただし、localhost で開発中は、古いキャッシュのせいで編集した内容が反映されないと混乱するため、
// Service Workerをあえて登録しない。オフライン動作や自動更新の仕組み自体を確認したいときは、
// 一時的にこのif文の条件(!isLocalDev)を外すか、localhost以外(スマホの実機など)で確認すること。
const isLocalDev = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
if ('serviceWorker' in navigator && !isLocalDev) {
  // 登録処理を始める「前」に、すでに動いていたService Workerがあったかどうかを記録しておく。
  // (activate時のclients.claim()の影響で、初回インストールでも後からcontrollerが
  //  真になってしまうため、「更新かどうか」の判定はこの時点の状態を先に覚えておく必要がある)
  const hadController = Boolean(navigator.serviceWorker.controller);

  navigator.serviceWorker.register('./service-worker.js').then((registration) => {
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      newWorker.addEventListener('statechange', () => {
        // 登録前からすでに動いていたService Workerがあった場合だけ、
        // 「新しいバージョンに切り替わった」とみなして再読み込みする
        if (newWorker.state === 'activated' && hadController) {
          window.location.reload();
        }
      });
    });
  });
}
