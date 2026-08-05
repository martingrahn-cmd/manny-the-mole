"""Builds the CrazyGames submission zip.

The only difference from the plain game is one script tag: the CrazyGames
SDK, which the game code treats as optional everywhere. The tag lives
here rather than in index.html so the GitHub Pages and artifact builds
keep their zero-external-requests property.

Usage: python3 tools/build-crazygames.py [out.zip]
"""
import pathlib
import shutil
import sys
import tempfile
import zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'manny-the-mole-crazygames.zip'

SDK_TAG = '    <script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>\n'
FILES = ('index.html', 'sounds.js', 'levels.js', 'puzzles.js', 'trophies.js', 'game.js')

html = (ROOT / 'index.html').read_text(encoding='utf-8')
anchor = '    <script src="sounds.js'
if anchor not in html:
    raise SystemExit('script anchor not found in index.html')
html = html.replace(anchor, SDK_TAG + anchor, 1)

with tempfile.TemporaryDirectory() as tmp:
    stage = pathlib.Path(tmp) / 'game'
    stage.mkdir()
    (stage / 'index.html').write_text(html, encoding='utf-8')
    for name in FILES[1:]:
        shutil.copy(ROOT / name, stage / name)
    shutil.copytree(ROOT / 'assets', stage / 'assets')

    with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as z:
        for path in sorted(stage.rglob('*')):
            if path.is_file():
                z.write(path, path.relative_to(stage))

count = len(zipfile.ZipFile(OUT).namelist())
print(f'wrote {OUT} ({OUT.stat().st_size // 1024} KB, {count} files, SDK tag injected)')
