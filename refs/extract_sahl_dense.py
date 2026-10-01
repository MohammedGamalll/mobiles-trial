import cv2
from pathlib import Path

src = Path(r"D:\PIXEL01\mobiles trial\refs\sahl system.mp4")
out = Path(r"D:\PIXEL01\mobiles trial\refs\sahl-frames")
cap = cv2.VideoCapture(str(src))
fps = cap.get(cv2.CAP_PROP_FPS) or 30
count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)

# Force a frame every 8s for the whole video (covers skipped home-tour).
step = int(fps * 8)
n = 0
for idx in range(0, count, step):
    cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
    ok, frame = cap.read()
    if not ok:
        continue
    sec = int(idx / fps)
    n += 1
    name = out / f"t_{sec:05d}s.jpg"
    vis = cv2.resize(frame, (1280, int(frame.shape[0] * 1280 / frame.shape[1])))
    cv2.imwrite(str(name), vis, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
    print(name.name)

cap.release()
print("forced", n)
