"""A08: deaths, rows after death, Kill/Killed rows, storm death timing, match clock alignment."""
import sys, numpy as np, pandas as pd
df = pd.read_parquet(sys.argv[1]); df["t"] = df.ts.astype("int64")
F = pd.read_parquet(sys.argv[2]).drop_duplicates("sha")
F["kind"] = np.select([F.idform.eq("uuid")&~F.hasBP, F.idform.eq("numeric")&F.hasBP], ["U+P","N+BP"], "N+P")
df = df.merge(F[["folder","fname","kind"]], on=["folder","fname"])
fk = ["folder","fname"]
# collapse the 3 doubled files to their first half for this analysis
n = df.groupby(fk).row_in_file.transform("size")
dbl = df.groupby(fk).t.transform(lambda s: (np.diff(s.values)<0).any())
df = df[~dbl | (df.row_in_file < n//2)]
DEATH = ["BotKilled","Killed","KilledByStorm"]
df["mstart"] = df.groupby("match_id").t.transform("min")
df["mt"] = df.t - df.mstart
df["fstart"] = df.groupby(fk).t.transform("min")
print("== file start offset from match start (s), multi-file matches")
fs = df.groupby(fk+["match_id","kind"]).agg(fstart=("fstart","first"), mstart=("mstart","first")).reset_index()
mf = fs.groupby("match_id").size(); fs = fs[fs.match_id.isin(mf[mf>1].index)]
fs["off"] = fs.fstart-fs.mstart; print(fs.groupby("kind").off.describe().round(1))
print("== rows after the first death, per file")
rows = []
for (fo, fn), s in df.sort_values(fk+["row_in_file"]).groupby(fk):
    d = s[s.event.isin(DEATH)]
    if d.empty: continue
    td = d.t.min(); ri = d.row_in_file.min()
    after = s[(s.row_in_file > ri)]
    rows.append(dict(kind=s.kind.iat[0], deaths=len(d), dtypes="+".join(d.event), n_after=len(after),
        after_events="+".join(sorted(set(after.event))), max_dt=(after.t.max()-td) if len(after) else None,
        same_sec_before=int(((s.t==td)&(s.row_in_file<ri)).sum())))
R = pd.DataFrame(rows)
print(R.groupby("kind").agg(files=("deaths","size"), with_after=("n_after", lambda s: (s>0).sum()), rows_after=("n_after","sum")))
print("after-death event sets:", R[R.n_after>0].groupby(["kind","after_events"]).size().to_string())
print("max seconds after death:", R[R.n_after>0].max_dt.describe().to_dict())
print("files with 2 deaths:", R[R.deaths>1][["kind","dtypes","n_after"]].to_string())
print("== Kill / Killed rows")
k = df[df.event.isin(["Kill","Killed"])]
print(k[["kind","event","t","x","z","row_in_file"]].assign(file=lambda d: pd.factorize(df.loc[d.index,"fname"])[0], mt=df.loc[k.index,"mt"]).to_string())
print("== KilledByStorm: match time (s) and file-relative time")
st = df[df.event=="KilledByStorm"]
print("match-time:", st.mt.describe().round(0).to_dict()); print("file-time:", (st.t-st.fstart).describe().round(0).to_dict())
print("== all deaths by match-time minute bucket (U+P)")
dd = df[(df.kind=="U+P")&df.event.isin(DEATH)]
print(pd.crosstab(dd.mt//60, dd.event).T.to_string())
print("== file end: last row event, files without death")
last = df.sort_values(fk+["row_in_file"]).groupby(fk).tail(1)
nd = last[~last.fname.isin(df[df.event.isin(DEATH)].fname)]
print("no-death files by kind:", nd.kind.value_counts().to_dict(), " last events:", nd.groupby("kind").event.value_counts().to_dict())
print("file span (s) of no-death U+P files:", (nd[nd.kind=="U+P"].t - nd[nd.kind=="U+P"].fstart).describe().round(0).to_dict())
print("file span (s) of death U+P files:", (last[(last.kind=="U+P")&last.fname.isin(dd.fname)].t - last[(last.kind=="U+P")&last.fname.isin(dd.fname)].fstart).describe().round(0).to_dict())
