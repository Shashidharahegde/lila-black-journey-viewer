"""A05: which date rule reproduces the folder? Are identical same-second Loot rows separate pickups or logging repeats?"""
import sys, numpy as np, pandas as pd
df = pd.read_parquet(sys.argv[1]); df["t"] = df.ts.astype("int64")
F = pd.read_parquet(sys.argv[2])
M = F.groupby("match").agg(mt0=("t0","min"), mt1=("t1","max"))
F = F.join(M, on="match")
day = lambda s: pd.to_datetime(s, unit="s").dt.day
for c in ["t0","t1","mt0","mt1"]:
    print("folder == UTC day of", c, ":", (day(F[c])==F.fday).sum(), "/", len(F))
bad = F[day(F.mt1)!=F.fday]; print("mismatch on match end:", bad[["folder","t0","t1","mt0","mt1"]].assign(
    t1h=lambda d: pd.to_datetime(d.t1,unit="s").dt.strftime("%d %H:%M:%S"), mt1h=lambda d: pd.to_datetime(d.mt1,unit="s").dt.strftime("%d %H:%M:%S"))[["folder","t1h","mt1h"]].to_string())
print("== the match that spans folders")
m2 = F.groupby("match").folder.nunique(); mm = m2[m2>1].index
print(F[F.match.isin(mm)][["folder","idform","n"]].assign(t0=lambda d: pd.to_datetime(F.loc[d.index,"t0"],unit="s"), t1=lambda d: pd.to_datetime(F.loc[d.index,"t1"],unit="s")).to_string())
print("== Loot structure")
L = df[df.event=="Loot"].copy()
fk=["folder","fname"]
grp = L.groupby(fk+["t"])
sz = grp.size(); print("loot rows:", len(L), " distinct (file,second):", len(sz), " size dist:", sz.value_counts().sort_index().to_dict())
npos = grp.apply(lambda g: g[["x","y","z"]].drop_duplicates().shape[0])
multi = sz[sz>1].index
print("same-second multi-loot groups:", len(multi), " of which with >1 distinct position:", (npos.loc[multi]>1).sum())
# Do loot rows at consecutive seconds (dt 1..3) exist with slightly moved positions? (evidence of real repeated pickups)
L = L.sort_values(fk+["row_in_file"])
L["dt"] = L.groupby(fk).t.diff(); L["dd"] = np.hypot(L.groupby(fk).x.diff(), L.groupby(fk).z.diff())
print("loot-to-loot dt distribution:", L.dt.value_counts().sort_index().head(12).to_dict())
print("distance moved between loot rows 1-3 s apart: quantiles", L[(L.dt>=1)&(L.dt<=3)].dd.quantile([.1,.5,.9]).round(3).to_dict())
print("distance between loot rows same second: ", L[L.dt==0].dd.describe().round(4).to_dict())
# Position rows at the same second as a Loot row: does loot x/z equal the position x/z?
P = df[df.event.isin(["Position"])][fk+["t","x","z"]]
j = L.merge(P, on=fk+["t"], suffixes=("","_p"))
print("loot rows with a Position at the same second:", len(j), " identical xz:", ((j.x==j.x_p)&(j.z==j.z_p)).sum(), " median dist:", np.hypot(j.x-j.x_p, j.z-j.z_p).median())
# row order: is Loot interleaved in time order with Position?
print("== row order vs ts inside files (excluding the 3 doubled files)")
srt = df.sort_values(fk+["row_in_file"])
ok = srt.groupby(fk).t.apply(lambda s: (np.diff(s.values)>=0).all())
print("monotone files:", ok.sum())
# same-second events of different types order
