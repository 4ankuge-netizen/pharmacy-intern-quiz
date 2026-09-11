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
import { encodeReport, decodeReport, parsePastedReports } from './report-code.js';
import {
  needsSending,
  lastSentKey,
  sendReport,
  fetchReports,
  TEACHER_KEY_STORAGE,
} from './report-sync.js';

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
// 成績の送り先の設定。data/report-endpoint.json から読み込む。
// enabled が false のあいだは、自動送信も先生用の読み込みも行わない
let reportEndpoint = { enabled: false };
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

  // 送り先の設定は「あれば使う」扱い。読めなくてもアプリ本体は動かしたいので、
  // 失敗しても止めずに「送れない状態」として続ける
  try {
    const res = await fetch('data/report-endpoint.json');
    if (res.ok) reportEndpoint = await res.json();
  } catch {
    reportEndpoint = { enabled: false };
  }
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
  // 利用者の切り替え画面はヘッダーから開くので、どのタブも選択中にしない。
  // 先生用の成績まとめ画面もその続きなので同じ扱いにする
  if (screenId === 'profile-screen' || screenId === 'report-screen') tabToHighlight = null;
  document.querySelectorAll('.app-nav button').forEach((button) => {
    const isCurrent = button.dataset.screen === tabToHighlight;
    button.classList.toggle('active', isCurrent);
    button.setAttribute('aria-current', isCurrent ? 'page' : 'false');
  });
  if (screenId === 'difficulty-screen') renderDifficultyScreen();
  if (screenId === 'profile-screen') renderProfileScreen();
  if (screenId === 'report-screen') renderReportScreen();
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

  // 疑義照会の問題は「必要か不要か」を先に選ぶ2段階の形式なので、別の作り方をする
  if (question.type === 'query') {
    document.getElementById('question-text').classList.add('is-query');
    renderQueryStep1(question);
    return;
  }
  document.getElementById('question-text').classList.remove('is-query');

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

/*
  疑義照会の問題の1段階目。
  「疑義照会は不要」「疑義照会が必要」の2つだけを出す。

  なぜ2段階に分けるか:
    処方監査でまず問われるのは「そもそも照会が要るのか」という判断です。
    理由の選択肢を最初から並べてしまうと、選択肢を見た時点で
    「何か問題があるらしい」と分かってしまい、その練習になりません。
*/
function renderQueryStep1(question) {
  const choiceList = document.getElementById('choice-list');
  choiceList.innerHTML = '';

  [
    { label: '疑義照会は不要', chose: false },
    { label: '疑義照会が必要', chose: true },
  ].forEach(({ label, chose }) => {
    const button = document.createElement('button');
    button.textContent = label;
    button.addEventListener('click', () => onQueryStep1(question, chose));
    choiceList.appendChild(button);
  });
}

// 1段階目に答えたときの処理
function onQueryStep1(question, choseNeedsQuery) {
  const buttons = [...document.querySelectorAll('#choice-list button')];
  const correctButton = question.needsQuery ? buttons[1] : buttons[0];
  const chosenButton = choseNeedsQuery ? buttons[1] : buttons[0];

  // 判断が合っていたかどうかで色を付ける
  correctButton.classList.add('correct');
  if (choseNeedsQuery !== question.needsQuery) chosenButton.classList.add('incorrect');
  buttons.forEach((b) => (b.disabled = true));

  // 「必要」が正解で、実際に「必要」を選べたときだけ、理由を選ぶ2段階目へ進む。
  // それ以外は、この時点で答え合わせを表示する
  if (question.needsQuery && choseNeedsQuery) {
    renderQueryStep2(question);
    return;
  }
  finishAnswer(question, choseNeedsQuery === question.needsQuery);
}

// 疑義照会の問題の2段階目。照会が必要な理由を5つの中から選ぶ
function renderQueryStep2(question) {
  const choiceList = document.getElementById('choice-list');

  // 1段階目の答えを残したまま、その下に理由を出す
  const heading = document.createElement('p');
  heading.className = 'query-step2-heading';
  heading.textContent = '照会が必要な理由として最も適切なのはどれか。';
  choiceList.appendChild(heading);

  // 理由の選択肢は専用の入れ物にまとめて入れる。
  // こうしておくと、1段階目のA・Bとは別に、Aから番号を振り直せる
  const reasonList = document.createElement('div');
  reasonList.className = 'query-reasons';

  currentChoices = shuffleChoices(question);
  currentChoices.choices.forEach((choiceText, index) => {
    const button = document.createElement('button');
    button.className = 'query-reason';
    button.textContent = choiceText;
    button.addEventListener('click', () => onQueryStep2(question, index, button));
    reasonList.appendChild(button);
  });
  choiceList.appendChild(reasonList);
}

// 2段階目(理由)に答えたときの処理
function onQueryStep2(question, selectedIndex, selectedButton) {
  const isCorrect = checkAnswer(currentChoices, selectedIndex);
  const buttons = [...document.querySelectorAll('#choice-list button.query-reason')];

  buttons[currentChoices.correctIndex].classList.add('correct');
  if (!isCorrect) selectedButton.classList.add('incorrect');
  buttons.forEach((b) => (b.disabled = true));

  finishAnswer(question, isCorrect);
}

function onAnswer(question, selectedIndex, selectedButton) {
  // 正解かどうかは、今表示している並びの中での位置で判定する
  const isCorrect = checkAnswer(currentChoices, selectedIndex);

  // 選んだボタンと、正解のボタンに色をつける
  const buttons = document.querySelectorAll('#choice-list button');
  buttons[currentChoices.correctIndex].classList.add('correct');
  if (!isCorrect) selectedButton.classList.add('incorrect');
  buttons.forEach((b) => (b.disabled = true));

  finishAnswer(question, isCorrect);
}

/*
  答え合わせの共通処理。
  成績の記録と、解説パネルの表示を行う。
  ふつうの問題と疑義照会の問題では選択肢の出し方が違うため、
  「どのボタンに色を付けるか」は呼び出す側で済ませておき、
  ここでは形式によらず同じ処理だけを行う
*/
function finishAnswer(question, isCorrect) {
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

  // 解き終わったこの区切りで、成績を先生へ送る。
  // 待たずに先へ進むので、結果画面の表示が遅くなることはない
  syncReport();

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
    if (question.type === 'query') {
      // 疑義照会の問題は「必要か不要か」が答え。
      // 必要な場合は、その理由もあわせて示す
      answerText.textContent = question.needsQuery
        ? `疑義照会が必要 ／ ${question.choices[question.correctIndex]}`
        : '疑義照会は不要';
    } else {
      answerText.textContent = question.choices[question.correctIndex];
    }
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

// ---------------------------------------------------------------------------
// 利用者(プロフィール)まわり。
// 1台の端末を実習生が交代で使うため、誰の記録なのかを常に見えるようにしている
// ---------------------------------------------------------------------------

// ヘッダーに「今この端末を使っている人」の名前を出す
function renderProfileChip() {
  const profile = storage.getCurrentProfile();
  document.getElementById('profile-chip').textContent = profile ? profile.name : '利用者';
}

function renderProfileScreen() {
  // 送り先が設定されているときだけ「先生への報告」の案内を出す
  document.getElementById('send-report-section').hidden = !reportEndpoint.enabled;
  if (reportEndpoint.enabled) {
    const profile = storage.getCurrentProfile();
    const sent = profile ? readLastSent(profile.id) : null;
    renderSendStatus(sent ? '前回ぶんは送信済みです。' : 'まだ送っていません。10問解くと自動で送られます。');
  }

  const list = document.getElementById('profile-list');
  list.innerHTML = '';

  const profiles = storage.listProfiles();
  const currentId = storage.getCurrentProfile()?.id;

  profiles.forEach((profile) => {
    const row = document.createElement('div');
    row.className = 'profile-row';
    if (profile.id === currentId) row.classList.add('is-current');

    // 名前の部分を押すと、その人に切り替わる
    const switchButton = document.createElement('button');
    switchButton.className = 'profile-switch';
    switchButton.textContent = profile.name;
    switchButton.addEventListener('click', () => {
      storage.switchProfile(profile.id);
      renderProfileChip();
      renderStreak();
      renderProfileScreen();
    });

    // 名前の変更と削除。小さめのボタンで右側に並べる
    const actions = document.createElement('div');
    actions.className = 'profile-actions';

    const renameButton = document.createElement('button');
    renameButton.className = 'profile-action';
    renameButton.textContent = '名前';
    renameButton.addEventListener('click', () => {
      const newName = window.prompt('新しい名前を入力してください', profile.name);
      if (newName === null) return; // キャンセルされた
      if (storage.renameProfile(profile.id, newName)) {
        renderProfileChip();
        renderProfileScreen();
      }
    });
    actions.appendChild(renameButton);

    // 利用者が1人しかいないときは削除できない(誰もいない状態になってしまうため)
    if (profiles.length > 1) {
      const deleteButton = document.createElement('button');
      deleteButton.className = 'profile-action is-danger';
      deleteButton.textContent = '削除';
      deleteButton.addEventListener('click', () => {
        const ok = window.confirm(
          `「${profile.name}」の成績・ブックマークをすべて削除します。元に戻せません。よろしいですか。`
        );
        if (!ok) return;
        storage.deleteProfile(profile.id);
        renderProfileChip();
        renderStreak();
        renderProfileScreen();
      });
      actions.appendChild(deleteButton);
    }

    row.append(switchButton, actions);
    list.appendChild(row);
  });

  // 利用者を切り替えたときは、前の人の書き出し結果が残らないように消しておく
  hideExportOutput();
}

function onAddProfile() {
  const name = window.prompt('追加する利用者の名前を入力してください');
  if (name === null) return; // キャンセルされた
  if (!String(name).trim()) return;
  storage.addProfile(name, getTodayLocalDate());
  renderProfileChip();
  renderStreak();
  renderProfileScreen();
}

function hideExportOutput() {
  document.getElementById('export-output').hidden = true;
  document.getElementById('copy-export-button').hidden = true;
  document.getElementById('export-message').textContent = '';
}

/*
  今の利用者の成績を、そのまま貼り付けられる文章にまとめる。
  実習指導者へ提出したり、実習の記録として残したりするためのもの
*/
function buildExportText() {
  const profile = storage.getCurrentProfile();
  const history = storage.getHistory();
  const lines = [];

  lines.push('薬学実習クイズ 成績');
  lines.push(`利用者: ${profile ? profile.name : '(不明)'}`);
  lines.push(`書き出し日: ${getTodayLocalDate()}`);
  lines.push(`連続学習: ${storage.getStreak()}日`);
  lines.push('');

  lines.push('【カテゴリー別】');
  computeCategoryAccuracy(allQuestions, history, categories).forEach((row) => {
    lines.push(
      row.answered === 0
        ? `${row.categoryName}: 未回答 (全${row.totalQuestions}問)`
        : `${row.categoryName}: ${row.correct}/${row.answered}問正解 (${row.accuracyPercent}%) ／ 全${row.totalQuestions}問`
    );
  });
  lines.push('');

  lines.push('【難易度別】');
  DIFFICULTIES.forEach((difficulty) => {
    const pool = filterQuestions(allQuestions, { difficulty: difficulty.id });
    const summary = summarizeAccuracy(pool, history);
    lines.push(
      summary.answered === 0
        ? `${difficulty.name}: 未回答 (全${summary.totalQuestions}問)`
        : `${difficulty.name}: ${summary.correct}/${summary.answered}問正解 (${summary.accuracyPercent}%) ／ 全${summary.totalQuestions}問`
    );
  });
  lines.push('');

  const overall = summarizeAccuracy(allQuestions, history);
  lines.push(
    overall.answered === 0
      ? '合計: まだ回答がありません'
      : `合計: ${overall.correct}/${overall.answered}問正解 (${overall.accuracyPercent}%) ／ 全${overall.totalQuestions}問`
  );

  return lines.join('\n');
}

function onExport() {
  const output = document.getElementById('export-output');
  output.textContent = buildExportText();
  output.hidden = false;
  document.getElementById('copy-export-button').hidden = false;
  document.getElementById('export-message').textContent = '';
}

async function onCopyExport() {
  const text = document.getElementById('export-output').textContent;
  const message = document.getElementById('export-message');
  try {
    await navigator.clipboard.writeText(text);
    message.textContent = 'コピーしました。';
  } catch {
    // 端末の設定によってはコピーできないことがあるので、手で選べる旨を伝える
    message.textContent = 'コピーできませんでした。上の文章を長押しして選択してください。';
  }
}

// ============================================================
//  成績を自動で先生へ送る(実習生側)
// ============================================================

// 今の成績を短い文字列にまとめる
function buildReportCode() {
  return encodeReport({
    history: storage.getHistory(),
    questions: allQuestions,
    categories,
    date: getTodayLocalDate(),
    streak: storage.getStreak(),
  });
}

// 送信の状況を利用者画面に出す。押すボタンはないので、状態を伝えるだけ
function renderSendStatus(text) {
  const el = document.getElementById('send-report-status');
  if (el) el.textContent = text;
}

// 前回どこまで送ったかを読み書きする。利用者ごとに分けて覚える
function readLastSent(profileId) {
  try {
    return window.localStorage.getItem(lastSentKey(profileId));
  } catch {
    return null;
  }
}
function writeLastSent(profileId, code) {
  try {
    window.localStorage.setItem(lastSentKey(profileId), code);
  } catch {
    // 保存できなくても動作は続ける(次回また送るだけ)
  }
}

/**
 * 成績を先生へ送る。
 *
 * 画面を止めないよう、裏側でそっと実行する。
 * 電波がないなど失敗した場合も何も言わず、次に開いたときにもう一度試す。
 */
async function syncReport() {
  if (!reportEndpoint.enabled || !reportEndpoint.url) return;

  const profile = storage.getCurrentProfile();
  if (!profile) return;

  const code = buildReportCode();
  if (!needsSending(readLastSent(profile.id), code)) return;

  try {
    await sendReport(reportEndpoint.url, { name: profile.name, code });
    writeLastSent(profile.id, code);
    renderSendStatus(`最後に送った時刻: ${new Date().toLocaleString('ja-JP')}`);
  } catch {
    // 失敗はここで飲み込む。実習生に通信の失敗を見せても対処のしようがないため
    renderSendStatus('まだ送れていません。電波のあるところで開くと自動で送られます。');
  }
}

// ============================================================
//  みんなの成績をまとめて見る(先生側)
// ============================================================

// 先生の端末に覚えさせた合言葉を読み書きする
function readTeacherKey() {
  try {
    return window.localStorage.getItem(TEACHER_KEY_STORAGE) || '';
  } catch {
    return '';
  }
}
function writeTeacherKey(key) {
  try {
    window.localStorage.setItem(TEACHER_KEY_STORAGE, key);
  } catch {
    // 覚えられなくても、毎回入力すれば使える
  }
}

// 先生の画面を開いたときの下準備。合言葉を覚えていれば入れておく
function renderReportScreen() {
  const input = document.getElementById('report-key');
  if (input && !input.value) input.value = readTeacherKey();
}

// 合言葉を使って、届いている成績をまとめて受け取る
async function onLoadReports() {
  const message = document.getElementById('report-message');
  const output = document.getElementById('report-output');
  const key = document.getElementById('report-key').value.trim();

  output.textContent = '';

  if (!reportEndpoint.enabled || !reportEndpoint.url) {
    message.textContent = '送り先がまだ設定されていません。';
    return;
  }
  if (!key) {
    message.textContent = '合言葉を入れてください。';
    return;
  }

  message.textContent = '読み込んでいます…';

  let rows;
  try {
    rows = await fetchReports(reportEndpoint.url, key);
  } catch (error) {
    message.textContent = `読み込めませんでした：${error.message}`;
    return;
  }

  writeTeacherKey(key); // うまくいったときだけ覚える

  // 受け取った文字列を、正誤の記録に戻す
  const reports = [];
  let skipped = 0;
  for (const row of rows) {
    const decoded = decodeReport(row.code, categories);
    if (!decoded) {
      skipped += 1;
      continue;
    }
    reports.push({ name: row.name, updatedAt: row.updatedAt, ...decoded });
  }

  if (reports.length === 0) {
    message.textContent =
      skipped > 0 ? '届いた成績を読み取れませんでした。' : 'まだ誰からも届いていません。';
    return;
  }

  message.textContent =
    `${reports.length}人分を読み込みました。` + (skipped > 0 ? `（読めなかったものが${skipped}件ありました）` : '');

  renderReports(reports, output);
}

// 通信を使わず、貼り付けた内容から読む(逃げ道)
function onPasteReports() {
  const message = document.getElementById('report-message');
  const output = document.getElementById('report-output');
  const pasted = document.getElementById('report-input').value;

  output.textContent = '';

  if (!pasted.trim()) {
    message.textContent = '先に成績データを貼り付けてください。';
    return;
  }

  const { reports, skipped } = parsePastedReports(pasted, categories);

  if (reports.length === 0) {
    message.textContent = '成績データが見つかりませんでした。「名前」と「成績データ」の列をコピーできているか確認してください。';
    return;
  }

  message.textContent =
    `${reports.length}人分を読み込みました。` + (skipped > 0 ? `（読めなかった行が${skipped}行ありました）` : '');

  renderReports(reports, output);
}

function onClearReports() {
  document.getElementById('report-input').value = '';
  document.getElementById('report-output').textContent = '';
  document.getElementById('report-message').textContent = '';
}

// 読み込んだ全員分を、表と一覧にして画面に並べる
function renderReports(reports, output) {
  // 一人ひとりについて、合計とカテゴリー別をあらかじめ計算しておく
  const rows = reports.map((report) => ({
    ...report,
    overall: summarizeAccuracy(allQuestions, report.history),
    byCategory: computeCategoryAccuracy(allQuestions, report.history, categories),
  }));

  output.appendChild(renderReportSummary(rows));
  output.appendChild(renderReportCategoryTable(rows));
  rows.forEach((row) => output.appendChild(renderReportWrongList(row)));
}

// (1) ひとまとめの一覧表。誰がどれだけ進んでいるかをまず見る
function renderReportSummary(rows) {
  const section = document.createElement('section');
  section.className = 'report-block';

  const heading = document.createElement('h3');
  heading.className = 'section-title';
  heading.textContent = '全体';
  section.appendChild(heading);

  const answeredTotal = rows.reduce((sum, r) => sum + r.overall.answered, 0);
  const correctTotal = rows.reduce((sum, r) => sum + r.overall.correct, 0);
  const note = document.createElement('p');
  note.className = 'screen-note';
  note.textContent =
    `${rows.length}人 ／ 合計${answeredTotal}問回答 ／ 全体の正答率 ` +
    `${answeredTotal === 0 ? 0 : Math.round((correctTotal / answeredTotal) * 100)}%`;
  section.appendChild(note);

  section.appendChild(
    buildTable(
      ['名前', '回答数', '正答率', '連続学習', '最終更新'],
      rows.map((r) => [
        r.name,
        `${r.overall.answered}問`,
        r.overall.answered === 0 ? '—' : `${r.overall.accuracyPercent}%`,
        `${r.streak}日`,
        r.updatedAt || r.date,
      ])
    )
  );
  return section;
}

// (2) 分野ごとの正答率を、実習生を横に並べて比べる
function renderReportCategoryTable(rows) {
  const section = document.createElement('section');
  section.className = 'report-block';

  const heading = document.createElement('h3');
  heading.className = 'section-title';
  heading.textContent = '分野ごとの正答率';
  section.appendChild(heading);

  const note = document.createElement('p');
  note.className = 'screen-note';
  note.textContent = '「正解数/回答数」と正答率です。まだ答えていない分野は「—」になります。';
  section.appendChild(note);

  const body = categories.map((category, index) => {
    const cells = [category.name];
    rows.forEach((row) => {
      const stat = row.byCategory[index];
      cells.push(stat.answered === 0 ? '—' : `${stat.correct}/${stat.answered}（${stat.accuracyPercent}%）`);
    });
    return cells;
  });

  section.appendChild(buildTable(['分野', ...rows.map((r) => r.name)], body));
  return section;
}

// (3) 一人ずつ、間違えた問題を並べる。指導のときにそのまま使えるようにする
function renderReportWrongList(row) {
  const section = document.createElement('section');
  section.className = 'report-block';

  // 直近の回答が不正解だった問題を集める
  const wrong = allQuestions.filter((q) => row.history[q.id]?.lastResult === 'wrong');

  const heading = document.createElement('h3');
  heading.className = 'section-title';
  heading.textContent = `${row.name} が間違えた問題（${wrong.length}問）`;
  section.appendChild(heading);

  if (wrong.length === 0) {
    const note = document.createElement('p');
    note.className = 'screen-note';
    note.textContent = '直近の回答で間違えた問題はありません。';
    section.appendChild(note);
    return section;
  }

  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
  const difficultyName = new Map(DIFFICULTIES.map((d) => [d.id, d.name]));

  const list = document.createElement('ol');
  list.className = 'report-wrong-list';
  wrong.forEach((question) => {
    const item = document.createElement('li');

    const tag = document.createElement('span');
    tag.className = 'report-wrong-tag';
    tag.textContent = `${categoryName.get(question.category) ?? question.category} ・ ${difficultyName.get(question.difficulty) ?? question.difficulty}`;
    item.appendChild(tag);

    const text = document.createElement('p');
    text.className = 'report-wrong-question';
    // 疑義照会は症例が長いので、冒頭だけを見出しとして出す
    text.textContent =
      question.question.length > 90 ? question.question.slice(0, 90).replace(/\n/g, ' ') + '…' : question.question;
    item.appendChild(text);

    const answer = document.createElement('p');
    answer.className = 'report-wrong-answer';
    answer.textContent = `正解: ${question.choices[question.correctIndex]}`;
    item.appendChild(answer);

    list.appendChild(item);
  });
  section.appendChild(list);
  return section;
}

// 表を組み立てる小さな道具。横に長い表はCSS側で横スクロールさせる
function buildTable(headers, bodyRows) {
  const wrapper = document.createElement('div');
  wrapper.className = 'report-table-wrap';

  const table = document.createElement('table');
  table.className = 'report-table';

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  headers.forEach((label) => {
    const th = document.createElement('th');
    th.textContent = label;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  bodyRows.forEach((cells) => {
    const tr = document.createElement('tr');
    cells.forEach((value, index) => {
      const cell = document.createElement(index === 0 ? 'th' : 'td');
      cell.textContent = value;
      tr.appendChild(cell);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  wrapper.appendChild(table);
  return wrapper;
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
  // 利用者の切り替え画面
  document.getElementById('profile-chip').addEventListener('click', () => showScreen('profile-screen'));
  document.getElementById('profile-back-button').addEventListener('click', () => showScreen('home-screen'));
  document.getElementById('add-profile-button').addEventListener('click', onAddProfile);
  document.getElementById('export-button').addEventListener('click', onExport);
  document.getElementById('copy-export-button').addEventListener('click', onCopyExport);

  // 先生用:みんなの成績をまとめて見る画面。
  // 実習生の画面には入口を置かず、URLの末尾に #teacher を付けて開いたときだけ出す
  document.getElementById('report-back-button').addEventListener('click', () => {
    // 戻るときは #teacher を消しておく。付けっぱなしだと、
    // 次に開いたときにいきなり先生用の画面が出てしまうため
    history.replaceState(null, '', location.pathname + location.search);
    showScreen('home-screen');
  });
  document.getElementById('report-load-button').addEventListener('click', onLoadReports);
  document.getElementById('report-paste-button').addEventListener('click', onPasteReports);
  document.getElementById('report-clear-button').addEventListener('click', onClearReports);
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

// URLの末尾が #teacher なら先生用の画面を出す。
// 実習生には入口が見えないようにしつつ、先生はこのURLをブックマークしておけば開ける。
// (あくまで「見えにくくする」だけで、鍵をかけているわけではない)
function openTeacherScreenIfRequested() {
  if (location.hash === '#teacher') showScreen('report-screen');
}

async function init() {
  await loadData();
  setupNav();
  renderHome();
  renderProfileChip();
  renderStreak();
  showScreen('home-screen');
  openTeacherScreenIfRequested();
  // 前回うまく送れていなかった場合に備えて、起動時にも一度だけ試す
  syncReport();
  // アプリを開いたままURLの末尾を書き換えた場合にも反応させる
  window.addEventListener('hashchange', openTeacherScreenIfRequested);
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
