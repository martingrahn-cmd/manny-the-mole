#!/usr/bin/env python3
"""Builds the GameVolt portal version of the game.

Same single-file assembly as build-bundle.py, wrapped in a full document
with the portal's head conventions (GA4 with the iframe guard, SEO, Open
Graph, JSON-LD), the hidden #seo-content block that standalone visits
reveal, and the GameVolt SDK script tags loaded synchronously before the
game code — the game's own GameVolt hooks are all guarded, so the page
works identically if the SDK ever fails to load.

    python3 tools/build-gamevolt.py /path/to/gamevolt-repo

Writes {repo}/manny-the-mole/index.html and {repo}/manny-the-mole/og-image.png.
"""
import base64
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
if len(sys.argv) != 2:
    raise SystemExit('usage: build-gamevolt.py /path/to/gamevolt-repo')
PORTAL = pathlib.Path(sys.argv[1]) / 'manny-the-mole'

SLUG = 'manny-the-mole'
CANONICAL = f'https://gamevolt.io/{SLUG}/'
TITLE = 'Manny the Mole — Dig Deep, Crack the Vault | GameVolt.io'
DESCRIPTION = (
    'Play Manny the Mole free online — a Mr. Driller-style digging arcade '
    'game. Dig down twelve shafts, manage your air, and crack the vault’s '
    'circuit lock. New daily lock every day. No download needed.'
)

html = (ROOT / 'index.html').read_text(encoding='utf-8')
style = re.search(r'<style>.*?</style>', html, re.S).group(0)
body = re.search(r'<body[^>]*>(.*)</body>', html, re.S).group(1)
body = re.sub(r'\s*<script\s+src="[^"]*"></script>', '', body)

ASSETS = {
    p.name: p
    for pattern in ('*.png', '*.jpg')
    for p in (ROOT / 'assets').glob(pattern)
}
MIME = {'.png': 'image/png', '.jpg': 'image/jpeg'}


def data_uri(name):
    path = ASSETS.get(name)
    if path is None:
        raise SystemExit(f'missing asset: {name}')
    return f'data:{MIME[path.suffix]};base64,' + \
        base64.b64encode(path.read_bytes()).decode('ascii')


def inline_assets(text):
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

HEAD = f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">

<!-- Google Analytics -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-PY073ZX38N"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){{dataLayer.push(arguments);}}
  gtag('js', new Date());
  // Inside the portal iframe the parent page already counts this visit;
  // a second page_view here would report one play as two.
  gtag('config', 'G-PY073ZX38N', window.parent !== window ? {{ send_page_view: false }} : {{}});
</script>

<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
<meta name="theme-color" content="#070812">

<!-- SEO -->
<title>{TITLE}</title>
<meta name="description" content="{DESCRIPTION}">
<meta name="keywords" content="manny the mole, digging game, mr driller, free browser game, arcade digger, circuit puzzle, daily challenge, vault, retro arcade">
<meta name="author" content="GameVolt">
<meta name="robots" content="index, follow">

<!-- Open Graph -->
<meta property="og:type" content="website">
<meta property="og:url" content="{CANONICAL}">
<meta property="og:title" content="Manny the Mole — Dig Deep, Crack the Vault">
<meta property="og:description" content="{DESCRIPTION}">
<meta property="og:image" content="{CANONICAL}og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:site_name" content="GameVolt">

<!-- Twitter Card -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Manny the Mole — Dig Deep, Crack the Vault">
<meta name="twitter:description" content="{DESCRIPTION}">
<meta name="twitter:image" content="{CANONICAL}og-image.png">

<!-- Structured Data -->
<script type="application/ld+json">
{{
    "@context": "https://schema.org",
    "@type": "VideoGame",
    "name": "Manny the Mole",
    "description": "{DESCRIPTION}",
    "url": "{CANONICAL}",
    "image": "{CANONICAL}og-image.png",
    "genre": ["Arcade", "Action", "Puzzle"],
    "gamePlatform": ["Web Browser", "Mobile", "Desktop"],
    "operatingSystem": "Any (Browser-based)",
    "applicationCategory": "Game",
    "inLanguage": "en",
    "isAccessibleForFree": true,
    "offers": {{ "@type": "Offer", "price": "0", "priceCurrency": "USD" }},
    "author": {{ "@type": "Organization", "@id": "https://gamevolt.io/#organization", "name": "GameVolt", "url": "https://gamevolt.io" }},
    "numberOfPlayers": {{ "@type": "QuantitativeValue", "value": 1 }},
    "playMode": "SinglePlayer"
}}
</script>
<script type="application/ld+json">
{{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {{"@type": "ListItem", "position": 1, "name": "Home", "item": "https://gamevolt.io/"}},
    {{"@type": "ListItem", "position": 2, "name": "Arcade Games", "item": "https://gamevolt.io/arcade-games/"}},
    {{"@type": "ListItem", "position": 3, "name": "Manny the Mole", "item": "{CANONICAL}"}}
  ]
}}
</script>
<script type="application/ld+json">
{{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {{"@type": "Question", "name": "What kind of game is Manny the Mole?",
      "acceptedAnswer": {{"@type": "Answer", "text": "Manny the Mole is a Mr. Driller-style arcade digging game. You dig down through colored blocks toward a buried vault, managing your air supply while matched blocks crumble and the ceiling comes down behind you."}}}},
    {{"@type": "Question", "name": "How do the circuit locks work?",
      "acceptedAnswer": {{"@type": "Answer", "text": "Every vault is sealed by a circuit lock: uncover and swap conductors to route the current from IN to OUT before it catches up with you. The campaign has 24 designed locks with medal times, and failed attempts wear the mechanism down so the current runs slower each retry."}}}},
    {{"@type": "Question", "name": "What is the Daily Lock?",
      "acceptedAnswer": {{"@type": "Answer", "text": "One lock a day, the same board for every player in the world. Solve it daily to keep your streak alive — miss a day and the streak starts over, but your best streak is remembered forever."}}}},
    {{"@type": "Question", "name": "Can I play Manny the Mole on mobile?",
      "acceptedAnswer": {{"@type": "Answer", "text": "Yes. The game has full touch controls — drag to move and dig, tap to work the locks — and runs in any modern mobile browser with nothing to install."}}}},
    {{"@type": "Question", "name": "Is Manny the Mole free?",
      "acceptedAnswer": {{"@type": "Answer", "text": "Completely free, in your browser, with no download and no account required. Signing in to GameVolt adds global leaderboards for run scores and daily-lock streaks."}}}}
  ]
}}
</script>

<link rel="canonical" href="{CANONICAL}">
<link rel="icon" type="image/png" href="/assets/favicon.png">
{inline_assets(style)}
</head>
<body>'''

SEO_CONTENT = f'''
<div id="seo-content" style="display:none;">
  <nav aria-label="Breadcrumb">
    <a href="/">Home</a> › <a href="/arcade-games/">Arcade Games</a> › Manny the Mole
  </nav>
  <h1>Manny the Mole — free online digging arcade game</h1>
  <p>Manny the Mole is a Mr. Driller-style digger about going down on purpose.
  Twelve hand-carved shafts stand between Manny and retirement: colored blocks
  crumble in clumps when they match, the ceiling follows you down, and the air
  meter is the only clock that matters. At the bottom of every shaft waits a
  vault sealed with a circuit lock — uncover the conductors, route the current,
  and get out with the goods.</p>
  <p>Past the campaign there is a 24-lock circuit gauntlet with medal times,
  a wire-cutting side puzzle, a trophy cabinet, and the Daily Lock: one board a
  day, identical for every player on earth, kept alive by a streak. Locks wear
  down as you retry them, so persistence always gets you through — but the
  medals only go to clean hands.</p>
  <h2>More on GameVolt</h2>
  <p>If circuit routing is your thing, try
  <a href="/livewire/">Livewire</a> for the relaxing version, or go loud with
  <a href="/gridburn/">Gridburn</a> and
  <a href="/vector-hexagon/">Vector Hexagon</a>.</p>
</div>
<script>
if (window.parent === window) {{
  document.documentElement.classList.add('gv-standalone');
  document.body.classList.add('gv-standalone');
  document.getElementById('seo-content').style.display = 'block';
}}
</script>
<script src="/js/gv-ga4.js"></script>
<script>window.GameVoltTracker=window.GameVoltTracker||{{start:function(){{}},play:function(){{}},track:function(){{}},end:function(){{}}}};</script>
<script src="/sdk/gamevolt.js" data-game="{SLUG}"></script>
'''

PORTAL.mkdir(parents=True, exist_ok=True)
out = PORTAL / 'index.html'
out.write_text(
    HEAD + body + SEO_CONTENT + '\n'.join(scripts) + '\n</body>\n</html>\n',
    encoding='utf-8',
)

left = re.findall(r'["\'(]assets/([^"\')]+)', out.read_text(encoding='utf-8'))
# the favicon link and seo prose legitimately reference the portal's own
# /assets/ paths; only game-asset references (bare assets/...) are leaks
leaks = [name for name in left if (ROOT / 'assets' / name).exists()]
print(f'wrote {out} ({out.stat().st_size / 1024:.0f} KB)')
if leaks:
    raise SystemExit(f'game assets still on disk: {leaks}')

# --- og-image: 1200x630 cover-crop from the landscape key art ---------------
from PIL import Image

art = Image.open(ROOT / 'docs' / 'cover-landscape.png').convert('RGB')
scale = max(1200 / art.width, 630 / art.height)
resized = art.resize(
    (round(art.width * scale), round(art.height * scale)),
    Image.LANCZOS,
)
x = (resized.width - 1200) // 2
y = (resized.height - 630) // 2
cropped = resized.crop((x, y, x + 1200, y + 630))
# Painterly art as truecolor PNG lands well past a megabyte; a dithered
# 256-color palette keeps it in line with the portal's other og-images.
cropped.quantize(256, dither=Image.Dither.FLOYDSTEINBERG).save(
    PORTAL / 'og-image.png', optimize=True
)
size = (PORTAL / 'og-image.png').stat().st_size
print(f'wrote {PORTAL / "og-image.png"} ({size / 1024:.0f} KB)')
