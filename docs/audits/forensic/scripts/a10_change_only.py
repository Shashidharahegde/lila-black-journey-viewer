"""A10: test H_change (a movement row is written only when the actor moved) vs H_loss (rows lost at random).
Predictions: H_change -> displacement across a gap stays ~ one step regardless of gap length, a floor on step size,
loot/other events concentrate inside gaps. H_loss -> displacement grows ~ linearly with gap length."""
import sys, numpy as np, pandas as pd
df = pd.read_parquet(sys.argv[1]); df["t"] = df.ts.astype("int64")
F = pd.read_parquet(sys.argv[2]).drop_duplicates("sha")
F["kind"] = np.select([F.idform.eq("uuid")&~F.hasBP, F.idform.eq("numeric")&F.hasBP], ["U+P","N+BP"], "N+P")
df = df.merge(F[["folder","fname","kind"]], on=["folder","fname"])
fk = ["folder","fname"]
n = df.groupby(fk).row_in_file.transform("size"); dbl = df.groupby(fk).t.transform(lambda s: (np.diff(s.values)<0).any())
df = df[~dbl | (df.row_in_file < n//2)]
mv = df[df.event.isin(["Position","BotPosition"])].sort_values(fk+["row_in_file"]).copy()
mv["dt"] = mv.groupby(fk).t.diff(); mv["dd"] = np.hypot(mv.groupby(fk).x.diff(), mv.groupby(fk).z.diff())
mv["dy"] = mv.groupby(fk).y.diff().abs()
g = mv.dropna(subset=["dt"])
print("smallest planar steps (any dt):", np.sort(g.dd.values)[:10].round(4))
print("smallest 3D steps:", np.sort(np.sqrt(g.dd**2+g.dy**2).values)[:10].round(4))
print("share of 5 s steps with planar displacement < 0.5 / < 1 / < 2 units:", [round((g[g.dt==5].dd<k).mean(),4) for k in (0.5,1,2)])
for kind in ["U+P","N+BP"]:
    s = g[g.kind==kind]
    print(kind, "median displacement by gap length:", s.groupby(pd.cut(s.dt,[0,5,10,15,20,30,60,120,600]),observed=True).dd.median().round(1).to_dict())
# where do loot rows fall? inside a movement gap of length > 5 s?
ivals = g[["folder","fname","t","dt"]].assign(t_prev=lambda d: d.t-d.dt)
L = df[df.event=="Loot"][fk+["t"]]
j = L.merge(ivals, on=fk, suffixes=("","_end"))
j = j[(j.t>=j.t_prev)&(j.t<=j.t_end)]
j = j.sort_values("dt").drop_duplicates(fk+["t"], keep="first")
share_time_in_long = (ivals.dt.where(ivals.dt>5,0).sum()/ivals.dt.sum())
print("loot rows inside an interval longer than 5 s:", round((j.dt>5).mean(),3), " vs share of time in such intervals:", round(share_time_in_long,3))
print("loot rows inside an interval longer than 30 s:", round((j.dt>30).mean(),3), " vs time share:", round(ivals.dt.where(ivals.dt>30,0).sum()/ivals.dt.sum(),3))
# end-of-file: does the last movement row precede the death or file end by long?
