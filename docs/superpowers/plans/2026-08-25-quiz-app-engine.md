# 薬学実習クイズアプリ「エンジン部分」実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** サンプル問題(仮データ)を使って、クイズの出題・採点・弱点復習・正答率グラフ・ブックマーク・連続学習日数表示・オフライン対応・自動更新まで、すべての機能が実際に動くWebアプリ(PWA)を完成させる。本番の300問(PMDA資料をもとにした本物のコンテンツ)は別計画(コンテンツ作成計画)で追加する。

**Architecture:** ビルド不要のプレーンなHTML/CSS/JavaScript(ES Modules)で作る。「データを扱う部品(quiz-engine.js / storage.js / stats.js)」と「画面を描く部品(app.js)」を分離し、データを扱う部品はNode.js標準のテスト機能(`node --test`)で自動テストする。画面の見た目は、まず「動く」ことを優先したシンプルなものにし、見た目の作り込みは本計画の後で別途行う。

**Tech Stack:** プレーンHTML/CSS/JavaScript(ES Modules、ビルドツールなし)、Node.js v18以降の組み込みテストランナー(`node:test`, `node:assert`)、外部npmパッケージへの依存なし。

**Spec:** [docs/superpowers/specs/2026-08-25-pharmacy-quiz-app-design.md](../specs/2026-08-25-pharmacy-quiz-app-design.md)

## Global Constraints

- ログイン・アカウント登録は不要。進捗(履歴・ブックマーク・ストリーク)は端末のローカルストレージにのみ保存する。
- サーバーは使わない。Windowsパソコンだけで開発が完結すること。
- オフラインでも(一度読み込んだ後は)クイズが使えること。
- 問題データやコードを更新したら、利用者が次に開いたときに自動的に最新版へ切り替わること。
- 出題カテゴリーは10個:がん/高血圧症/糖尿病/心疾患/脳血管障害/精神神経疾患/免疫・アレルギー疾患/感染症/計算問題/社会常識・倫理観。
- 出題形式は一問一答中心+症例(ケース)問題を混在させる。
- 将来Capacitorでネイティブアプリ化できるよう、素直なWeb標準技術で書く(特殊なビルド手順を持ち込まない)。
- コードには初心者が読んで理解できるよう、日本語の説明コメントを多めに残す。

---

## Task 1: プロジェクトの土台と開発用サーバー

**Files:**
- Create: `package.json`
- Create: `dev-server.js`
- Create: `index.html`
- Create: `.gitignore`

**Interfaces:**
- Produces: `npm start` コマンドで `http://localhost:8080` にアクセスできる状態。以降のすべてのタスクはこのサーバーで動作確認する。

- [ ] **Step 1: package.json を作成する**

```json
{
  "name": "pharmacy-quiz-app",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "node dev-server.js",
    "test": "node --test tests/"
  }
}
```

- [ ] **Step 2: 開発用サーバー(dev-server.js)を作成する**

npmパッケージを使わず、Node.js標準機能だけで作る、ごく簡単な静的ファイルサーバーです。

```js
// 開発中にブラウザで動作確認するための、ごく簡単なサーバーです。
// npm パッケージを使わず、Node.js に最初から入っている機能だけで作っています。
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const PORT = 8080;

// ファイルの拡張子ごとに、ブラウザへ伝える種類(MIMEタイプ)の対応表
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
};

const server = http.createServer((req, res) => {
  // "/" へのアクセスは index.html を返す
  let filePath = req.url === '/' ? '/index.html' : req.url;
  // クエリパラメータ(?付き)を取り除く
  filePath = filePath.split('?')[0];
  const fullPath = path.join(process.cwd(), filePath);

  fs.readFile(fullPath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found: ' + filePath);
      return;
    }
    const ext = path.extname(fullPath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`開発用サーバーが起動しました: http://localhost:${PORT}`);
});
```

- [ ] **Step 3: 最小限の index.html を作成する**

```html
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <title>薬学実習クイズ</title>
</head>
<body>
  <h1>薬学実習クイズ(準備中)</h1>
</body>
</html>
```

- [ ] **Step 4: .gitignore を作成する**

```
node_modules/
```

- [ ] **Step 5: 動作確認(手動)**

Run: `npm start`
ブラウザで `http://localhost:8080` を開き、「薬学実習クイズ(準備中)」という見出しが表示されることを確認する。
(この後のタスクでは、この見出しの中身がどんどん本物の画面に置き換わっていく)

- [ ] **Step 6: Commit**

```bash
git add package.json dev-server.js index.html .gitignore
git commit -m "chore: add project scaffold and dev server"
```

---

## Task 2: 問題データの型・サンプルデータ・検証関数

**Files:**
- Create: `data/categories.json`
- Create: `data/questions-sample.json`
- Create: `js/validate-questions.js`
- Test: `tests/validate-questions.test.js`

**Interfaces:**
- Produces: `validateQuestion(question) -> string[]`(エラーメッセージの配列。問題なければ空配列)、`validateQuestions(questions) -> {id, errors}[]`(エラーがある問題だけを集めた配列)
- Produces: 問題データの形(スキーマ):`{ id, category, difficulty, type, question, choices, correctIndex, explanation, source: { name, url, confirmedDate } }`

- [ ] **Step 1: カテゴリー一覧データを作成する**

`data/categories.json`

```json
[
  { "id": "cancer", "name": "がん" },
  { "id": "hypertension", "name": "高血圧症" },
  { "id": "diabetes", "name": "糖尿病" },
  { "id": "heart-disease", "name": "心疾患" },
  { "id": "cerebrovascular", "name": "脳血管障害" },
  { "id": "psychiatric", "name": "精神神経疾患" },
  { "id": "immune-allergy", "name": "免疫・アレルギー疾患" },
  { "id": "infection", "name": "感染症" },
  { "id": "calculation", "name": "計算問題" },
  { "id": "ethics", "name": "社会常識・倫理観" }
]
```

- [ ] **Step 2: 検証関数の失敗するテストを書く**

`tests/validate-questions.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateQuestion, validateQuestions } from '../js/validate-questions.js';
import { readFileSync } from 'node:fs';

test('正しい問題データはエラーが出ない', () => {
  const goodQuestion = {
    id: 'sample-001',
    category: 'cancer',
    difficulty: 'beginner',
    type: 'single',
    question: 'サンプル問題文',
    choices: ['A', 'B', 'C', 'D'],
    correctIndex: 0,
    explanation: 'サンプル解説',
    source: { name: 'サンプル資料', url: '', confirmedDate: '2026-08-25' },
  };
  const errors = validateQuestion(goodQuestion);
  assert.deepEqual(errors, []);
});

test('correctIndexがchoicesの範囲外だとエラーになる', () => {
  const badQuestion = {
    id: 'sample-002',
    category: 'cancer',
    difficulty: 'beginner',
    type: 'single',
    question: 'サンプル問題文',
    choices: ['A', 'B'],
    correctIndex: 5,
    explanation: 'サンプル解説',
    source: { name: 'サンプル資料', url: '', confirmedDate: '2026-08-25' },
  };
  const errors = validateQuestion(badQuestion);
  assert.ok(errors.some((e) => e.includes('correctIndex')));
});

test('difficultyが不正な値だとエラーになる', () => {
  const badQuestion = {
    id: 'sample-003',
    category: 'cancer',
    difficulty: 'super-hard',
    type: 'single',
    question: 'サンプル問題文',
    choices: ['A', 'B'],
    correctIndex: 0,
    explanation: 'サンプル解説',
    source: { name: 'サンプル資料', url: '', confirmedDate: '2026-08-25' },
  };
  const errors = validateQuestion(badQuestion);
  assert.ok(errors.some((e) => e.includes('difficulty')));
});

test('サンプルデータ全体が正しい形式になっている', () => {
  const raw = readFileSync(new URL('../data/questions-sample.json', import.meta.url));
  const questions = JSON.parse(raw);
  const results = validateQuestions(questions);
  assert.deepEqual(results, [], `不正なデータがあります: ${JSON.stringify(results)}`);
});
```

- [ ] **Step 3: テストを実行し、失敗することを確認する**

Run: `node --test tests/validate-questions.test.js`
Expected: FAIL(`js/validate-questions.js` と `data/questions-sample.json` がまだ存在しないため)

- [ ] **Step 4: 検証関数を実装する**

`js/validate-questions.js`

```js
// 1問分のデータが、正しい形になっているかチェックする関数です。
// 問題データを追加・修正したときに、うっかりミス(必須項目の書き忘れなど)に
// 気づけるようにするためのものです。

const VALID_DIFFICULTIES = ['beginner', 'intermediate', 'advanced'];
const VALID_TYPES = ['single', 'case'];

export function validateQuestion(q) {
  const errors = [];

  if (typeof q.id !== 'string' || q.id.length === 0) {
    errors.push('id が文字列で入っていません');
  }
  if (typeof q.category !== 'string' || q.category.length === 0) {
    errors.push('category が文字列で入っていません');
  }
  if (!VALID_DIFFICULTIES.includes(q.difficulty)) {
    errors.push(`difficulty は ${VALID_DIFFICULTIES.join(' / ')} のいずれかである必要があります`);
  }
  if (!VALID_TYPES.includes(q.type)) {
    errors.push(`type は ${VALID_TYPES.join(' / ')} のいずれかである必要があります`);
  }
  if (typeof q.question !== 'string' || q.question.length === 0) {
    errors.push('question が文字列で入っていません');
  }
  if (!Array.isArray(q.choices) || q.choices.length < 2) {
    errors.push('choices は2つ以上の配列である必要があります');
  }
  if (
    typeof q.correctIndex !== 'number' ||
    !Array.isArray(q.choices) ||
    q.correctIndex < 0 ||
    q.correctIndex >= q.choices.length
  ) {
    errors.push('correctIndex が choices の範囲内の数字ではありません');
  }
  if (typeof q.explanation !== 'string' || q.explanation.length === 0) {
    errors.push('explanation が文字列で入っていません');
  }
  if (!q.source || typeof q.source.name !== 'string' || q.source.name.length === 0) {
    errors.push('source.name が入っていません');
  }
  if (!q.source || typeof q.source.confirmedDate !== 'string') {
    errors.push('source.confirmedDate が入っていません');
  }

  return errors;
}

export function validateQuestions(questions) {
  const results = [];
  for (const q of questions) {
    const errors = validateQuestion(q);
    if (errors.length > 0) {
      results.push({ id: q.id, errors });
    }
  }
  return results;
}
```

- [ ] **Step 5: サンプル問題データを作成する**

`data/questions-sample.json`

これは**プレースホルダー(仮)のデータ**です。医療的に正しい内容ではなく、アプリの動作確認のためだけのダミー問題です。本物の300問は、別の「コンテンツ作成計画」でPMDAの一次資料をもとに作成します。10カテゴリー × 難易度3段階(beginner/intermediate/advanced)= 30問を用意します。

```json
[
  { "id": "cancer-beginner-01", "category": "cancer", "difficulty": "beginner", "type": "single", "question": "【サンプル問題/がん・初級】これはダミーの問題文です。仮の正解はどれ?", "choices": ["A(仮の正解)", "B(仮)", "C(仮)", "D(仮)"], "correctIndex": 0, "explanation": "これはサンプルデータです。実際の解説は、添付文書等の一次資料をもとに別途作成します。", "source": { "name": "サンプルデータ(仮)", "url": "", "confirmedDate": "2026-08-25" } },
  { "id": "cancer-intermediate-01", "category": "cancer", "difficulty": "intermediate", "type": "single", "question": "【サンプル問題/がん・中級】これはダミーの問題文です。仮の正解はどれ?", "choices": ["A(仮)", "B(仮の正解)", "C(仮)", "D(仮)"], "correctIndex": 1, "explanation": "これはサンプルデータです。", "source": { "name": "サンプルデータ(仮)", "url": "", "confirmedDate": "2026-08-25" } },
  { "id": "cancer-advanced-01", "category": "cancer", "difficulty": "advanced", "type": "case", "question": "【サンプル症例問題/がん・上級】これはダミーの症例文です。仮の正解はどれ?", "choices": ["A(仮)", "B(仮)", "C(仮の正解)", "D(仮)"], "correctIndex": 2, "explanation": "これはサンプルデータです。", "source": { "name": "サンプルデータ(仮)", "url": "", "confirmedDate": "2026-08-25" } },

  { "id": "hypertension-beginner-01", "category": "hypertension", "difficulty": "beginner", "type": "single", "question": "【サンプル問題/高血圧症・初級】仮の正解はどれ?", "choices": ["A(仮の正解)", "B(仮)", "C(仮)", "D(仮)"], "correctIndex": 0, "explanation": "サンプルデータです。", "source": { "name": "サンプルデータ(仮)", "url": "", "confirmedDate": "2026-08-25" } },
  { "id": "hypertension-intermediate-01", "category": "hypertension", "difficulty": "intermediate", "type": "single", "question": "【サンプル問題/高血圧症・中級】仮の正解はどれ?", "choices": ["A(仮)", "B(仮の正解)", "C(仮)", "D(仮)"], "correctIndex": 1, "explanation": "サンプルデータです。", "source": { "name": "サンプルデータ(仮)", "url": "", "confirmedDate": "2026-08-25" } },
  { "id": "hypertension-advanced-01", "category": "hypertension", "difficulty": "advanced", "type": "case", "question": "【サンプル症例問題/高血圧症・上級】仮の正解はどれ?", "choices": ["A(仮)", "B(仮)", "C(仮の正解)", "D(仮)"], "correctIndex": 2, "explanation": "サンプルデータです。", "source": { "name": "サンプルデータ(仮)", "url": "", "confirmedDate": "2026-08-25" } },

  { "id": "diabetes-beginner-01", "category": "diabetes", "difficulty": "beginner", "type": "single", "question": "【サンプル問題/糖尿病・初級】仮の正解はどれ?", "choices": ["A(仮の正解)", "B(仮)", "C(仮)", "D(仮)"], "correctIndex": 0, "explanation": "サンプルデータです。", "source": { "name": "サンプルデータ(仮)", "url": "", "confirmedDate": "2026-08-25" } },
  { "id": "diabetes-intermediate-01", "category": "diabetes", "difficulty": "intermediate", "type": "single", "question": "【サンプル問題/糖尿病・中級】仮の正解はどれ?", "choices": ["A(仮)", "B(仮の正解)", "C(仮)", "D(仮)"], "correctIndex": 1, "explanation": "サンプルデータです。", "source": { "name": "サンプルデータ(仮)", "url": "", "confirmedDate": "2026-08-25" } },
  { "id": "diabetes-advanced-01", "category": "diabetes", "difficulty": "advanced", "type": "case", "question": "【サンプル症例問題/糖尿病・上級】仮の正解はどれ?", "choices": ["A(仮)", "B(仮)", "C(仮の正解)", "D(仮)"], "correctIndex": 2, "explanation": "サンプルデータです。", "source": { "name": "サンプルデータ(仮)", "url": "", "confirmedDate": "2026-08-25" } },

  { "id": "heart-disease-beginner-01", "category": "heart-disease", "difficulty": "beginner", "type": "single", "question": "【サンプル問題/心疾患・初級】仮の正解はどれ?", "choices": ["A(仮の正解)", "B(仮)", "C(仮)", "D(仮)"], "correctIndex": 0, "explanation": "サンプルデータです。", "source": { "name": "サンプルデータ(仮)", "url": "", "confirmedDate": "2026-08-25" } },
  { "id": "heart-disease-intermediate-01", "category": "heart-disease", "difficulty": "intermediate", "type": "single", "question": "【サンプル問題/心疾患・中級】仮の正解はどれ?", "choices": ["A(仮)", "B(仮の正解)", "C(仮)", "D(仮)"], "correctIndex": 1, "explanation": "サンプルデータです。", "source": { "name": "サンプルデータ(仮)", "url": "", "confirmedDate": "2026-08-25" } },
  { "id": "heart-disease-advanced-01", "category": "heart-disease", "difficulty": "advanced", "type": "case", "question": "【サンプル症例問題/心疾患・上級】仮の正解はどれ?", "choices": ["A(仮)", "B(仮)", "C(仮の正解)", "D(仮)"], "correctIndex": 2, "explanation": "サンプルデータです。", "source": { "name": "サンプルデータ(仮)", "url": "", "confirmedDate": "2026-08-25" } },

  { "id": "cerebrovascular-beginner-01", "category": "cerebrovascular", "difficulty": "beginner", "type": "single", "question": "【サンプル問題/脳血管障害・初級】仮の正解はどれ?", "choices": ["A(仮の正解)", "B(仮)", "C(仮)", "D(仮)"], "correctIndex": 0, "explanation": "サンプルデータです。", "source": { "name": "サンプルデータ(仮)", "url": "", "confirmedDate": "2026-08-25" } },
  { "id": "cerebrovascular-intermediate-01", "category": "cerebrovascular", "difficulty": "intermediate", "type": "single", "question": "【サンプル問題/脳血管障害・中級】仮の正解はどれ?", "choices": ["A(仮)", "B(仮の正解)", "C(仮)", "D(仮)"], "correctIndex": 1, "explanation": "サンプルデータです。", "source": { "name": "サンプルデータ(仮)", "url": "", "confirmedDate": "2026-08-25" } },
  { "id": "cerebrovascular-advanced-01", "category": "cerebrovascular", "difficulty": "advanced", "type": "case", "question": "【サンプル症例問題/脳血管障害・上級】仮の正解はどれ?", "choices": ["A(仮)", "B(仮)", "C(仮の正解)", "D(仮)"], "correctIndex": 2, "explanation": "サンプルデータです。", "source": { "name": "サンプルデータ(仮)", "url": "", "confirmedDate": "2026-08-25" } },

  { "id": "psychiatric-beginner-01", "category": "psychiatric", "difficulty": "beginner", "type": "single", "question": "【サンプル問題/精神神経疾患・初級】仮の正解はどれ?", "choices": ["A(仮の正解)", "B(仮)", "C(仮)", "D(仮)"], "correctIndex": 0, "explanation": "サンプルデータです。", "source": { "name": "サンプルデータ(仮)", "url": "", "confirmedDate": "2026-08-25" } },
  { "id": "psychiatric-intermediate-01", "category": "psychiatric", "difficulty": "intermediate", "type": "single", "question": "【サンプル問題/精神神経疾患・中級】仮の正解はどれ?", "choices": ["A(仮)", "B(仮の正解)", "C(仮)", "D(仮)"], "correctIndex": 1, "explanation": "サンプルデータです。", "source": { "name": "サンプルデータ(仮)", "url": "", "confirmedDate": "2026-08-25" } },
  { "id": "psychiatric-advanced-01", "category": "psychiatric", "difficulty": "advanced", "type": "case", "question": "【サンプル症例問題/精神神経疾患・上級】仮の正解はどれ?", "choices": ["A(仮)", "B(仮)", "C(仮の正解)", "D(仮)"], "correctIndex": 2, "explanation": "サンプルデータです。", "source": { "name": "サンプルデータ(仮)", "url": "", "confirmedDate": "2026-08-25" } },

  { "id": "immune-allergy-beginner-01", "category": "immune-allergy", "difficulty": "beginner", "type": "single", "question": "【サンプル問題/免疫・アレルギー疾患・初級】仮の正解はどれ?", "choices": ["A(仮の正解)", "B(仮)", "C(仮)", "D(仮)"], "correctIndex": 0, "explanation": "サンプルデータです。", "source": { "name": "サンプルデータ(仮)", "url": "", "confirmedDate": "2026-08-25" } },
  { "id": "immune-allergy-intermediate-01", "category": "immune-allergy", "difficulty": "intermediate", "type": "single", "question": "【サンプル問題/免疫・アレルギー疾患・中級】仮の正解はどれ?", "choices": ["A(仮)", "B(仮の正解)", "C(仮)", "D(仮)"], "correctIndex": 1, "explanation": "サンプルデータです。", "source": { "name": "サンプルデータ(仮)", "url": "", "confirmedDate": "2026-08-25" } },
  { "id": "immune-allergy-advanced-01", "category": "immune-allergy", "difficulty": "advanced", "type": "case", "question": "【サンプル症例問題/免疫・アレルギー疾患・上級】仮の正解はどれ?", "choices": ["A(仮)", "B(仮)", "C(仮の正解)", "D(仮)"], "correctIndex": 2, "explanation": "サンプルデータです。", "source": { "name": "サンプルデータ(仮)", "url": "", "confirmedDate": "2026-08-25" } },

  { "id": "infection-beginner-01", "category": "infection", "difficulty": "beginner", "type": "single", "question": "【サンプル問題/感染症・初級】仮の正解はどれ?", "choices": ["A(仮の正解)", "B(仮)", "C(仮)", "D(仮)"], "correctIndex": 0, "explanation": "サンプルデータです。", "source": { "name": "サンプルデータ(仮)", "url": "", "confirmedDate": "2026-08-25" } },
  { "id": "infection-intermediate-01", "category": "infection", "difficulty": "intermediate", "type": "single", "question": "【サンプル問題/感染症・中級】仮の正解はどれ?", "choices": ["A(仮)", "B(仮の正解)", "C(仮)", "D(仮)"], "correctIndex": 1, "explanation": "サンプルデータです。", "source": { "name": "サンプルデータ(仮)", "url": "", "confirmedDate": "2026-08-25" } },
  { "id": "infection-advanced-01", "category": "infection", "difficulty": "advanced", "type": "case", "question": "【サンプル症例問題/感染症・上級】仮の正解はどれ?", "choices": ["A(仮)", "B(仮)", "C(仮の正解)", "D(仮)"], "correctIndex": 2, "explanation": "サンプルデータです。", "source": { "name": "サンプルデータ(仮)", "url": "", "confirmedDate": "2026-08-25" } },

  { "id": "calculation-beginner-01", "category": "calculation", "difficulty": "beginner", "type": "single", "question": "【サンプル計算問題・初級】これはダミーの計算問題です。仮の正解はどれ?", "choices": ["A(仮の正解)", "B(仮)", "C(仮)", "D(仮)"], "correctIndex": 0, "explanation": "サンプルデータです。", "source": { "name": "サンプルデータ(仮)", "url": "", "confirmedDate": "2026-08-25" } },
  { "id": "calculation-intermediate-01", "category": "calculation", "difficulty": "intermediate", "type": "single", "question": "【サンプル計算問題・中級】仮の正解はどれ?", "choices": ["A(仮)", "B(仮の正解)", "C(仮)", "D(仮)"], "correctIndex": 1, "explanation": "サンプルデータです。", "source": { "name": "サンプルデータ(仮)", "url": "", "confirmedDate": "2026-08-25" } },
  { "id": "calculation-advanced-01", "category": "calculation", "difficulty": "advanced", "type": "single", "question": "【サンプル計算問題・上級】仮の正解はどれ?", "choices": ["A(仮)", "B(仮)", "C(仮の正解)", "D(仮)"], "correctIndex": 2, "explanation": "サンプルデータです。", "source": { "name": "サンプルデータ(仮)", "url": "", "confirmedDate": "2026-08-25" } },

  { "id": "ethics-beginner-01", "category": "ethics", "difficulty": "beginner", "type": "single", "question": "【サンプル問題/社会常識・倫理観・初級】これはダミーの問題文です。仮の正解はどれ?", "choices": ["A(仮の正解)", "B(仮)", "C(仮)", "D(仮)"], "correctIndex": 0, "explanation": "サンプルデータです。", "source": { "name": "サンプルデータ(仮)", "url": "", "confirmedDate": "2026-08-25" } },
  { "id": "ethics-intermediate-01", "category": "ethics", "difficulty": "intermediate", "type": "single", "question": "【サンプル問題/社会常識・倫理観・中級】仮の正解はどれ?", "choices": ["A(仮)", "B(仮の正解)", "C(仮)", "D(仮)"], "correctIndex": 1, "explanation": "サンプルデータです。", "source": { "name": "サンプルデータ(仮)", "url": "", "confirmedDate": "2026-08-25" } },
  { "id": "ethics-advanced-01", "category": "ethics", "difficulty": "advanced", "type": "case", "question": "【サンプル症例問題/社会常識・倫理観・上級】仮の正解はどれ?", "choices": ["A(仮)", "B(仮)", "C(仮の正解)", "D(仮)"], "correctIndex": 2, "explanation": "サンプルデータです。", "source": { "name": "サンプルデータ(仮)", "url": "", "confirmedDate": "2026-08-25" } }
]
```

- [ ] **Step 6: テストを実行し、すべて成功することを確認する**

Run: `node --test tests/validate-questions.test.js`
Expected: PASS(4件のテストすべてが成功)

- [ ] **Step 7: Commit**

```bash
git add data/categories.json data/questions-sample.json js/validate-questions.js tests/validate-questions.test.js
git commit -m "feat: add question data schema, sample data, and validator"
```

---

## Task 3: 保存モジュール(進捗・ブックマーク・ストリーク)

**Files:**
- Create: `js/storage.js`
- Test: `tests/storage.test.js`

**Interfaces:**
- Consumes: なし(このタスク単独で完結)
- Produces: `createStorage(backend) -> { recordAnswer(questionId, isCorrect, answeredAtISODate), getHistory(), getWrongQuestionIds(), toggleBookmark(questionId), getBookmarkIds(), updateStreakOnAnswer(todayISODate), getStreak() }`。`backend` は `{ getItem(key), setItem(key, value) }` を持つオブジェクト(本番は `window.localStorage`、テストではメモリ上のふりの保存先を渡す)。

- [ ] **Step 1: 失敗するテストを書く**

`tests/storage.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStorage } from '../js/storage.js';

// localStorage の代わりに使う、テスト用の「ふりの保存先」
function createFakeBackend() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, value),
  };
}

test('正解を記録すると履歴に反映される', () => {
  const storage = createStorage(createFakeBackend());
  storage.recordAnswer('q1', true, '2026-08-25');
  const history = storage.getHistory();
  assert.equal(history.q1.correctCount, 1);
  assert.equal(history.q1.lastResult, 'correct');
});

test('不正解の問題だけが弱点復習の対象になる', () => {
  const storage = createStorage(createFakeBackend());
  storage.recordAnswer('q1', true, '2026-08-25');
  storage.recordAnswer('q2', false, '2026-08-25');
  assert.deepEqual(storage.getWrongQuestionIds(), ['q2']);
});

test('同じ問題に再度正解すると弱点復習リストから外れる', () => {
  const storage = createStorage(createFakeBackend());
  storage.recordAnswer('q1', false, '2026-08-25');
  storage.recordAnswer('q1', true, '2026-08-26');
  assert.deepEqual(storage.getWrongQuestionIds(), []);
});

test('ブックマークの追加と解除ができる', () => {
  const storage = createStorage(createFakeBackend());
  storage.toggleBookmark('q1');
  assert.deepEqual(storage.getBookmarkIds(), ['q1']);
  storage.toggleBookmark('q1');
  assert.deepEqual(storage.getBookmarkIds(), []);
});

test('連続で学習するとストリークが増える', () => {
  const storage = createStorage(createFakeBackend());
  assert.equal(storage.updateStreakOnAnswer('2026-08-25'), 1);
  assert.equal(storage.updateStreakOnAnswer('2026-08-26'), 2);
  assert.equal(storage.updateStreakOnAnswer('2026-08-27'), 3);
});

test('1日空くとストリークが1に戻る', () => {
  const storage = createStorage(createFakeBackend());
  storage.updateStreakOnAnswer('2026-08-25');
  storage.updateStreakOnAnswer('2026-08-27'); // 26日をとばした
  assert.equal(storage.getStreak(), 1);
});

test('同じ日に何度答えてもストリークは増えない', () => {
  const storage = createStorage(createFakeBackend());
  storage.updateStreakOnAnswer('2026-08-25');
  storage.updateStreakOnAnswer('2026-08-25');
  assert.equal(storage.getStreak(), 1);
});
```

- [ ] **Step 2: テストを実行し、失敗することを確認する**

Run: `node --test tests/storage.test.js`
Expected: FAIL(`js/storage.js` がまだ存在しない)

- [ ] **Step 3: storage.js を実装する**

```js
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
```

- [ ] **Step 4: テストを実行し、すべて成功することを確認する**

Run: `node --test tests/storage.test.js`
Expected: PASS(7件のテストすべてが成功)

- [ ] **Step 5: Commit**

```bash
git add js/storage.js tests/storage.test.js
git commit -m "feat: add local storage module for history, bookmarks, and streak"
```

---

## Task 4: クイズ出題エンジン

**Files:**
- Create: `js/quiz-engine.js`
- Test: `tests/quiz-engine.test.js`

**Interfaces:**
- Consumes: なし(このタスク単独で完結)
- Produces: `filterQuestions(questions, {categoryId, difficulty}) -> Question[]`、`getWeakPointQuestions(questions, wrongQuestionIds) -> Question[]`、`checkAnswer(question, selectedIndex) -> boolean`、`shuffle(array, randomFn = Math.random) -> array`

- [ ] **Step 1: 失敗するテストを書く**

`tests/quiz-engine.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterQuestions, getWeakPointQuestions, checkAnswer, shuffle } from '../js/quiz-engine.js';

const sampleQuestions = [
  { id: 'a', category: 'cancer', difficulty: 'beginner', correctIndex: 0 },
  { id: 'b', category: 'cancer', difficulty: 'advanced', correctIndex: 1 },
  { id: 'c', category: 'diabetes', difficulty: 'beginner', correctIndex: 2 },
];

test('カテゴリーで絞り込める', () => {
  const result = filterQuestions(sampleQuestions, { categoryId: 'cancer' });
  assert.deepEqual(result.map((q) => q.id), ['a', 'b']);
});

test('難易度で絞り込める', () => {
  const result = filterQuestions(sampleQuestions, { difficulty: 'beginner' });
  assert.deepEqual(result.map((q) => q.id), ['a', 'c']);
});

test('カテゴリーと難易度を両方指定して絞り込める', () => {
  const result = filterQuestions(sampleQuestions, { categoryId: 'cancer', difficulty: 'advanced' });
  assert.deepEqual(result.map((q) => q.id), ['b']);
});

test('間違えた問題だけを取り出せる', () => {
  const result = getWeakPointQuestions(sampleQuestions, ['b', 'c']);
  assert.deepEqual(result.map((q) => q.id), ['b', 'c']);
});

test('正解の選択肢を選ぶとtrueになる', () => {
  assert.equal(checkAnswer(sampleQuestions[0], 0), true);
});

test('不正解の選択肢を選ぶとfalseになる', () => {
  assert.equal(checkAnswer(sampleQuestions[0], 1), false);
});

test('シャッフルしても中身の要素は変わらない(順番だけ変わる)', () => {
  const original = ['a', 'b', 'c', 'd'];
  const result = shuffle(original, () => 0.999);
  assert.deepEqual([...result].sort(), [...original].sort());
});
```

- [ ] **Step 2: テストを実行し、失敗することを確認する**

Run: `node --test tests/quiz-engine.test.js`
Expected: FAIL(`js/quiz-engine.js` がまだ存在しない)

- [ ] **Step 3: quiz-engine.js を実装する**

```js
// 出題する問題を選んだり、正解かどうかを判定したりするための部品です。
// 画面の見た目(HTML)には一切関わらず、データの計算だけを行います。

export function filterQuestions(questions, { categoryId, difficulty } = {}) {
  return questions.filter((q) => {
    if (categoryId && q.category !== categoryId) return false;
    if (difficulty && q.difficulty !== difficulty) return false;
    return true;
  });
}

// 直近で間違えた問題だけを取り出す(弱点復習モード用)
export function getWeakPointQuestions(questions, wrongQuestionIds) {
  const wrongSet = new Set(wrongQuestionIds);
  return questions.filter((q) => wrongSet.has(q.id));
}

// 選んだ選択肢が正解かどうかを判定する
export function checkAnswer(question, selectedIndex) {
  return selectedIndex === question.correctIndex;
}

// 配列の中身をランダムな順番に並べ替える(Fisher-Yatesシャッフル)
// randomFn を差し替えられるようにして、テストのときは結果が毎回変わらないようにしている
export function shuffle(array, randomFn = Math.random) {
  const result = array.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(randomFn() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
```

- [ ] **Step 4: テストを実行し、すべて成功することを確認する**

Run: `node --test tests/quiz-engine.test.js`
Expected: PASS(7件のテストすべてが成功)

- [ ] **Step 5: Commit**

```bash
git add js/quiz-engine.js tests/quiz-engine.test.js
git commit -m "feat: add quiz engine for filtering, weak-point selection, and scoring"
```

---

## Task 5: 正答率集計モジュール

**Files:**
- Create: `js/stats.js`
- Test: `tests/stats.test.js`

**Interfaces:**
- Consumes: `storage.js` の `getHistory()` が返す形式のオブジェクト
- Produces: `computeCategoryAccuracy(questions, history, categories) -> { categoryId, categoryName, correct, answered, totalQuestions, accuracyPercent }[]`

- [ ] **Step 1: 失敗するテストを書く**

`tests/stats.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeCategoryAccuracy } from '../js/stats.js';

const categories = [
  { id: 'cancer', name: 'がん' },
  { id: 'diabetes', name: '糖尿病' },
];

const questions = [
  { id: 'a', category: 'cancer' },
  { id: 'b', category: 'cancer' },
  { id: 'c', category: 'diabetes' },
];

test('正答率が正しく計算される', () => {
  const history = {
    a: { lastResult: 'correct' },
    b: { lastResult: 'wrong' },
  };
  const result = computeCategoryAccuracy(questions, history, categories);
  const cancerStats = result.find((r) => r.categoryId === 'cancer');
  assert.equal(cancerStats.correct, 1);
  assert.equal(cancerStats.answered, 2);
  assert.equal(cancerStats.accuracyPercent, 50);
});

test('まだ1問も解いていないカテゴリーは0%になる', () => {
  const result = computeCategoryAccuracy(questions, {}, categories);
  const diabetesStats = result.find((r) => r.categoryId === 'diabetes');
  assert.equal(diabetesStats.answered, 0);
  assert.equal(diabetesStats.accuracyPercent, 0);
});
```

- [ ] **Step 2: テストを実行し、失敗することを確認する**

Run: `node --test tests/stats.test.js`
Expected: FAIL(`js/stats.js` がまだ存在しない)

- [ ] **Step 3: stats.js を実装する**

```js
// カテゴリーごとの正答率を計算するための部品です。
// history は storage.js の getHistory() が返す形式のオブジェクトです。

export function computeCategoryAccuracy(questions, history, categories) {
  return categories.map((category) => {
    const categoryQuestions = questions.filter((q) => q.category === category.id);
    let correct = 0;
    let answered = 0;

    for (const q of categoryQuestions) {
      const record = history[q.id];
      if (!record) continue;
      answered += 1;
      if (record.lastResult === 'correct') correct += 1;
    }

    const accuracyPercent = answered === 0 ? 0 : Math.round((correct / answered) * 100);

    return {
      categoryId: category.id,
      categoryName: category.name,
      correct,
      answered,
      totalQuestions: categoryQuestions.length,
      accuracyPercent,
    };
  });
}
```

- [ ] **Step 4: テストを実行し、すべて成功することを確認する**

Run: `node --test tests/stats.test.js`
Expected: PASS(2件のテストすべてが成功)

- [ ] **Step 5: Commit**

```bash
git add js/stats.js tests/stats.test.js
git commit -m "feat: add category accuracy stats module"
```

---

## Task 6: 画面のHTML/CSSの骨組み

**Files:**
- Modify: `index.html`(Task 1で作った仮のものを本物の骨組みに置き換える)
- Create: `css/style.css`

**Interfaces:**
- Produces: `home-screen` / `quiz-screen` / `stats-screen` / `bookmark-screen` の4つの画面(`<section>`要素)。Task 7でこれらの中身をJavaScriptから操作する。

- [ ] **Step 1: index.html を骨組みに置き換える**

```html
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>薬学実習クイズ</title>
  <link rel="stylesheet" href="css/style.css">
</head>
<body>
  <header class="app-header">
    <h1>薬学実習クイズ</h1>
    <p id="streak-display" class="streak-display"></p>
  </header>

  <nav class="app-nav">
    <button data-screen="home-screen">ホーム</button>
    <button data-screen="quiz-screen">クイズ</button>
    <button data-screen="stats-screen">正答率</button>
    <button data-screen="bookmark-screen">ブックマーク</button>
  </nav>

  <main>
    <section id="home-screen" class="screen">
      <h2>カテゴリーを選んでください</h2>
      <div id="category-list"></div>
      <button id="weak-point-button">弱点復習モードで始める</button>
    </section>

    <section id="quiz-screen" class="screen" hidden>
      <p id="quiz-progress"></p>
      <h2 id="question-text"></h2>
      <div id="choice-list"></div>
      <div id="answer-feedback" hidden>
        <p id="feedback-result"></p>
        <p id="feedback-explanation"></p>
        <p id="feedback-source"></p>
        <button id="bookmark-toggle-button">☆ ブックマーク</button>
        <button id="next-question-button">次の問題へ</button>
      </div>
    </section>

    <section id="stats-screen" class="screen" hidden>
      <h2>カテゴリー別 正答率</h2>
      <div id="stats-list"></div>
    </section>

    <section id="bookmark-screen" class="screen" hidden>
      <h2>ブックマークした問題</h2>
      <div id="bookmark-list"></div>
    </section>
  </main>

  <script type="module" src="js/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: style.css を作成する**

見た目の作り込みはこの後の「デザイン仕上げ」で行うため、ここではまず読みやすく使いやすい最低限のスタイルにする。

```css
/* 全体の基本スタイル。細かい見た目の作り込みは後の「デザイン仕上げ」で行う。今はまず使えることを優先。 */
* { box-sizing: border-box; }
body {
  font-family: system-ui, -apple-system, "Hiragino Sans", sans-serif;
  margin: 0;
  padding: 0;
  background: #f5f5f7;
  color: #1c1c1e;
}
.app-header {
  padding: 16px;
  background: #2f6fed;
  color: white;
}
.app-header h1 { margin: 0; font-size: 1.2rem; }
.streak-display { margin: 4px 0 0; font-size: 0.9rem; }
.app-nav {
  display: flex;
  gap: 8px;
  padding: 8px 16px;
  background: white;
  border-bottom: 1px solid #ddd;
}
.app-nav button {
  flex: 1;
  padding: 8px;
  border: none;
  background: #eee;
  border-radius: 8px;
}
main { padding: 16px; }
.screen[hidden] { display: none; }
#choice-list button {
  display: block;
  width: 100%;
  text-align: left;
  padding: 12px;
  margin-bottom: 8px;
  border: 1px solid #ccc;
  border-radius: 8px;
  background: white;
}
#choice-list button.correct { background: #d4f7d4; border-color: #2ecc71; }
#choice-list button.incorrect { background: #fbd4d4; border-color: #e74c3c; }
.category-item {
  display: flex;
  justify-content: space-between;
  width: 100%;
  padding: 10px;
  background: white;
  border: 1px solid #ddd;
  border-radius: 8px;
  margin-bottom: 8px;
  text-align: left;
}
.bar-track {
  background: #e0e0e0;
  border-radius: 6px;
  height: 12px;
  overflow: hidden;
  margin: 4px 0 12px;
}
.bar-fill {
  background: #2f6fed;
  height: 100%;
}
```

- [ ] **Step 3: 動作確認(手動)**

Run: `npm start`
ブラウザで `http://localhost:8080` を開き、ヘッダー・ナビゲーション(4つのボタン)・ホーム画面の見出しが表示されることを確認する。この時点ではボタンを押しても画面は切り替わらない(Task 7で対応)。

- [ ] **Step 4: Commit**

```bash
git add index.html css/style.css
git commit -m "feat: add HTML/CSS skeleton for app screens"
```

---

## Task 7: 画面をつなぎこむ(app.js)

**Files:**
- Create: `js/app.js`

**Interfaces:**
- Consumes: `quiz-engine.js` の `filterQuestions / getWeakPointQuestions / checkAnswer / shuffle`、`storage.js` の `createStorage`、`stats.js` の `computeCategoryAccuracy`
- Produces: ブラウザ上で動く完成したクイズアプリ(この時点でPWA化・オフライン対応以外のすべての機能が動く状態になる)

- [ ] **Step 1: app.js を実装する**

```js
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
  renderQuestion();
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
```

- [ ] **Step 2: 動作確認(手動、チェックリスト形式)**

Run: `npm start`、ブラウザで `http://localhost:8080` を開いて以下を確認する。

- [ ] ホーム画面に10個のカテゴリーボタンが表示される
- [ ] カテゴリーを1つ選ぶとクイズ画面に切り替わり、問題文と4つの選択肢が表示される
- [ ] 選択肢を選ぶと、正解の選択肢が緑色になり、間違えた場合は選んだ選択肢が赤色になる
- [ ] 解答後に解説文と出典が表示される
- [ ] 「次の問題へ」を押すと次の問題に進む
- [ ] ブックマークボタンを押すと星マークが変わり、別の問題に移動してから戻ってきても状態を保持している(同じ問題に再度たどり着いたとき)
- [ ] ホーム画面の「弱点復習モードで始める」を押すと、直前に間違えた問題だけが出題される(まず何か1問わざと間違えてから確認する)
- [ ] ナビゲーションの「正答率」を押すと、カテゴリーごとの正答率がバーグラフで表示される
- [ ] ナビゲーションの「ブックマーク」を押すと、ブックマークした問題の一覧が表示される
- [ ] 画面上部に「🔥 連続学習 1日目」のような表示が出る

- [ ] **Step 3: Commit**

```bash
git add js/app.js
git commit -m "feat: wire up quiz flow, weak-point mode, stats, and bookmarks"
```

---

## Task 8: PWA化(ホーム画面に追加できるようにする)

**Files:**
- Create: `manifest.json`
- Create: `icons/icon.svg`
- Modify: `index.html`(manifestへのリンクなどを追加)

**Interfaces:**
- Produces: ブラウザの「ホーム画面に追加」機能で、アイコン付きのアプリとして追加できる状態

- [ ] **Step 1: プレースホルダーのアイコンを作成する**

`icons/icon.svg`

これは仮のアイコンです。本格的なデザインは、アプリが一通り動くようになった後の「見た目の仕上げ」の段階で用意します。

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#2f6fed"/>
  <text x="256" y="320" font-size="220" text-anchor="middle" fill="white" font-family="sans-serif">薬</text>
</svg>
```

- [ ] **Step 2: manifest.json を作成する**

```json
{
  "name": "薬学実習クイズ",
  "short_name": "薬学クイズ",
  "start_url": "./index.html",
  "display": "standalone",
  "background_color": "#f5f5f7",
  "theme_color": "#2f6fed",
  "icons": [
    { "src": "icons/icon.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any maskable" }
  ]
}
```

- [ ] **Step 3: index.html にmanifestとアイコンへのリンクを追加する**

`<head>` の中、`<link rel="stylesheet" href="css/style.css">` の直後に追加:

```html
<link rel="manifest" href="manifest.json">
<link rel="icon" href="icons/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="icons/icon.svg">
<meta name="theme-color" content="#2f6fed">
```

- [ ] **Step 4: 動作確認(手動)**

Run: `npm start`
Chromeで `http://localhost:8080` を開き、開発者ツール(F12)→「Application」タブ→「Manifest」を開いて、エラーが出ていないこと、アイコンが表示されることを確認する。

(補足:iPhoneのSafariはSVGアイコンの表示に対応が不安定な場合があります。実機での最終確認は、Task 10の通し確認、またはPNG形式のアイコンに差し替えた後に改めて行うこと。)

- [ ] **Step 5: Commit**

```bash
git add manifest.json icons/icon.svg index.html
git commit -m "feat: add PWA manifest and placeholder icon"
```

---

## Task 9: Service Worker(オフライン対応+自動更新)

**Files:**
- Create: `service-worker.js`
- Modify: `js/app.js`(Service Workerの登録処理を追加)

**Interfaces:**
- Produces: オフラインでもアプリシェルが表示される状態。`CACHE_VERSION` を書き換えて再読み込みすると、古いキャッシュが削除され新しい内容に自動的に切り替わる。

- [ ] **Step 1: service-worker.js を実装する**

```js
// オフラインでもクイズが使えるようにする仕組みと、
// 新しいバージョンを配ったときに自動で切り替わる仕組みをまとめたファイルです。

// キャッシュの名前にバージョン番号をつける。
// 問題データやコードを更新したら、このバージョン番号を上げること。
const CACHE_VERSION = 'v1';
const CACHE_NAME = `pharmacy-quiz-${CACHE_VERSION}`;

// オフラインでも表示できるようにしておきたいファイルの一覧
const APP_SHELL_FILES = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/quiz-engine.js',
  './js/storage.js',
  './js/stats.js',
  './data/questions-sample.json',
  './data/categories.json',
  './manifest.json',
  './icons/icon.svg',
];

// インストール時:一覧のファイルをキャッシュに保存する
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL_FILES))
  );
  // 新しいService Workerをすぐに有効化の待機列に進める
  self.skipWaiting();
});

// 有効化時:古いバージョンのキャッシュを削除する(自動更新の仕組み)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('pharmacy-quiz-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// リクエストが来たら:まずキャッシュを見て、なければネットワークから取りに行く
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
```

- [ ] **Step 2: app.js に登録処理を追加する**

`js/app.js` の末尾(`init();` の後)に追加:

```js
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
```

- [ ] **Step 3: オフライン動作を確認する(手動)**

Run: `npm start`
1. Chromeで `http://localhost:8080` を開く
2. 開発者ツール→「Application」タブ→「Service Workers」で登録されていることを確認する
3. 開発者ツール→「Network」タブで「Offline」にチェックを入れる
4. ページを再読み込みし、アプリが問題なく表示され、クイズに答えられることを確認する

- [ ] **Step 4: 自動更新を確認する(手動)**

1. `service-worker.js` の `CACHE_VERSION` を `'v1'` から `'v2'` に書き換えて保存する
2. ブラウザでページを2回連続で再読み込みする(1回目で新しいService Workerがインストールされ、2回目の読み込みで自動的に切り替わり、ページが再読み込みされることを確認する)
3. 開発者ツール→「Application」タブ→「Cache Storage」を開き、`pharmacy-quiz-v1` が削除され `pharmacy-quiz-v2` だけが残っていることを確認する
4. 確認が終わったら `CACHE_VERSION` を `'v1'` に戻しておく(このタスクの目的は仕組みの確認のため。本番運用時は内容を更新するたびにバージョン番号を上げる)

- [ ] **Step 5: Commit**

```bash
git add service-worker.js js/app.js
git commit -m "feat: add service worker for offline support and auto-update"
```

---

## Task 10: 通し動作確認(E2E手動テスト)

**Files:** なし(コードの追加は行わない、確認のみ)

**Interfaces:** なし

- [ ] **Step 1: すべての機能を通しで確認する**

Run: `npm start`、ブラウザで `http://localhost:8080` を開き、以下を上から順に確認する。

- [ ] ホーム画面:10カテゴリーがすべて表示される
- [ ] 「がん」を選択→3問(初級・中級・上級)が出題される→わざと1問間違える
- [ ] 「正答率」画面で「がん」のバーが正しい割合になっている
- [ ] ホームに戻り「弱点復習モードで始める」→さっき間違えた問題だけが出てくる
- [ ] 今度は正解する→再度「正答率」画面を見ると「がん」の正答率が上がっている
- [ ] クイズ中に1問ブックマークする→「ブックマーク」画面にその問題が表示される
- [ ] もう一度同じ問題にブックマークボタンを押して解除する→「ブックマーク」画面から消える
- [ ] 画面上部のストリーク表示が「🔥 連続学習 1日目」になっている
- [ ] 開発者ツールでオフラインに切り替えて再読み込みしても問題なく動く
- [ ] 開発者ツール→Application→Manifestでエラーが出ていない

- [ ] **Step 2: 自動テストがすべて通ることを最終確認する**

Run: `npm test`
Expected: すべてのテストファイル(validate-questions / storage / quiz-engine / stats)が PASS する

- [ ] **Step 3: 完了を記録する(コミットは不要、変更なしのため)**

すべて確認できたら、このタスクは完了。次は「デザイン仕上げ」または「コンテンツ作成計画(本番300問の作成)」に進む。
