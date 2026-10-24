"""C04: targeted checks of specific documented claims (EC-20, EC-14, EC-12, storm timing, EC-13)."""
import sys, numpy as np, pandas as pd
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
RAW, FILES, MD = sys.argv[1:4]
a = np.asarray(Image.open(f"{MD}/AmbroseValley_Minimap.png"))[..., 3]
print("EC-20 AmbroseValley pixels with alpha<255:", int((a < 255).sum()), "min alpha:", int(a.min()))
df = pd.read_parquet(RAW); df["t"] = df.ts.astype("int64")
F = pd.read_parquet(FILES).drop_duplicates("sha"); df = df.merge(F[["folder", "fname", "idform", "hasBP"]], on=["folder", "fname"])
df["kind"] = np.select([df.idform.eq("uuid") & ~df.hasBP, df.idform.eq("numeric") & df.hasBP], ["human", "bot"], "unknown")
n = df.groupby("fname").row_in_file.transform("size"); dbl = df.groupby("fname").t.transform(lambda s: (np.diff(s.values) < 0).any())
DEATH = ["BotKilled", "Killed", "KilledByStorm"]
for label, d in (("raw (before un-doubling)", df), ("cleaned", df[~dbl | (df.row_in_file < n // 2)])):
    d = d.sort_values(["fname", "t", "row_in_file"])
    fd = d[d.event.isin(DEATH)].groupby("fname").t.min()
    late = d[d.t > d.fname.map(fd)]
    print(f"EC-14 {label}: journeys with rows 1+ s after first death by kind:", late.groupby("kind").fname.nunique().to_dict(), " rows:", late.groupby("kind").size().to_dict())
c = df[~dbl | (df.row_in_file < n // 2)]
kk = c[c.event.isin(["Kill", "Killed"])]
for f, g in kk.groupby("fname"):
    j = c[c.fname == f]; m = j.match_id.iat[0]
    print("EC-12 pair: seconds from pair to journey end:", int(j.t.max() - g.t.max()), " other files in match:", int(c[c.match_id == m].fname.nunique() - 1))
h = c[c.kind == "human"]
bk = h[h.event == "BotKilled"][["fname", "t"]].drop_duplicates(); bkk = h[h.event == "BotKill"][["fname", "t"]].drop_duplicates()
print("EC-12 comparison: human BotKilled seconds:", len(bk), " with a BotKill in the same second:", len(bk.merge(bkk)))
st = c[c.event == "KilledByStorm"]; ms = c.groupby("match_id").t.min()
mt = st.t - st.match_id.map(ms)
print("storm deaths:", len(st), " match time min/max (s):", int(mt.min()), int(mt.max()), " before 660 s (11 min):", int((mt < 660).sum()))
alive = h.groupby("fname").filter(lambda g: not g.event.isin(DEATH).any()).groupby("fname").t.agg(lambda s: s.max() - s.min())
print("EC-13 human journeys without death:", len(alive), " shortest span:", int(alive.min()))
u = c[c.kind == "unknown"].groupby("fname").filter(lambda g: not g.event.isin(DEATH).any()).groupby("fname").t.agg(lambda s: s.max() - s.min())
print("   unknown journeys without death:", len(u), " shortest:", int(u.min()), " -> human+unknown:", len(alive) + len(u))
