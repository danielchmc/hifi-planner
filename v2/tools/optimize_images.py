"""Trim white margins and compress product images to WebP for HiFi Planner v2.
Usage: python3 optimize_images.py <src_images_dir> <dst_img_dir> [seconds_budget]
Resumable: skips files that already exist in dst."""
import os, sys, time
from PIL import Image, ImageChops
Image.MAX_IMAGE_PIXELS = None
src, dst = sys.argv[1], sys.argv[2]
budget = float(sys.argv[3]) if len(sys.argv) > 3 else 1e9
MAX = 640
t0 = time.time(); done = skipped = failed = 0
os.makedirs(dst, exist_ok=True)
for f in sorted(os.listdir(src)):
    base, ext = os.path.splitext(f)
    if ext.lower() not in ('.jpg', '.jpeg', '.png', '.webp'): continue
    out = os.path.join(dst, base + '.webp')
    if os.path.exists(out): skipped += 1; continue
    if time.time() - t0 > budget: break
    try:
        im = Image.open(os.path.join(src, f))
        im.draft('RGB', (MAX * 2, MAX * 2))
        has_alpha = im.mode in ('RGBA', 'LA', 'P')
        im = im.convert('RGBA' if has_alpha else 'RGB')
        if has_alpha:
            bbox = im.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
            rgb = Image.new('RGB', im.size, (255, 255, 255)); rgb.paste(im, mask=im.getchannel('A'))
        else:
            bbox = None; rgb = im
        diff = ImageChops.difference(rgb, Image.new('RGB', rgb.size, (255, 255, 255))).convert('L')
        b2 = diff.point(lambda v: 255 if v > 14 else 0).getbbox()
        if b2: bbox = b2
        if bbox:
            pad = int(max(im.size) * 0.02)
            bbox = (max(0, bbox[0] - pad), max(0, bbox[1] - pad), min(im.size[0], bbox[2] + pad), min(im.size[1], bbox[3] + pad))
            im = im.crop(bbox)
        im.thumbnail((MAX, MAX), Image.LANCZOS)
        im.save(out, 'WEBP', quality=80, method=4)
        done += 1
    except Exception as e:
        failed += 1; print('FAIL', f, e)
print(f'done={done} skipped={skipped} failed={failed} t={time.time()-t0:.0f}s')
