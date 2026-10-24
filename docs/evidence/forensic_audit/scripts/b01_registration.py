"""B01: independent test of the README world->minimap transform by registration against image content.
Score = share of movement samples whose mapped pixel is map content (blurred luma > T). Scans shifts, scale and flips.
Usage: python b01_registration.py raw_all.parquet minimap_dir out_dir"""
import sys, os, numpy as np, pandas as pd
from PIL import Image, ImageFilter, ImageDraw
Image.MAX_IMAGE_PIXELS = None
df = pd.read_parquet(sys.argv[1]); MD = sys.argv[2]; OUT = sys.argv[3]
README = {"AmbroseValley": (900, -370, -473, "AmbroseValley_Minimap.png"),
          "GrandRift": (581, -290, -290, "GrandRift_Minimap.png"),
          "Lockdown": (1000, -500, -500, "Lockdown_Minimap.jpg")}
N = 1024; T = int(os.environ.get("T", 30))
res = []
for m, (sc, ox, oz, fn) in README.items():
    im = Image.open(os.path.join(MD, fn)).convert("L")
    W, H = im.size
    mask = np.asarray(im.resize((N, N), Image.BILINEAR).filter(ImageFilter.GaussianBlur(2))) > T
    p = df[(df.map_id==m) & df.event.isin(["Position","BotPosition"])]
    x = p.x.values.astype(float); z = p.z.values.astype(float)
    def score(sc_, ox_, oz_, fx=False, fz=True):
        u = (x-ox_)/sc_; v = (z-oz_)/sc_
        if fx: u = 1-u
        py = (1-v) if fz else v
        i = np.floor(py*N).astype(int); j = np.floor(u*N).astype(int)
        inside = (i>=0)&(i<N)&(j>=0)&(j<N)
        on = np.zeros(len(x), bool); on[inside] = mask[i[inside], j[inside]]
        return inside.mean(), on.mean()
    base_in, base_on = score(sc, ox, oz)
    flips = {f"fx={fx},fz={fz}": score(sc, ox, oz, fx, fz)[1] for fx in (False, True) for fz in (True, False)}
    best = (base_on, 0, 0, 1.0)
    for ds in np.linspace(0.9, 1.1, 21):
        for dx in range(-30, 31, 3):
            for dz in range(-30, 31, 3):
                s_ = score(sc*ds, ox+dx - (ds-1)*sc/2, oz+dz - (ds-1)*sc/2)[1]  # scale about the centre
                if s_ > best[0] + 1e-9: best = (s_, dx, dz, round(ds, 3))
    print(f"{m}: image {W}x{H}; README params: inside={base_in:.4f} on-content={base_on:.4f}; flips={ {k: round(v,4) for k,v in flips.items()} }; best of scan={best[0]:.4f} at dx={best[1]} dz={best[2]} scale x{best[3]}")
    res.append((m, base_in, base_on, best))
    # overlay for visual review (reduced to 2048 px)
    R = 2048; ov = Image.open(os.path.join(MD, fn)).convert("RGB").resize((R, int(R*H/W)))
    d = ImageDraw.Draw(ov)
    u = (x-ox)/sc; v = (z-oz)/sc
    for a, b in zip(u*R, (1-v)*ov.size[1]): d.point((a, b), fill=(255, 40, 200))
    ov.save(os.path.join(OUT, f"overlay_{m}.png"))
