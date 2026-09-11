/*
  薬学実習クイズ ― 成績の受け取り役

  これは Google スプレッドシートに付ける「小さなプログラム」です。
  アプリ(実習生の端末)から成績を受け取ってシートに書き込み、
  先生の画面からの求めに応じて全員分を返します。

  ● 置き場所
      https://script.google.com/home/projects/create で新しいプロジェクトを作り、
      出てきた画面にこのファイルの中身を貼り付ける
      (下の SPREADSHEET_ID に、成績を書き込むシートのIDを入れること)

  ● 公開のしかた
      右上の「デプロイ」→「新しいデプロイ」
      → 種類は「ウェブアプリ」
      → 「次のユーザーとして実行」＝ 自分
      → 「アクセスできるユーザー」＝ 全員
      → デプロイを押して出てくる URL を控える

  ● 合言葉(READ_KEY)について
      書き込み(POST)は誰でもできますが、
      読み出し(GET)はこの合言葉を知っている人だけができます。
      先生の画面に一度入力すると、その端末に覚えられます。
      ※ この合言葉は、アプリのソースコードには入れないでください。
        (ソースコードは誰でも見られる場所に置いてあるため)
*/

const SHEET_NAME = '成績';

// ここを先生だけが知る合言葉に書き換えてください
const READ_KEY = 'ここに合言葉';

/**
 * アプリから成績が送られてきたときの処理。
 * 同じ名前の行があれば上書きし、なければ新しい行を足す。
 */
function doPost(e) {
  // 2人が同時に送ってきたときに行が壊れないよう、順番待ちをさせる
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (err) {
    return json({ ok: false, error: 'busy' });
  }

  try {
    const data = JSON.parse(e.postData.contents);
    const name = String(data.name == null ? '' : data.name).trim().slice(0, 50);
    const code = String(data.code == null ? '' : data.code).trim();

    // 中身がおかしいものは受け付けない
    if (!name) return json({ ok: false, error: '名前がありません' });
    if (code.indexOf('PQZ1~') !== 0) return json({ ok: false, error: '成績データの形が違います' });
    if (code.length > 20000) return json({ ok: false, error: '成績データが長すぎます' });

    const sheet = getSheet();
    const names = sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 1), 1).getValues();

    let row = -1;
    for (let i = 1; i < names.length; i++) {
      if (String(names[i][0]).trim() === name) {
        row = i + 1;
        break;
      }
    }

    const values = [[name, new Date(), code]];
    if (row === -1) {
      sheet.getRange(sheet.getLastRow() + 1, 1, 1, 3).setValues(values);
    } else {
      sheet.getRange(row, 1, 1, 3).setValues(values);
    }

    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/**
 * 先生の画面から全員分を求められたときの処理。
 * 合言葉が合っているときだけ返す。
 */
function doGet(e) {
  const key = e && e.parameter ? e.parameter.key : '';
  if (key !== READ_KEY) {
    return json({ ok: false, error: '合言葉が違います' });
  }

  const sheet = getSheet();
  const last = sheet.getLastRow();
  if (last < 2) return json({ ok: true, rows: [] });

  const values = sheet.getRange(2, 1, last - 1, 3).getValues();
  const rows = [];
  for (let i = 0; i < values.length; i++) {
    const name = String(values[i][0]).trim();
    if (!name) continue;
    rows.push({
      name: name,
      updatedAt: values[i][1] ? Utilities.formatDate(new Date(values[i][1]), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm') : '',
      code: String(values[i][2]),
    });
  }
  return json({ ok: true, rows: rows });
}

// 成績を書き込むスプレッドシートのID。
// スプレッドシートを開いたときのURLの /d/ と /edit のあいだの文字列
const SPREADSHEET_ID = 'ここにスプレッドシートのID';

/** 成績用のシートを取り出す。なければ見出し付きで作る */
function getSheet() {
  const book = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = book.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = book.insertSheet(SHEET_NAME);
    sheet.getRange(1, 1, 1, 3).setValues([['名前', '最終更新', '成績データ']]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** 返事をJSONの形にして返す */
function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
