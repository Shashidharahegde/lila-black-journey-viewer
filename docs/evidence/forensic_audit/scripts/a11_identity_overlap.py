"""A11: can one ID be in two places at once? spatial outliers; very short files; the 2-human match."""
import sys, numpy as np, pandas as pd
df = pd.read_parquet(sys.argv[1]); df["t"] = df.ts.astype("int64")
F = pd.read_parquet(sys.argv[2]).drop_duplicates("sha")
F["kind"] = np.select([F.idform.eq("uuid")&~F.hasBP, F.idform.eq("numeric")&F.hasBP], ["U+P","N+BP"], "N+P")
ov = []
for u, g in F.groupby("user"):
    g = g.sort_values("t0").reset_index(drop=True)
    for i in range(len(g)):
        for j in range(i+1, len(g)):
            if g.t0[j] < g.t1[i]: ov.append((g.kind[i], g.kind[j], g["map"][i]==g["map"][j], min(g.t1[i],g.t1[j])-g.t0[j]))
O = pd.DataFrame(ov, columns=["k1","k2","same_map","overlap_s"])
print("ID pairs of files overlapping in time:", len(O)); print(O.groupby(["k1","k2","same_map"]).overlap_s.describe().round(0).to_string() if len(O) else "")
print("distinct numeric IDs:", F[F.idform=="numeric"].user.nunique(), " numeric ID files per ID:", F[F.idform=="numeric"].groupby("user").size().describe().round(1).to_dict())
print("numeric ID string lengths:", F[F.idform=="numeric"].user.str.len().value_counts().to_dict(), " range:", F[F.idform=="numeric"].user.astype(int).agg(["min","max"]).to_dict())
print("== spatial outliers: rows > 4 robust SD from map median in x or z")
for m, s in df.groupby("map_id"):
    med = s[["x","z"]].median(); mad = (s[["x","z"]]-med).abs().median()*1.4826
    o = ((s[["x","z"]]-med).abs() > 4*mad).any(axis=1); print(m, "outlier rows:", int(o.sum()), " x/z p0.1/p99.9:", s.x.quantile([.001,.999]).round(0).tolist(), s.z.quantile([.001,.999]).round(0).tolist())
print("== shortest files")
print(F.sort_values("n").head(8)[["kind","map","n"]].assign(span=F.t1-F.t0).to_string())
print("files with < 5 movement rows:", (df[df.event.isin(["Position","BotPosition"])].groupby(["folder","fname"]).size()<5).sum())
two = F[F.kind=="U+P"].groupby("match").size(); m2 = two[two>1].index
print("== match with 2 UUID files:", F[F.match.isin(m2)][["kind","map","n"]].assign(t0r=F.t0-F[F.match.isin(m2)].t0.min(), span=F.t1-F.t0).to_string())
