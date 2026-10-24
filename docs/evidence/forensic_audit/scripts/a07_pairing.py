"""A07: per-file speed ceilings; cross-file pairing of combat events inside a match (time and place)."""
import sys, numpy as np, pandas as pd
df = pd.read_parquet(sys.argv[1]); df["t"] = df.ts.astype("int64")
F = pd.read_parquet(sys.argv[2]).drop_duplicates("sha")
F["kind"] = np.select([F.idform.eq("uuid")&~F.hasBP, F.idform.eq("numeric")&F.hasBP], ["U+P","N+BP"], "N+P")
df = df.merge(F[["folder","fname","kind"]], on=["folder","fname"])  # drops the duplicate copy
fk = ["folder","fname"]
mv = df[df.event.isin(["Position","BotPosition"])].sort_values(fk+["row_in_file"]).copy()
mv["dt"] = mv.groupby(fk).t.diff(); mv["dd"] = np.hypot(mv.groupby(fk).x.diff(), mv.groupby(fk).z.diff())
q = mv[(mv.dt>0)&(mv.dt<=6)].assign(v=lambda d: d.dd/d.dt)
pf = q.groupby(fk+["kind"]).v.agg(vmax="max", share_over5=lambda s: (s>5.05).mean()).reset_index()
print("per-file max speed by kind:"); print(pf.groupby("kind").vmax.describe().round(2))
print("files with any step > 5.05 u/s:", pf[pf.vmax>5.05].groupby("kind").size().to_dict())
print("== cross-file pairing of combat events")
C = df[df.event.isin(["BotKill","BotKilled","Kill","Killed","KilledByStorm"])][fk+["match_id","kind","event","t","x","z","row_in_file"]]
multi = F.groupby("match").kind.apply(lambda s: s.eq("N+BP").any() and (s!="N+BP").any())
mm = multi[multi].index
res = []
for m in mm:
    c = C[C.match_id==m]
    for i, r in c.iterrows():
        o = c[(c.fname!=r.fname)&((c.t-r.t).abs()<=2)]
        if len(o)==0: res.append((r.kind, r.event, None, None, None)); continue
        o = o.assign(d=np.hypot(o.x-r.x, o.z-r.z)).sort_values(["d"])
        b = o.iloc[0]; res.append((r.kind, r.event, b.kind, b.event, round(b.d,1)))
R = pd.DataFrame(res, columns=["kind","event","okind","oevent","dist"])
print(R.groupby(["kind","event","okind","oevent"], dropna=False).agg(n=("dist","size"), med_dist=("dist","median")).to_string())
# A bot's BotKilled in a match with a human: which human event is simultaneous?
print("== counts of combat events by file kind")
print(pd.crosstab(C.event, C.kind))
print("== deaths per file: (BotKilled+Killed+KilledByStorm) per file by kind")
d = df.groupby(fk+["kind"]).event.apply(lambda s: s.isin(["BotKilled","Killed","KilledByStorm"]).sum()).reset_index()
print(pd.crosstab(d.kind, d.event))
