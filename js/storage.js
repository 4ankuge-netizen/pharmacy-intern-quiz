// スマホの中(ローカルストレージ)に、学習の記録を保存したり読み出したりするための部品です。
// テストのときはローカルストレージの代わりに「ふりの保存先(メモリ上のオブジェクト)」を渡せるようにしてあります。

const HISTORY_KEY = 'pharmacyQuiz.history';
const BOOKMARK_KEY = 'pharmacyQuiz.bookmarks';
const STREAK_KEY = 'pharmacyQuiz.streak';

export function createStorage(backend) {
  function readJSON(key, fallback) {
    const raw = backend.getItem(key);
    if (raw === null || raw === undefined) return fallback;
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    backend.setItem(key, JSON.stringify(value));
  }

  return {
    // 1問答えるたびに呼び出す。正解・不正解の記録を残す。
    recordAnswer(questionId, isCorrect, answeredAtISODate) {
      const history = readJSON(HISTORY_KEY, {});
      const prev = history[questionId] || { correctCount: 0, wrongCount: 0 };
      history[questionId] = {
        correctCount: prev.correctCount + (isCorrect ? 1 : 0),
        wrongCount: prev.wrongCount + (isCorrect ? 0 : 1),
        lastResult: isCorrect ? 'correct' : 'wrong',
        lastAnsweredAt: answeredAtISODate,
      };
      writeJSON(HISTORY_KEY, history);
    },

    getHistory() {
      return readJSON(HISTORY_KEY, {});
    },

    // 直近の回答が「不正解」だった問題のIDだけを集める(弱点復習モード用)
    getWrongQuestionIds() {
      const history = readJSON(HISTORY_KEY, {});
      return Object.keys(history).filter((id) => history[id].lastResult === 'wrong');
    },

    toggleBookmark(questionId) {
      const bookmarks = readJSON(BOOKMARK_KEY, []);
      const index = bookmarks.indexOf(questionId);
      if (index === -1) {
        bookmarks.push(questionId);
      } else {
        bookmarks.splice(index, 1);
      }
      writeJSON(BOOKMARK_KEY, bookmarks);
      return bookmarks;
    },

    getBookmarkIds() {
      return readJSON(BOOKMARK_KEY, []);
    },

    // 今日勉強したことを記録し、連続学習日数を更新する。
    // todayISODate は "2026-08-25" のような形式の文字列。
    updateStreakOnAnswer(todayISODate) {
      const streak = readJSON(STREAK_KEY, { count: 0, lastActiveDate: null });

      if (streak.lastActiveDate === todayISODate) {
        // 今日はもう記録済みなので何もしない
        return streak.count;
      }

      const yesterday = addDays(todayISODate, -1);
      const isConsecutive = streak.lastActiveDate === yesterday;
      const newCount = isConsecutive ? streak.count + 1 : 1;

      writeJSON(STREAK_KEY, { count: newCount, lastActiveDate: todayISODate });
      return newCount;
    },

    getStreak() {
      return readJSON(STREAK_KEY, { count: 0, lastActiveDate: null }).count;
    },
  };
}

// "2026-08-25" のような日付文字列に、日数を足し引きするための小さな関数
function addDays(isoDateString, diff) {
  const date = new Date(isoDateString + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + diff);
  return date.toISOString().slice(0, 10);
}
