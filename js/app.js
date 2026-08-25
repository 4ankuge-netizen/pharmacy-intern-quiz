// アプリ全体の司令塔です。画面の切り替えと、各部品(クイズエンジンや保存モジュール)の
// つなぎ込みを行います。

import { filterQuestions, getWeakPointQuestions, checkAnswer, shuffle } from './quiz-engine.js';
import { createStorage } from './storage.js';
import { computeCategoryAccuracy } from './stats.js';

const storage = createStorage(window.localStorage);

let allQuestions = [];
let categories = [];
let currentSession = []; // 今出題中の問題の配列
let currentIndex = 0;
// 出題できる問題が0件だったときに表示する案内文。
// 「まだクイズを始めていない」のか「弱点がない」のかで文言を変えたいので、
// 出題を始めるたびにその状況に合った文をここに入れておく
let emptySessionMessage = 'ホームからカテゴリーを選んでください。';

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
    fetch('data/questions-sample.json'),
    fetch('data/categories.json'),
  ]);
  allQuestions = await questionsRes.json();
  categories = await categoriesRes.json();
}

// 画面切り替え:指定したscreenだけ表示し、他は隠す
function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach((el) => {
    el.hidden = el.id !== screenId;
  });
  // 今いる画面のタブに印を付けて、現在地が分かるようにする
  document.querySelectorAll('.app-nav button').forEach((button) => {
    const isCurrent = button.dataset.screen === screenId;
    button.classList.toggle('active', isCurrent);
    button.setAttribute('aria-current', isCurrent ? 'page' : 'false');
  });
  if (screenId === 'stats-screen') renderStats();
  if (screenId === 'bookmark-screen') renderBookmarks();
  if (screenId === 'quiz-screen') renderQuestion();
}

function renderHome() {
  const list = document.getElementById('category-list');
  list.innerHTML = '';
  categories.forEach((category) => {
    const button = document.createElement('button');
    button.className = 'category-item';
    button.textContent = category.name;
    button.addEventListener('click', () => startQuiz({ categoryId: category.id }));
    list.appendChild(button);
  });
}

function startQuiz({ categoryId } = {}) {
  const filtered = filterQuestions(allQuestions, { categoryId });
  currentSession = shuffle(filtered);
  currentIndex = 0;
  emptySessionMessage = 'このカテゴリーにはまだ問題がありません。';
  showScreen('quiz-screen');
}

function startWeakPointQuiz() {
  const wrongIds = storage.getWrongQuestionIds();
  currentSession = shuffle(getWeakPointQuestions(allQuestions, wrongIds));
  currentIndex = 0;
  emptySessionMessage = '間違えた問題はまだありません。まずはカテゴリーを選んで解いてみましょう。';
  showScreen('quiz-screen');
}

function renderQuestion() {
  const feedback = document.getElementById('answer-feedback');
  feedback.hidden = true;

  // 前の問題で押された判子が残っていたら消しておく
  document.getElementById('hanko-slot').innerHTML = '';

  if (currentSession.length === 0) {
    // 出題できる問題がないときは、次に何をすればいいかが分かる案内を出す
    document.getElementById('question-text').textContent = emptySessionMessage;
    document.getElementById('choice-list').innerHTML = '';
    document.getElementById('quiz-progress').textContent = '';
    return;
  }

  const question = currentSession[currentIndex];
  document.getElementById('quiz-progress').textContent =
    `${currentIndex + 1} / ${currentSession.length} 問目`;
  document.getElementById('question-text').textContent = question.question;

  const bookmarkIds = storage.getBookmarkIds();
  const bookmarkButton = document.getElementById('bookmark-toggle-button');
  bookmarkButton.textContent = bookmarkIds.includes(question.id) ? '★ ブックマーク解除' : '☆ ブックマーク';

  const choiceList = document.getElementById('choice-list');
  choiceList.innerHTML = '';
  question.choices.forEach((choiceText, index) => {
    const button = document.createElement('button');
    button.textContent = choiceText;
    button.addEventListener('click', () => onAnswer(question, index, button));
    choiceList.appendChild(button);
  });
}

function onAnswer(question, selectedIndex, selectedButton) {
  const isCorrect = checkAnswer(question, selectedIndex);
  const today = getTodayLocalDate();

  storage.recordAnswer(question.id, isCorrect, today);
  storage.updateStreakOnAnswer(today);
  renderStreak();

  // 選んだボタンと、正解のボタンに色をつける
  const buttons = document.querySelectorAll('#choice-list button');
  buttons[question.correctIndex].classList.add('correct');
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
  if (currentIndex >= currentSession.length) {
    currentIndex = 0;
  }
  renderQuestion();
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
  document.getElementById('next-question-button').addEventListener('click', onNextQuestion);
  document.getElementById('bookmark-toggle-button').addEventListener('click', onToggleBookmark);
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
