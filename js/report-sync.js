// 成績を先生の集計表へ自動で送ったり、先生の画面で全員分を受け取ったりする部品です。
//
// 送り先は Google スプレッドシートに付けた小さなプログラム(Google Apps Script)です。
// アプリ側からは「送る」「もらう」の2つだけを使います。

// 「前回どこまで送ったか」を覚えておく場所の名前。
// 利用者ごとに分けるので、名前の後ろに利用者のIDを付ける
const LAST_SENT_PREFIX = 'pharmacyQuiz.lastSent:';

// 先生の画面で入力した合言葉を、その端末に覚えておく場所
export const TEACHER_KEY_STORAGE = 'pharmacyQuiz.teacherKey';

export function lastSentKey(profileId) {
  return LAST_SENT_PREFIX + profileId;
}

/**
 * 今の成績を送る必要があるか判断する。
 *
 * 送るたびに通信が発生するので、前回と中身が同じなら送らない。
 * (同じ問題を解き直して結果が変わらなかった場合など)
 */
export function needsSending(previousCode, currentCode) {
  if (!currentCode) return false;
  // 1問も答えていない状態は送らない。末尾が空なら回答が入っていない
  if (currentCode.split('~').length < 4 || currentCode.split('~')[3] === '') return false;
  return previousCode !== currentCode;
}

/**
 * 成績を送る。
 *
 * Content-Type をわざと text/plain にしているのが大事なところ。
 * application/json にすると、ブラウザが送信前に「送っていいですか」という
 * 確認の通信を挟むのだが、Google Apps Script はそれに返事をしないため失敗する。
 * text/plain なら確認を挟まずにそのまま送れる。
 */
export async function sendReport(url, { name, code }) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ name, code }),
    redirect: 'follow',
  });
  if (!response.ok) throw new Error(`送信できませんでした (${response.status})`);

  const result = await response.json();
  if (!result.ok) throw new Error(result.error || '送信できませんでした');
  return result;
}

/**
 * 先生の集計表から、その人の行を消してもらう。
 * 「共有しない」に戻したときに、これまで送った分も取り消せるようにするためのもの。
 */
export async function deleteReport(url, { name }) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ name, action: 'delete' }),
    redirect: 'follow',
  });
  if (!response.ok) throw new Error(`取り消せませんでした (${response.status})`);

  const result = await response.json();
  if (!result.ok) throw new Error(result.error || '取り消せませんでした');
  return result;
}

/**
 * 先生の画面から、全員分の成績をもらう。
 * 合言葉が合っていないと、向こう側が断ってくる。
 */
export async function fetchReports(url, key) {
  const response = await fetch(`${url}?key=${encodeURIComponent(key)}`, { redirect: 'follow' });
  if (!response.ok) throw new Error(`読み込めませんでした (${response.status})`);

  const result = await response.json();
  if (!result.ok) throw new Error(result.error || '読み込めませんでした');
  return Array.isArray(result.rows) ? result.rows : [];
}
