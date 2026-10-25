"""A06: match composition; the 17 numeric-ID Position files; whether actors recur across matches."""
import sys, numpy as np, pandas as pd
df = pd.read_parquet(sys.argv[1]); df["t"] = df.ts.astype("int64")
F = pd.read_parquet(sys.argv[2]).drop_duplicates("sha")
F["kind"] = np.select([F.idform.eq("uuid")&~F.hasBP, F.idform.eq("numeric")&F.hasBP, F.idform.eq("numeric")&~F.hasBP], ["U+P","N+BP","N+P"], "other")
print(F.kind.value_counts().to_dict())
comp = F.groupby("match").kind.value_counts().unstack(fill_value=0)
print("matches:", len(comp)); print("composition counts (U+P, N+BP, N+P):"); print(comp.value_counts().head(25).to_string())
print("matches with 0 uuid files:", (comp["U+P"]==0).sum(), " with >=2 uuid:", (comp["U+P"]>=2).sum(), " with any bot file:", (comp["N+BP"]>0).sum())
print("== match spans and overlap")
ms = F.groupby("match").agg(t0=("t0","min"), t1=("t1","max"), map=("map","first"))
ms["span"] = ms.t1-ms.t0; print(ms.span.describe().round(0).to_dict())
# do two files in one match overlap in time?
print("== numeric-ID Position files (N+P)")
NP = F[F.kind=="N+P"]
print("files:", len(NP), " distinct users:", NP.user.nunique(), " matches:", NP.match.nunique())
for u, g in NP.groupby("user"):
    other = F[(F.user==u)&(F.kind!="N+P")]
    print(" user#", sorted(NP.user.unique()).index(u), "N+P files:", len(g), " maps:", g["map"].unique().tolist(), " also as N+BP in", len(other), "files; same matches as N+BP?", bool(set(other.match)&set(g.match)))
    # composition of those matches
    print("   co-present kinds per match:", [dict(comp.loc[m]) for m in g.match][:4])
# events in N+P files
e = df[df.fname.isin(NP.fname)].event.value_counts(); print(" events:", e.to_dict())
# compare behaviour: rows per minute, loot rate, kill rate across kinds
df2 = df.merge(F[["folder","fname","kind"]], on=["folder","fname"])
st = df2.groupby(["kind","folder","fname"]).agg(n=("t","size"), span=("t", lambda s: s.max()-s.min()),
    loot=("event", lambda s: (s=="Loot").sum()), bk=("event", lambda s: (s=="BotKill").sum()),
    bkd=("event", lambda s: (s=="BotKilled").sum()))
st["loot_per_min"] = st.loot/(st.span/60)
print(st.groupby("kind")[["n","span","loot_per_min","bk","bkd"]].median())
# movement speed per kind
mv = df2[df2.event.isin(["Position","BotPosition"])].sort_values(["folder","fname","row_in_file"])
mv["dt"] = mv.groupby(["folder","fname"]).t.diff(); mv["dd"] = np.hypot(mv.groupby(["folder","fname"]).x.diff(), mv.groupby(["folder","fname"]).z.diff())
mv = mv[(mv.dt>0)&(mv.dt<=6)]; mv["v"] = mv.dd/mv.dt
print("speed (units/s) quantiles by kind:"); print(mv.groupby("kind").v.quantile([.1,.5,.9,.99]).unstack().round(2))
print("== users with multiple uuid files"); U = F[F.kind=="U+P"].groupby("user").size(); print(U.value_counts().sort_index().to_dict())
print("== do any two files in a match have the same user?", F.groupby(["match","user"]).size().max())
