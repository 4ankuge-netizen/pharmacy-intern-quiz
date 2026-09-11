// スマホの中(ローカルストレージ)に、学習の記録を保存したり読み出したりするための部品です。
// テストのときはローカルストレージの代わりに「ふりの保存先(メモリ上のオブジェクト)」を渡せるようにしてあります。
//
// 【利用者(プロフィール)について】
// 1台の端末を複数の実習生が使うことを想定しているため、記録は「利用者ごと」に分けて保存します。
// 保存するときの名前(キー)の後ろに利用者の番号を付けることで、混ざらないようにしています。
//   例) pharmacyQuiz.history:p_abc123  … p_abc123 さんの学習履歴
// 利用者の一覧と「今は誰が使っているか」だけは、利用者に関係なく1つだけ持ちます。

const PROFILES_KEY = 'pharmacyQuiz.profiles';
const CURRENT_PROFILE_KEY = 'pharmacyQuiz.currentProfile';

// 利用者ごとに分けて保存するデータの、名前の先頭部分
const HISTORY_KEY = 'pharmacyQuiz.history';
const BOOKMARK_KEY = 'pharmacyQuiz.bookmarks';
const STREAK_KEY = 'pharmacyQuiz.streak';
// 成績を先生に送るかどうかの設定
const SHARE_KEY = 'pharmacyQuiz.share';
// 前回どこまで送ったか(report-sync.js が使う名前と揃えてある)
const LAST_SENT_KEY = 'pharmacyQuiz.lastSent';

/*
  成績を先生に送るかどうかの3段階。
  見られたくないものは人によって違うので、「全部か無いか」ではなく途中を用意している。
    none    … 何も送らない(初期値)
    summary … 分野ごとの正答率だけ送る(間違えた問題は端末から出さない)
    full    … 間違えた問題も含めて送る
*/
export const SHARE_LEVELS = ['none', 'summary', 'full'];
export const DEFAULT_SHARE_LEVEL = 'none';

// 利用者を1人も作っていない端末で、最初に用意される人の名前
const DEFAULT_PROFILE_NAME = '利用者1';

// 利用者を見分けるための番号を作る。
// 時刻と乱数を組み合わせているので、同じ番号が二度できることはまずない
function createProfileId() {
  return `p_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function createStorage(backend) {
  function readJSON(key, fallback) {
    const raw = backend.getItem(key);
    if (raw === null || raw === undefined) return fallback;
    try {
      const parsed = JSON.parse(raw);
      // 中身が空(null)だったときも、初期値を返しておく
      return parsed === null ? fallback : parsed;
    } catch {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    backend.setItem(key, JSON.stringify(value));
  }

  // 保存先から項目を消す。
  // テスト用の「ふりの保存先」には消す機能がないこともあるので、その場合は空にして代用する
  function removeKey(key) {
    if (typeof backend.removeItem === 'function') backend.removeItem(key);
    else backend.setItem(key, 'null');
  }

  // 「この利用者のこのデータ」を指す名前を作る
  function keyFor(baseKey, profileId) {
    return `${baseKey}:${profileId}`;
  }

  /*
    利用者が1人もいなければ、1人作る。
    利用者を分ける仕組みが無かった頃のデータ(名前の後ろに番号が付いていないもの)が
    残っていれば、その1人目に引き継ぐ。こうすると、更新しても今までの記録が消えない
  */
  function ensureProfileExists() {
    const profiles = readJSON(PROFILES_KEY, []);
    if (profiles.length > 0) return profiles;

    const id = createProfileId();
    const created = [{ id, name: DEFAULT_PROFILE_NAME, createdAt: null }];
    writeJSON(PROFILES_KEY, created);
    backend.setItem(CURRENT_PROFILE_KEY, id);

    // 旧バージョンのデータがあれば移し替える
    for (const baseKey of [HISTORY_KEY, BOOKMARK_KEY, STREAK_KEY]) {
      const legacy = backend.getItem(baseKey);
      if (legacy !== null && legacy !== undefined) {
        backend.setItem(keyFor(baseKey, id), legacy);
        removeKey(baseKey);
      }
    }
    return created;
  }

  // 今使っている利用者の番号を返す。
  // 保存されている番号が消えた利用者を指していた場合は、一覧の先頭の人に戻す
  function currentProfileId() {
    const profiles = ensureProfileExists();
    const saved = backend.getItem(CURRENT_PROFILE_KEY);
    if (saved && profiles.some((p) => p.id === saved)) return saved;
    backend.setItem(CURRENT_PROFILE_KEY, profiles[0].id);
    return profiles[0].id;
  }

  // 今使っている利用者の、履歴などを読み書きするための名前
  function currentKey(baseKey) {
    return keyFor(baseKey, currentProfileId());
  }

  return {
    // ------------------------------------------------------------------
    // 利用者(プロフィール)の管理
    // ------------------------------------------------------------------
    listProfiles() {
      return ensureProfileExists();
    },

    getCurrentProfile() {
      const id = currentProfileId();
      return this.listProfiles().find((p) => p.id === id) ?? null;
    },

    // 利用者を追加して、その人に切り替える。追加した人の情報を返す
    addProfile(name, createdAtISODate = null) {
      const profiles = ensureProfileExists();
      const profile = { id: createProfileId(), name: String(name).trim() || '名前なし', createdAt: createdAtISODate };
      writeJSON(PROFILES_KEY, [...profiles, profile]);
      backend.setItem(CURRENT_PROFILE_KEY, profile.id);
      return profile;
    },

    // 使う人を切り替える。存在しない番号を渡したときは何もしない
    switchProfile(profileId) {
      const profiles = ensureProfileExists();
      if (!profiles.some((p) => p.id === profileId)) return false;
      backend.setItem(CURRENT_PROFILE_KEY, profileId);
      return true;
    },

    renameProfile(profileId, newName) {
      const profiles = ensureProfileExists();
      const trimmed = String(newName).trim();
      if (!trimmed) return false;
      writeJSON(
        PROFILES_KEY,
        profiles.map((p) => (p.id === profileId ? { ...p, name: trimmed } : p))
      );
      return true;
    },

    /*
      利用者を、その人の記録ごと削除する。
      実習生が入れ替わったときに、前の人の記録を残さないための機能。
      利用者が1人しかいないときは削除できない(誰もいない状態になってしまうため)
    */
    deleteProfile(profileId) {
      const profiles = ensureProfileExists();
      if (profiles.length <= 1) return false;
      if (!profiles.some((p) => p.id === profileId)) return false;

      for (const baseKey of [HISTORY_KEY, BOOKMARK_KEY, STREAK_KEY, SHARE_KEY, LAST_SENT_KEY]) {
        removeKey(keyFor(baseKey, profileId));
      }
      const remaining = profiles.filter((p) => p.id !== profileId);
      writeJSON(PROFILES_KEY, remaining);

      // 消したのが今使っている人だったら、残った人の先頭に切り替える
      if (backend.getItem(CURRENT_PROFILE_KEY) === profileId) {
        backend.setItem(CURRENT_PROFILE_KEY, remaining[0].id);
      }
      return true;
    },

    // 今の利用者の記録だけを消す。利用者そのものは残る
    clearCurrentProgress() {
      for (const baseKey of [HISTORY_KEY, BOOKMARK_KEY, STREAK_KEY]) {
        removeKey(currentKey(baseKey));
      }
    },

    // ------------------------------------------------------------------
    // 学習の記録(すべて「今の利用者」のぶんだけを読み書きする)
    // ------------------------------------------------------------------

    // 1問答えるたびに呼び出す。正解・不正解の記録を残す。
    recordAnswer(questionId, isCorrect, answeredAtISODate) {
      const key = currentKey(HISTORY_KEY);
      const history = readJSON(key, {});
      const prev = history[questionId] || { correctCount: 0, wrongCount: 0 };
      history[questionId] = {
        correctCount: prev.correctCount + (isCorrect ? 1 : 0),
        wrongCount: prev.wrongCount + (isCorrect ? 0 : 1),
        lastResult: isCorrect ? 'correct' : 'wrong',
        lastAnsweredAt: answeredAtISODate,
      };
      writeJSON(key, history);
    },

    getHistory() {
      return readJSON(currentKey(HISTORY_KEY), {});
    },

    // 直近の回答が「不正解」だった問題のIDだけを集める(弱点復習モード用)
    getWrongQuestionIds() {
      const history = this.getHistory();
      return Object.keys(history).filter((id) => history[id].lastResult === 'wrong');
    },

    toggleBookmark(questionId) {
      const key = currentKey(BOOKMARK_KEY);
      const bookmarks = readJSON(key, []);
      const index = bookmarks.indexOf(questionId);
      if (index === -1) {
        bookmarks.push(questionId);
      } else {
        bookmarks.splice(index, 1);
      }
      writeJSON(key, bookmarks);
      return bookmarks;
    },

    getBookmarkIds() {
      return readJSON(currentKey(BOOKMARK_KEY), []);
    },

    // 今日勉強したことを記録し、連続学習日数を更新する。
    // todayISODate は "2026-08-25" のような形式の文字列。
    updateStreakOnAnswer(todayISODate) {
      const key = currentKey(STREAK_KEY);
      const streak = readJSON(key, { count: 0, lastActiveDate: null });

      if (streak.lastActiveDate === todayISODate) {
        // 今日はもう記録済みなので何もしない
        return streak.count;
      }

      const yesterday = addDays(todayISODate, -1);
      const isConsecutive = streak.lastActiveDate === yesterday;
      const newCount = isConsecutive ? streak.count + 1 : 1;

      writeJSON(key, { count: newCount, lastActiveDate: todayISODate });
      return newCount;
    },

    getStreak() {
      return readJSON(currentKey(STREAK_KEY), { count: 0, lastActiveDate: null }).count;
    },

    // 指定した利用者の履歴を取り出す(成績の書き出しで、他の人のぶんも出すために使う)
    getHistoryOf(profileId) {
      return readJSON(keyFor(HISTORY_KEY, profileId), {});
    },

    // 今の利用者が「成績を先生に送る」をどう設定しているか。
    // 何も設定していない人は「送らない」として扱う
    getShareLevel() {
      return this.getShareLevelOf(currentProfileId());
    },

    getShareLevelOf(profileId) {
      const value = backend.getItem(keyFor(SHARE_KEY, profileId));
      return SHARE_LEVELS.includes(value) ? value : DEFAULT_SHARE_LEVEL;
    },

    // 設定を変える。知らない値が来たら「送らない」に倒す(安全な側に寄せる)
    setShareLevel(level) {
      const safe = SHARE_LEVELS.includes(level) ? level : DEFAULT_SHARE_LEVEL;
      backend.setItem(keyFor(SHARE_KEY, currentProfileId()), safe);
      return safe;
    },

    // 「前回どこまで送ったか」の記録を消す。
    // 送る設定を変えたときに呼ぶと、次回あらためて送り直される
    clearLastSent(profileId = currentProfileId()) {
      removeKey(keyFor(LAST_SENT_KEY, profileId));
    },
  };
}

// "2026-08-25" のような日付文字列に、日数を足し引きするための小さな関数
function addDays(isoDateString, diff) {
  const date = new Date(isoDateString + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + diff);
  return date.toISOString().slice(0, 10);
}
