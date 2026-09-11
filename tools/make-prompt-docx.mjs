/*
  docs/build-prompt.md の「プロンプト本体」だけを取り出して、Wordファイル(.docx)にする道具です。

  使い方:
    npm install          … 一度だけ(docx という部品を入れる)
    node tools/make-prompt-docx.mjs

  なぜ本体だけを取り出すのか:
    build-prompt.md の前半には「このプロンプトでは同じ問題までは再現できない」という
    依頼する側向けの断り書きが入っています。
    Wordファイルは「そのまま渡して使ってもらう」ためのものなので、依頼文だけを載せます。

  ※ この道具が使う docx は、開発用の部品です。
    アプリ本体(index.html や js/)は今までどおり、部品を一切使っていません。
*/

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(HERE, '..', 'docs', 'build-prompt.md');
const OUT_DIR = join(HERE, '..', 'docs', 'qr');
const OUT_FILE = join(OUT_DIR, '薬学実習クイズ-作成プロンプト.docx');

// ここから下が「プロンプト本体」だという目印
const BODY_MARKER = '# プロンプト本体';

// --- 色や幅の決め事 -------------------------------------------------------
const INK = '1B2A4A';    // 見出しの濃い紺
const ACCENT = '6B2E5F'; // 小見出しの差し色
const TINT = 'F5F2EB';   // 表の見出しやコードの背景
const LINE = 'DCD6C8';   // 罫線

// Wordの長さの単位は DXA(1インチ = 1440)。A4の余白を引いた本文の幅
const CONTENT_WIDTH = 9360;

// -------------------------------------------------------------------------
//  1. Markdown を「かたまり」の並びに読み替える
// -------------------------------------------------------------------------

/** 断り書きを落として、プロンプト本体だけを返す */
function extractBody(text) {
  const index = text.indexOf(BODY_MARKER);
  if (index === -1) throw new Error(`「${BODY_MARKER}」の見出しが見つかりません`);
  let body = text.slice(index);
  body = body.slice(body.indexOf('\n') + 1).replace(/^\n+/, ''); // 目印の行を落とす
  return body.replace(/\n*-{3,}\s*$/, '').trimEnd(); // 末尾の区切り線も落とす
}

/**
 * 行を上から見て、見出し・箇条書き・表・コードといった「かたまり」に切り分ける。
 * 凝った変換はせず、この文書で実際に使っている書き方だけを扱う。
 */
function parseBlocks(markdown) {
  const lines = markdown.split('\n');
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 空行は読み飛ばす
    if (!line.trim()) { i += 1; continue; }

    // 区切り線
    if (/^-{3,}\s*$/.test(line)) { blocks.push({ type: 'rule' }); i += 1; continue; }

    // 見出し
    const heading = line.match(/^(#{2,3})\s+(.*)$/);
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2] });
      i += 1;
      continue;
    }

    // コード(``` で囲まれた部分)
    if (line.startsWith('```')) {
      const code = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith('```')) { code.push(lines[i]); i += 1; }
      i += 1; // 閉じる ``` を飛ばす
      blocks.push({ type: 'code', lines: code });
      continue;
    }

    // 表(| で始まる行が続くところ)
    if (line.trim().startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) { rows.push(lines[i]); i += 1; }
      // 2行目の「|---|---|」は区切りなので取り除く
      const cells = rows
        .filter((r) => !/^\s*\|[\s:|-]+\|\s*$/.test(r))
        .map((r) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
      if (cells.length) blocks.push({ type: 'table', rows: cells });
      continue;
    }

    // 箇条書き(・付き / 番号付き)
    const bullet = line.match(/^(\s*)[-*]\s+(.*)$/);
    const numbered = line.match(/^(\s*)\d+\.\s+(.*)$/);
    if (bullet || numbered) {
      const ordered = Boolean(numbered);
      const items = [];
      while (i < lines.length) {
        const m = lines[i].match(ordered ? /^(\s*)\d+\.\s+(.*)$/ : /^(\s*)[-*]\s+(.*)$/);
        if (!m) {
          // 字下げされた続きの行は、直前の項目につなげる
          if (items.length && /^\s{2,}\S/.test(lines[i])) {
            items[items.length - 1].text += lines[i].trim();
            i += 1;
            continue;
          }
          break;
        }
        items.push({ indent: Math.floor(m[1].length / 2), text: m[2] });
        i += 1;
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }

    // それ以外はふつうの段落。空行が来るまでをひとまとまりにする
    const paragraph = [];
    while (i < lines.length && lines[i].trim() && !/^(#{2,3}\s|```|\s*\||\s*[-*]\s|\s*\d+\.\s|-{3,}\s*$)/.test(lines[i])) {
      paragraph.push(lines[i].trim());
      i += 1;
    }
    if (paragraph.length) blocks.push({ type: 'paragraph', text: paragraph.join('') });
  }

  return blocks;
}

// -------------------------------------------------------------------------
//  2. 文中の **太字** と `コード` を、Wordの書式に置き換える
// -------------------------------------------------------------------------

function toRuns(text, base = {}) {
  const runs = [];
  // **太字** と `コード` の両方を一度に拾う
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let match;

  const plain = (value) => {
    if (value) runs.push(new TextRun({ text: value, ...base }));
  };

  while ((match = pattern.exec(text)) !== null) {
    plain(text.slice(last, match.index));
    const token = match[0];
    if (token.startsWith('**')) {
      runs.push(new TextRun({ text: token.slice(2, -2), bold: true, color: INK, ...base }));
    } else {
      runs.push(
        new TextRun({
          text: token.slice(1, -1),
          font: 'Consolas',
          size: 18, // half-point 単位なので9pt
          shading: { type: ShadingType.CLEAR, fill: TINT },
          ...base,
        })
      );
    }
    last = pattern.lastIndex;
  }
  plain(text.slice(last));

  return runs.length ? runs : [new TextRun({ text: '', ...base })];
}

// -------------------------------------------------------------------------
//  3. かたまりを Word の部品に変える
// -------------------------------------------------------------------------

function buildTable(rows) {
  const columnCount = Math.max(...rows.map((r) => r.length));
  // 1列目をやや広く取る(「選択」「id」など短い語が入るため)
  const columnWidths =
    columnCount === 2
      ? [Math.round(CONTENT_WIDTH * 0.38), CONTENT_WIDTH - Math.round(CONTENT_WIDTH * 0.38)]
      : Array.from({ length: columnCount }, () => Math.round(CONTENT_WIDTH / columnCount));

  return new Table({
    columnWidths,
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    rows: rows.map((cells, rowIndex) =>
      new TableRow({
        tableHeader: rowIndex === 0,
        children: Array.from({ length: columnCount }, (_, columnIndex) =>
          new TableCell({
            width: { size: columnWidths[columnIndex], type: WidthType.DXA },
            shading: rowIndex === 0 ? { type: ShadingType.CLEAR, fill: TINT } : undefined,
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [
              new Paragraph({
                spacing: { before: 0, after: 0, line: 300 },
                children: toRuns(cells[columnIndex] ?? '', {
                  size: 19,
                  bold: rowIndex === 0 || undefined,
                  color: rowIndex === 0 ? INK : undefined,
                }),
              }),
            ],
          })
        ),
      })
    ),
  });
}

function buildBlocks(blocks) {
  const out = [];

  for (const block of blocks) {
    if (block.type === 'heading') {
      out.push(
        new Paragraph({
          heading: block.level === 2 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
          spacing: { before: block.level === 2 ? 360 : 260, after: 120 },
          keepNext: true, // 見出しだけがページの終わりに残らないようにする
          border:
            block.level === 2
              ? { bottom: { style: BorderStyle.SINGLE, size: 6, color: LINE, space: 4 } }
              : undefined,
          children: toRuns(block.text, {
            bold: true,
            size: block.level === 2 ? 26 : 22,
            color: block.level === 2 ? INK : ACCENT,
          }),
        })
      );
      continue;
    }

    if (block.type === 'paragraph') {
      out.push(
        new Paragraph({ spacing: { after: 140, line: 340 }, children: toRuns(block.text, { size: 20 }) })
      );
      continue;
    }

    if (block.type === 'list') {
      block.items.forEach((item) => {
        out.push(
          new Paragraph({
            numbering: { reference: block.ordered ? block.numberingRef : 'bulleted', level: Math.min(item.indent, 1) },
            spacing: { after: 80, line: 330 },
            children: toRuns(item.text, { size: 20 }),
          })
        );
      });
      continue;
    }

    if (block.type === 'code') {
      block.lines.forEach((codeLine, index) => {
        out.push(
          new Paragraph({
            spacing: { before: index === 0 ? 60 : 0, after: index === block.lines.length - 1 ? 160 : 0, line: 260 },
            shading: { type: ShadingType.CLEAR, fill: TINT },
            indent: { left: 200 },
            children: [new TextRun({ text: codeLine || ' ', font: 'Consolas', size: 17 })],
          })
        );
      });
      continue;
    }

    if (block.type === 'table') {
      out.push(buildTable(block.rows));
      out.push(new Paragraph({ spacing: { after: 160 }, children: [] })); // 表のあとに少し空ける
      continue;
    }

    if (block.type === 'rule') {
      out.push(
        new Paragraph({
          spacing: { before: 200, after: 200 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: LINE, space: 1 } },
          children: [],
        })
      );
    }
  }

  return out;
}

// -------------------------------------------------------------------------
//  4. 表紙にあたる見出しを作って、書き出す
// -------------------------------------------------------------------------

/*
  番号付きリストの設定を、リストの数だけ作る。

  1つの名前を使い回すと、Wordは「節をまたいで 7, 8, 9...」と通し番号を振ってしまう。
  リストごとに別の名前を与えると、それぞれが 1 から始まる。
*/
function buildNumberingConfig(blocks) {
  const config = [
    {
      reference: 'bulleted',
      levels: [
        { level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 420, hanging: 220 } } } },
        { level: 1, format: LevelFormat.BULLET, text: '◦', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 840, hanging: 220 } } } },
      ],
    },
  ];

  let index = 0;
  for (const block of blocks) {
    if (block.type !== 'list' || !block.ordered) continue;
    block.numberingRef = `numbered-${index}`;
    index += 1;
    config.push({
      reference: block.numberingRef,
      levels: [
        { level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 460, hanging: 260 } } } },
        { level: 1, format: LevelFormat.DECIMAL, text: '%2.', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 880, hanging: 260 } } } },
      ],
    });
  }
  return config;
}

function buildTitle() {
  return [
    new Paragraph({
      spacing: { after: 60 },
      children: [new TextRun({ text: '作 成 依 頼', bold: true, size: 18, color: ACCENT })],
    }),
    new Paragraph({
      spacing: { after: 100 },
      children: [new TextRun({ text: '薬学実習クイズ アプリ', bold: true, size: 38, color: INK })],
    }),
    new Paragraph({
      spacing: { after: 320 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: INK, space: 8 } },
      children: [
        new TextRun({
          text: 'このまま生成AIに渡して使う依頼文です。本文をそのままコピーして貼り付けられます。',
          size: 17,
          color: '6B6357',
        }),
      ],
    }),
  ];
}

function main() {
  const body = extractBody(readFileSync(SOURCE, 'utf8'));
  const blocks = parseBlocks(body);
  // 先に番号付きリストへ名前を割り当てる(buildBlocks がその名前を使う)
  const numberingConfig = buildNumberingConfig(blocks);

  const document = new Document({
    styles: {
      default: {
        document: {
          run: { font: 'Yu Gothic', size: 20 }, // 10pt
          paragraph: { spacing: { line: 340 } },
        },
      },
    },
    numbering: { config: numberingConfig },
    sections: [
      {
        properties: {
          page: {
            // A4(210 x 297mm)。docx の既定はA4だが、はっきり書いておく
            size: { width: 11906, height: 16838 },
            margin: { top: 1020, right: 1020, bottom: 1020, left: 1020 },
          },
        },
        children: [...buildTitle(), ...buildBlocks(blocks)],
      },
    ],
  });

  mkdirSync(OUT_DIR, { recursive: true });
  Packer.toBuffer(document).then((buffer) => {
    writeFileSync(OUT_FILE, buffer);
    console.log(`書き出しました: ${OUT_FILE}`);
    console.log(`  本文 ${body.length.toLocaleString()} 文字 / かたまり ${blocks.length} 個`);
    const counts = blocks.reduce((acc, b) => ({ ...acc, [b.type]: (acc[b.type] || 0) + 1 }), {});
    console.log('  内訳:', Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(', '));
  });
}

main();
