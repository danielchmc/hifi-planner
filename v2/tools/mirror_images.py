"""HiFi Planner: copy hifiklubben.com images used by the catalogue into the repository.

Products refer to website images as "hk:<uuid>" (front, back and colour variants). This script downloads every one that is
not in img/hk/ yet, trims the white margins and saves:
  img/hk/<uuid>.webp      max 640 px  (cards, lists)       for every hk image
  img/hd/hk/<uuid>.webp   max 1600 px (zoom, full screen)  for front/back images
The app shows the local copy and falls back to the website, so a missing file never breaks anything.

Usage: python3 tools/mirror_images.py <app dir> [--budget 400]      (needs Pillow)"""
import io, json, os, re, sys, time, urllib.request
from PIL import Image, ImageChops

APP = sys.argv[1] if len(sys.argv) > 1 else '.'
BUDGET = int(sys.argv[sys.argv.index('--budget') + 1]) if '--budget' in sys.argv else 400
UA = {'User-Agent': 'Mozilla/5.0 (HiFi Planner image mirror; +https://hifiplanner.dk)'}
HK = re.compile(r'^hk:([0-9a-f-]{36})$')

text = open(os.path.join(APP, 'data', 'products.js'), encoding='utf-8').read()
products = json.loads(text[text.index('['):text.rindex(']') + 1])
need = {}  # uuid -> needs hd
for p in products:
    for i, u in enumerate(p.get('img') or []):
        m = HK.match(u or '')
        if m: need[m.group(1)] = True
    for v in p.get('vars') or []:
        m = HK.match(v.get('img') or '')
        if m: need.setdefault(m.group(1), False)

def trim(im):
    has_alpha = im.mode in ('RGBA', 'LA', 'P')
    im = im.convert('RGBA' if has_alpha else 'RGB')
    if has_alpha:
        rgb = Image.new('RGB', im.size, (255, 255, 255)); rgb.paste(im, mask=im.getchannel('A')); im = rgb
    diff = ImageChops.difference(im, Image.new('RGB', im.size, (255, 255, 255))).convert('L')
    box = diff.point(lambda v: 255 if v > 14 else 0).getbbox()
    if box:
        pad = int(max(im.size) * 0.02)
        im = im.crop((max(0, box[0] - pad), max(0, box[1] - pad), min(im.size[0], box[2] + pad), min(im.size[1], box[3] + pad)))
    return im

def save(im, path, size, quality):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im = im.copy(); im.thumbnail((size, size), Image.LANCZOS)
    im.save(path, 'WEBP', quality=quality, method=4)

done = failed = skipped = 0
for uuid, hd in need.items():
    small = os.path.join(APP, 'img', 'hk', uuid + '.webp')
    big = os.path.join(APP, 'img', 'hd', 'hk', uuid + '.webp')
    if os.path.exists(small) and (not hd or os.path.exists(big)):
        skipped += 1; continue
    if done >= BUDGET: continue
    try:
        req = urllib.request.Request('https://images.hifiklubben.com/image/%s/yuge/x.jpg' % uuid, headers=UA)
        im = trim(Image.open(io.BytesIO(urllib.request.urlopen(req, timeout=30).read())))
        save(im, small, 640, 80)
        if hd: save(im, big, 1600, 74)
        done += 1
        time.sleep(0.1)
    except Exception as e:
        failed += 1; print('FAIL', uuid, e)
left = sum(1 for u, hd in need.items() if not os.path.exists(os.path.join(APP, 'img', 'hk', u + '.webp')))
print('images: %d referenced, %d downloaded now, %d already here, %d failed, %d still to do' % (len(need), done, skipped, failed, left))
