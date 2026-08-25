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
  if (screenId === 'stats-screen') renderStats();
  if (screenId === 'bookmark-screen') renderBookmarks();
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
  showScreen('quiz-screen');
  renderQuestion();
}

function startWeakPointQuiz() {
  const wrongIds = storage.getWrongQuestionIds();
  currentSession = shuffle(getWeakPointQuestions(allQuestions, wrongIds));
  currentIndex = 0;
  showScreen('quiz-screen');
  renderQuestion();
}

function renderQuestion() {
  const feedback = document.getElementById('answer-feedback');
  feedback.hidden = true;

  if (currentSession.length === 0) {
    document.getElementById('question-text').textContent = '出題できる問題がありません。';
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
  const today = new Date().toISOString().slice(0, 10);

  storage.recordAnswer(question.id, isCorrect, today);
  storage.updateStreakOnAnswer(today);
  renderStreak();

  // 選んだボタンと、正解のボタンに色をつける
  const buttons = document.querySelectorAll('#choice-list button');
  buttons[question.correctIndex].classList.add('correct');
  if (!isCorrect) selectedButton.classList.add('incorrect');
  buttons.forEach((b) => (b.disabled = true));

  document.getElementById('feedback-result').textContent = isCorrect ? '正解!' : '不正解';
  document.getElementById('feedback-explanation').textContent = question.explanation;
  const sourceText = question.source?.url
    ? `出典: ${question.source.name}(${question.source.url})`
    : `出典: ${question.source?.name ?? '不明'}`;
  document.getElementById('feedback-source').textContent = sourceText;
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
    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <p>${row.categoryName}: ${row.correct} / ${row.answered} 問正解(${row.accuracyPercent}%)</p>
      <div class="bar-track"><div class="bar-fill" style="width: ${row.accuracyPercent}%"></div></div>
    `;
    container.appendChild(wrapper);
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
    const item = document.createElement('p');
    item.textContent = q.question;
    container.appendChild(item);
  });
}

function renderStreak() {
  const streak = storage.getStreak();
  document.getElementById('streak-display').textContent = `🔥 連続学習 ${streak}日目`;
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
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./service-worker.js').then((registration) => {
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      newWorker.addEventListener('statechange', () => {
        // すでに動いていたService Workerがある状態で新しいものが有効になった場合だけ、
        // 「新しいバージョンに切り替わった」とみなして再読み込みする
        if (newWorker.state === 'activated' && navigator.serviceWorker.controller) {
          window.location.reload();
        }
      });
    });
  });
}
