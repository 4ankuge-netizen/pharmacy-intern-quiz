"""
実習生に配るQRコードと案内シートを作り直す道具です。

使い方:
    python tools/make-qr.py

必要なもの:
    pip install segno          … QRコードを作る
    （PDFを作るには、Microsoft Edge か Google Chrome がパソコンに入っていること）

この道具がやること:
  1. アプリのURLからQRコードを作り、PNGとSVGで保存する
  2. 案内シート(docs/qr/print.html)の中のQRコードを差し替える
  3. 案内シートをA4 1枚のPDFに書き出す

URLを変えたいときは、下の APP_URL を書き換えてから実行してください。
"""

import io
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

import segno

# ---- 設定 -------------------------------------------------------------

APP_URL = "https://4ankuge-netizen.github.io/pharmacy-intern-quiz/"

# 誤り訂正のレベル。'h' がいちばん強く、汚れや欠けに強い。印刷して貼る用途に向く
ERROR_LEVEL = "h"

# QRコードの色。アプリのテーマ色(濃い紺)に合わせている
DARK = "#1B2A4A"

# 周囲の余白を「マス目いくつぶん」とるか。4はQRコードの規格で推奨されている値
BORDER = 4

HERE = Path(__file__).resolve().parent
QR_DIR = HERE.parent / "docs" / "qr"
SHEET = QR_DIR / "print.html"
PDF = QR_DIR / "薬学実習クイズ-案内.pdf"


# ---- 1. QRコードの画像を作る ------------------------------------------

def make_images(qr):
    QR_DIR.mkdir(parents=True, exist_ok=True)
    # scale は「1マスを何ピクセルで描くか」。12なら588px四方になる
    qr.save(QR_DIR / "quiz-qr.png", scale=12, border=BORDER, dark=DARK, light="white")
    qr.save(QR_DIR / "quiz-qr.svg", scale=12, border=BORDER, dark=DARK, light="white")
    print(f"  quiz-qr.png / quiz-qr.svg を保存しました")


# ---- 2. 案内シートの中のQRコードを差し替える --------------------------

def build_inline_svg(qr):
    """案内シートに直接埋め込むための、図形だけのSVGを組み立てる。

    画像ファイルを参照せず図形として書き込むことで、
    HTMLファイル1つだけで印刷でき、拡大しても荒れない。
    """
    buf = io.BytesIO()
    qr.save(buf, kind="svg", scale=1, border=0, dark=DARK, light=None,
            omitsize=True, xmldecl=False, svgns=False, svgclass=None, lineclass=None)
    inner = buf.getvalue().decode("utf-8")
    inner = re.sub(r"^<svg[^>]*>", "", inner).replace("</svg>", "").strip()

    size = qr.symbol_size(border=0)[0]  # マス目の数(枠なし)
    view = size + BORDER * 2
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {view} {view}" '
        f'shape-rendering="crispEdges" role="img" aria-label="薬学実習クイズのQRコード">'
        f'<rect width="{view}" height="{view}" fill="#fff"/>'
        f'<g transform="translate({BORDER} {BORDER})">{inner}</g></svg>'
    )


def update_sheet(svg):
    if not SHEET.exists():
        print(f"  {SHEET.name} が見つからないので、差し替えを飛ばしました")
        return False
    html = SHEET.read_text(encoding="utf-8")
    pattern = r'<svg xmlns[^>]*aria-label="薬学実習クイズのQRコード">.*?</svg>'
    if not re.search(pattern, html, flags=re.S):
        print(f"  {SHEET.name} の中にQRコードの置き場所が見つかりませんでした")
        return False
    SHEET.write_text(re.sub(pattern, svg, html, flags=re.S), encoding="utf-8")
    print(f"  {SHEET.name} のQRコードを差し替えました")
    return True


# ---- 3. PDFに書き出す -------------------------------------------------

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


def make_pdf():
    browser = find_browser()
    if not browser:
        print("  PDFは作れませんでした(EdgeもChromeも見つかりません)。")
        print("  案内シートをブラウザで開いて Ctrl+P から印刷してください。")
        return False

    subprocess.run(
        [
            browser,
            "--headless",
            "--disable-gpu",
            "--no-pdf-header-footer",  # 上下にURLや日付を入れない
            f"--print-to-pdf={PDF}",
            SHEET.as_uri(),
        ],
        check=True,
        capture_output=True,
    )
    if wait_until_written(PDF):
        print(f"  {PDF.name} を書き出しました ({PDF.stat().st_size:,} バイト)")
        return True
    print("  PDFの書き出しに失敗しました")
    return False


def main():
    qr = segno.make(APP_URL, error=ERROR_LEVEL)
    print(f"QRコードを作ります: {APP_URL}")
    print(f"  版(version) {qr.version} / 誤り訂正 {qr.error.upper()} / {qr.symbol_size(border=0)[0]}マス四方")

    make_images(qr)
    if update_sheet(build_inline_svg(qr)):
        make_pdf()

    print("\n完了しました。docs/qr/ を確認してください。")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:  # 失敗した理由をそのまま見せる
        print(f"失敗しました: {error}", file=sys.stderr)
        sys.exit(1)
