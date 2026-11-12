"""Package the generated classroom handout for a direct browser download."""
from pathlib import Path
import zipfile
root = Path(__file__).resolve().parents[1]
source = root / 'dist-offline/tohoku-yokairoku.html'
output = root / 'handouts/tohoku-yokairoku-15seconds.zip'
output.parent.mkdir(exist_ok=True)
guide = '''東北妖解録・15秒待機版

1. ZIPを展開してください。
2. 中の tohoku-yokairoku.html を、HTMLが実行できるブラウザで開きます。
3. 学校で許可されているファイル配布方法で、このHTMLを生徒へ渡します。

画像・文字・音・データはHTML内に同梱されています。ゲームの実行に外部通信は不要です。
不正解後の再挑戦・章移動・最終章の終了までの待機は15秒です。
ファイルのプレビューだけではゲームが動かない場合があります。ダウンロード後にブラウザで開いてください。
端末がHTMLの実行自体を禁止している場合は、管理者に利用可能な方法を確認してください。
保存が許可されない端末では、画面を閉じると進行が失われる旨を表示します。
'''
with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    archive.write(source, 'tohoku-yokairoku.html')
    archive.writestr('はじめに.txt', guide)
    archive.write(root / 'dist-offline/SHA256.txt', 'SHA256.txt')
    archive.write(root / 'assets/fonts/OFL.txt', 'FONT-LICENSE.txt')
with zipfile.ZipFile(output) as archive:
    assert archive.testzip() is None
    assert archive.read('tohoku-yokairoku.html') == source.read_bytes()
print(f'Validated download archive: {output.relative_to(root)} ({output.stat().st_size / 1024 / 1024:.1f} MiB)')
