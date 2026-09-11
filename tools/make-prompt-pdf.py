"""
docs/build-prompt.md の「プロンプト本体」だけを取り出して、A4のPDFにする道具です。

使い方:
    python tools/make-prompt-pdf.py

必要なもの:
    pip install markdown
    （PDFを作るには、Microsoft Edge か Google Chrome がパソコンに入っていること）

なぜ本体だけを取り出すのか:
    build-prompt.md の前半には「このプロンプトでは同じ問題までは再現できない」という
    私(依頼する側)向けの断り書きが入っています。
    PDFは「そのまま渡して使ってもらう」ためのものなので、依頼文だけを載せます。
"""

import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

import markdown

HERE = Path(__file__).resolve().parent
SOURCE = HERE.parent / "docs" / "build-prompt.md"
OUT_DIR = HERE.parent / "docs" / "qr"
HTML_OUT = OUT_DIR / "build-prompt.html"
PDF_OUT = OUT_DIR / "薬学実習クイズ-作成プロンプト.pdf"

# ここから下が「プロンプト本体」だという目印
BODY_MARKER = "# プロンプト本体"


def extract_body(text):
    """前半の断り書きを落として、プロンプト本体だけを返す。"""
    index = text.find(BODY_MARKER)
    if index == -1:
        raise SystemExit(f"「{BODY_MARKER}」の見出しが見つかりません")

    body = text[index:]
    # 目印の見出しの行そのものは、PDFでは不要なので落とす
    body = body.split("\n", 1)[1].lstrip("\n")
    # 見出しの直前にある区切り線も落とす
    body = body.rstrip()
    if body.endswith("---"):
        body = body[: -3].rstrip()
    return body


STYLE = """
/* ------------------------------------------------------------------
   印刷して読む・渡すためのスタイル。
   日本語は1行が長いと読みにくいので、行間をゆったりとってある。
   ------------------------------------------------------------------ */
:root {
  --ink: #1B2A4A;      /* 本文の濃い紺 */
  --body: #262421;     /* 本文の文字 */
  --muted: #6B6357;    /* 補足の文字 */
  --line: #DCD6C8;     /* 罫線 */
  --accent: #6B2E5F;   /* 見出しの差し色 */
  --tint: #F5F2EB;     /* 表の見出しや引用の背景 */
}

@page {
  size: A4 portrait;
  margin: 18mm 17mm 16mm;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  font-family: "Hiragino Kaku Gothic ProN", "Yu Gothic", "Meiryo", system-ui, sans-serif;
  font-size: 10pt;
  line-height: 1.85;
  color: var(--body);
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

/* ---- 冒頭のタイトル ---- */
.doc-title {
  margin-bottom: 9mm;
  padding-bottom: 4mm;
  border-bottom: 2px solid var(--ink);
}
.doc-title .eyebrow {
  margin: 0 0 2mm;
  font-size: 9pt;
  font-weight: 700;
  letter-spacing: 0.18em;
  color: var(--accent);
}
.doc-title h1 {
  margin: 0;
  font-size: 19pt;
  color: var(--ink);
  letter-spacing: 0.02em;
}
.doc-title .note {
  margin: 3mm 0 0;
  font-size: 8.5pt;
  line-height: 1.7;
  color: var(--muted);
}

/* ---- 見出し ---- */
h2, h3 {
  color: var(--ink);
  /* 見出しだけが行の終わりに残らないようにする */
  break-after: avoid;
  page-break-after: avoid;
}
h2 {
  margin: 9mm 0 3mm;
  padding-bottom: 2mm;
  font-size: 13pt;
  border-bottom: 1.5px solid var(--line);
}
h3 {
  margin: 6mm 0 2mm;
  font-size: 11pt;
  color: var(--accent);
}

p { margin: 0 0 3mm; }

/* ---- 箇条書き ---- */
ul, ol { margin: 0 0 3mm; padding-left: 5.5mm; }
li { margin-bottom: 1.5mm; }
li > ul, li > ol { margin-top: 1.5mm; }

strong { color: var(--ink); }

/* ---- 表 ---- */
table {
  width: 100%;
  border-collapse: collapse;
  margin: 0 0 4mm;
  font-size: 9pt;
  break-inside: avoid;
  page-break-inside: avoid;
}
th, td {
  border: 1px solid var(--line);
  padding: 1.8mm 2.5mm;
  text-align: left;
  vertical-align: top;
  line-height: 1.6;
}
th {
  background: var(--tint);
  font-weight: 700;
  color: var(--ink);
}

/* ---- コード ---- */
code {
  font-family: "SFMono-Regular", Consolas, "Courier New", monospace;
  font-size: 8.5pt;
  background: var(--tint);
  padding: 0.3mm 1.2mm;
  border-radius: 3px;
}
pre {
  margin: 0 0 4mm;
  padding: 3mm 4mm;
  background: var(--tint);
  border: 1px solid var(--line);
  border-radius: 6px;
  overflow-wrap: break-word;
  white-space: pre-wrap;
  break-inside: avoid;
  page-break-inside: avoid;
}
pre code {
  background: none;
  padding: 0;
  font-size: 8pt;
  line-height: 1.6;
}

/* ---- 区切り線 ---- */
hr {
  border: none;
  border-top: 1px solid var(--line);
  margin: 7mm 0;
}
"""

TEMPLATE = """<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>薬学実習クイズ 作成プロンプト</title>
<style>{style}</style>
</head>
<body>
<div class="doc-title">
  <p class="eyebrow">作成依頼</p>
  <h1>薬学実習クイズ アプリ</h1>
  <p class="note">
    このまま生成AIに渡して使う依頼文です。貼り付けて使う場合は、
    改行が崩れないよう <code>docs/build-prompt.md</code> から本文をコピーしてください。
  </p>
</div>
{body}
</body>
</html>
"""


def find_browser():
    """PDFを作れるブラウザ(Edge か Chrome)を探す。"""
    candidates = [
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    ]
    for path in candidates:
        if os.path.exists(path):
            return path
    for name in ("msedge", "chrome", "google-chrome", "chromium"):
        found = shutil.which(name)
        if found:
            return found
    return None


def wait_until_written(path, timeout=30):
    """PDFが最後まで書き終わるのを待つ。

    ブラウザは終了した直後にはまだ書き込み中のことがある。
    待たずに読むと、途中までのPDFを読んで
    「2ページある」「中身が古い」といった見誤りが起きる。
    大きさが変わらなくなるまで待ってから次へ進む。
    """
    import time

    deadline = time.time() + timeout
    last_size = -1
    stable_for = 0
    while time.time() < deadline:
        if path.exists():
            size = path.stat().st_size
            if size > 0 and size == last_size:
                stable_for += 1
                if stable_for >= 3:  # 3回続けて同じ大きさなら書き終わったとみなす
                    return True
            else:
                stable_for = 0
            last_size = size
        time.sleep(0.3)
    return path.exists() and path.stat().st_size > 0


def main():
    text = SOURCE.read_text(encoding="utf-8")
    body_md = extract_body(text)

    html_body = markdown.markdown(body_md, extensions=["tables", "fenced_code"])
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    HTML_OUT.write_text(TEMPLATE.format(style=STYLE, body=html_body), encoding="utf-8")
    print(f"  {HTML_OUT.name} を作りました（本文 {len(body_md):,} 文字）")

    browser = find_browser()
    if not browser:
        print("  PDFは作れませんでした(EdgeもChromeも見つかりません)。")
        print(f"  {HTML_OUT} をブラウザで開いて Ctrl+P から印刷してください。")
        return

    if PDF_OUT.exists():
        PDF_OUT.unlink()  # 前の版を読んでしまわないよう先に消す

    subprocess.run(
        [
            browser,
            "--headless",
            "--disable-gpu",
            "--no-pdf-header-footer",  # 上下にURLや日付を入れない
            f"--print-to-pdf={PDF_OUT}",
            HTML_OUT.as_uri(),
        ],
        check=True,
        capture_output=True,
    )

    if wait_until_written(PDF_OUT):
        print(f"  {PDF_OUT.name} を書き出しました ({PDF_OUT.stat().st_size:,} バイト)")
    else:
        print("  PDFの書き出しに失敗しました")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"失敗しました: {error}", file=sys.stderr)
        sys.exit(1)
