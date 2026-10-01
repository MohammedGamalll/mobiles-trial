import os
from pathlib import Path

import cv2

src = Path(r"D:\PIXEL01\mobiles trial\refs\sahl system.mp4")
out = Path(r"D:\PIXEL01\mobiles trial\refs\sahl-frames")
out.mkdir(parents=True, exist_ok=True)
for old in out.glob("*.jpg"):
    old.unlink()

cap = cv2.VideoCapture(str(src))
if not cap.isOpened():
    raise SystemExit("cannot open video")

fps = cap.get(cv2.CAP_PROP_FPS) or 30
count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
duration = count / fps if fps else 0
print(f"fps={fps:.2f} frames={count} size={w}x{h} duration_s={duration:.1f}")

# Sample ~every 2.2s, keep visually new screens.
step = max(1, int(fps * 2.2))
prev = None
saved = 0
idx = 0
max_save = 90


def hist(img):
    small = cv2.resize(img, (160, 90))
    hsv = cv2.cvtColor(small, cv2.COLOR_BGR2HSV)
    return cv2.calcHist([hsv], [0, 1], None, [16, 16], [0, 180, 0, 256])


while True:
    cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
    ok, frame = cap.read()
    if not ok:
        break
    sec = idx / fps
    hh = hist(frame)
    keep = False
    if prev is None:
        keep = True
    else:
        score = cv2.compareHist(prev, hh, cv2.HISTCMP_CORREL)
        if score < 0.92:
            keep = True
    if keep:
        saved += 1
        name = out / f"{saved:03d}_{int(sec):05d}s.jpg"
        vis = cv2.resize(frame, (1280, int(frame.shape[0] * 1280 / frame.shape[1])))
        cv2.imwrite(str(name), vis, [int(cv2.IMWRITE_JPEG_QUALITY), 82])
        prev = hh
        print(f"saved {name.name}")
        if saved >= max_save:
            break
    idx += step

cap.release()
print(f"done saved={saved}")
