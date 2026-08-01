#!/usr/bin/env python3
"""Bundles the game into one self-contained HTML file.

The Artifact host serves the page under a strict CSP that blocks every
external request, so nothing can be fetched at runtime: the scripts have
to be inlined and every asset has to travel as a data: URI. Assets are
referenced from two places — JS string literals and CSS url() — and both
have to be rewritten or the page loads with holes in it.

    python3 tools/build-bundle.py [output.html]

Defaults to manny-the-mole.html next to the repository.
"""
import base64
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else \
    ROOT / 'manny-the-mole.html'

html = (ROOT / 'index.html').read_text(encoding='utf-8')
style = re.search(r'<style>.*?</style>', html, re.S).group(0)
title = re.search(r'<title>(.*?)</title>', html, re.S).group(1)

# the body, minus the <script src> tags — those get inlined below
body = re.search(r'<body[^>]*>(.*)</body>', html, re.S).group(1)
body = re.sub(r'\s*<script\s+src="[^"]*"></script>', '', body)

ASSETS = {p.name: p for p in (ROOT / 'assets').glob('*.png')}


def data_uri(name):
    path = ASSETS.get(name)
    if path is None:
        raise SystemExit(f'missing asset: {name}')
    return 'data:image/png;base64,' + \
        base64.b64encode(path.read_bytes()).decode('ascii')


def inline_assets(text):
    """Rewrites assets/x.png in JS literals and CSS url() alike."""
    text = re.sub(
        r"'assets/([^']+)'",
        lambda m: f"'{data_uri(m.group(1))}'",
        text,
    )
    return re.sub(
        r'url\(\s*"assets/([^"]+)"\s*\)',
        lambda m: f'url("{data_uri(m.group(1))}")',
        text,
    )


scripts = []
for name in ('sounds.js', 'levels.js', 'puzzles.js', 'trophies.js', 'game.js'):
    js = (ROOT / name).read_text(encoding='utf-8')
    if '</script' in js:
        raise SystemExit(f'{name} contains </script> and cannot be inlined')
    scripts.append(f'<script>\n{inline_assets(js)}\n</script>')

OUT.write_text(
    f'<title>{title}</title>\n{inline_assets(style)}\n{body}\n'
    + '\n'.join(scripts),
    encoding='utf-8',
)

# nothing may still point at the filesystem
left = re.findall(r'["\'(]assets/', OUT.read_text(encoding='utf-8'))
print(f'wrote {OUT} ({OUT.stat().st_size / 1024:.0f} KB)')
print(f'remaining assets/ references: {len(left)}')
if left:
    raise SystemExit('bundle still references files on disk')
