"""
薬剤師国家試験のPDFから、読める日本語のテキストを取り出す道具です。

使い方:
    python tools/extract-exam-pdf.py <PDFのファイル名> [出力先のファイル名]

例:
    python tools/extract-exam-pdf.py .guideline-cache/国試111_必須問題.pdf

  出力先を省略すると、同じ場所に「〜.text.txt」という名前で保存します。

なぜ専用の道具が要るか:
  厚生労働省が公開している国家試験のPDFは、日本語の字を「番号」で持つ形式
  (CIDフォント)で作られていて、その番号と字の対応表がPDFに入っていません。
  そのため、ふだん使っている pdftotext では文字化けしてしまいます。
  PyMuPDF はこの対応表を自前で持っているので、正しく日本語に戻せます。

必要な準備(1回だけ):
    pip install pymupdf
"""

import io
import sys
from pathlib import Path

try:
    import pymupdf
except ImportError:
    print("PyMuPDF が入っていません。先に次を実行してください:")
    print("    pip install pymupdf")
    sys.exit(1)


def extract(pdf_path: Path) -> str:
    """PDFを1ページずつ読み、ページの区切りが分かる形でつなげて返す"""
    document = pymupdf.open(pdf_path)
    parts = []
    for number, page in enumerate(document, start=1):
        # あとで「何ページ目の問題か」を追えるように、区切りの行を入れておく
        parts.append(f"\n===== page {number} =====\n")
        parts.append(page.get_text())
    document.close()
    return "".join(parts)


def main() -> None:
    if len(sys.argv) < 2:
        print("使い方: python tools/extract-exam-pdf.py <PDFのファイル名> [出力先のファイル名]")
        sys.exit(2)

    pdf_path = Path(sys.argv[1])
    if not pdf_path.exists():
        print(f"ファイルが見つかりません: {pdf_path}")
        sys.exit(1)

    out_path = Path(sys.argv[2]) if len(sys.argv) > 2 else pdf_path.with_suffix(".text.txt")

    text = extract(pdf_path)
    io.open(out_path, "w", encoding="utf-8").write(text)

    # Windowsの画面はUTF-8以外のことがあるので、日本語のファイル名は表示せず件数だけ知らせる
    print(f"抽出しました: {len(text):,} 文字 -> {out_path.name}")


if __name__ == "__main__":
    main()
