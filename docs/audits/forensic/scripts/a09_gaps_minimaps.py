"""A09: sampling gaps, implied speed across gaps, stationarity, and minimap image facts."""
import sys, glob, os, numpy as np, pandas as pd
from PIL import Image
df = pd.read_parquet(sys.argv[1]); df["t"] = df.ts.astype("int64")
F = pd.read_parquet(sys.argv[2]).drop_duplicates("sha")
F["kind"] = np.select([F.idform.eq("uuid")&~F.hasBP, F.idform.eq("numeric")&F.hasBP], ["U+P","N+BP"], "N+P")
df = df.merge(F[["folder","fname","kind"]], on=["folder","fname"])
fk = ["folder","fname"]
n = df.groupby(fk).row_in_file.transform("size"); dbl = df.groupby(fk).t.transform(lambda s: (np.diff(s.values)<0).any())
df = df[~dbl | (df.row_in_file < n//2)]
mv = df[df.event.isin(["Position","BotPosition"])].sort_values(fk+["row_in_file"]).copy()
mv["dt"] = mv.groupby(fk).t.diff(); mv["dd"] = np.hypot(mv.groupby(fk).x.diff(), mv.groupby(fk).z.diff()); mv["v"] = mv.dd/mv.dt
g = mv.dropna(subset=["dt"])
print("movement intervals:", len(g))
bins = [0,6,11,16,30,60,120,600]
g["bin"] = pd.cut(g.dt, bins)
print(g.groupby(["kind","bin"], observed=True).agg(n=("v","size"), v_med=("v","median"), v_p99=("v", lambda s: s.quantile(.99)), v_max=("v","max")).round(2).to_string())
print("intervals > 30 s:", (g.dt>30).sum(), " files with one:", g[g.dt>30].groupby(fk).ngroups, " share of movement time in >30s gaps:", round(g[g.dt>30].dt.sum()/g.dt.sum(),4))
print("intervals with implied speed > 13 u/s (above any observed 5 s step):", (g.v>13).sum(), g[g.v>13][["kind","dt","dd"]].round(1).to_string())
print("== cadence phase: t mod 5 by kind (share)"); print(pd.crosstab(mv.kind, mv.t%5, normalize="index").round(3))
print("== zero-movement steps (identical x,z) share by kind:", g.assign(z=g.dd==0).groupby("kind").z.mean().round(3).to_dict())
print("== longest stationary runs (s) for U+P files: quantiles")
def run(s):
    best=cur=0
    for dd, dt in zip(s.dd.values, s.dt.values):
        cur = cur+dt if dd<0.01 else 0; best=max(best,cur)
    return best
r = g[g.kind=="U+P"].groupby(fk).apply(run); print(r.quantile([.5,.9,.99,1]).to_dict())
print("== minimaps")
for p in sorted(glob.glob(os.path.join(sys.argv[3], "*"))):
    im = Image.open(p); print(os.path.basename(p), im.size, im.mode, os.path.getsize(p))
