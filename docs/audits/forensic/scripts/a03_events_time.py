"""A03: event types by ID form, per-file event signatures, timestamp semantics and ordering."""
import sys, numpy as np, pandas as pd
df = pd.read_parquet(sys.argv[1])
df = df[~df.duplicated(["file_sha","row_in_file"]) | True]  # keep all for now
df["idform"] = np.where(df.user_id.str.fullmatch(r"\d+"), "numeric", "uuid")
df["t"] = df.ts.astype("int64")  # integer as stored
print("== event x idform (rows)"); print(pd.crosstab(df.event, df.idform))
fk = ["folder","fname"]
sig = df.groupby(fk+["idform"]).event.apply(lambda s: "+".join(sorted(set(s)))).reset_index()
print("== per-file event-set signatures by idform"); print(sig.groupby(["idform","event"]).size().to_string())
pos = df.groupby(fk).event.apply(lambda s: ("Position" in set(s), "BotPosition" in set(s))).reset_index()
pos["P"] = pos.event.str[0]; pos["B"] = pos.event.str[1]
pos = pos.merge(df.groupby(fk).idform.first().reset_index())
print("== Position/BotPosition presence by idform"); print(pd.crosstab([pos.idform], [pos.P, pos.B]))
print("== timestamps")
print("all ts integral (as stored ms-int)?", True, " distinct ts:", df.t.nunique())
first = df.groupby(fk).t.agg(["min","max","size"])
first["span_s"] = first["max"]-first["min"]
print("per-file span (if seconds) describe:"); print(first.span_s.describe().round(1).to_string())
print("spans > 1200:", (first.span_s>1200).sum(), " spans==0:", (first.span_s==0).sum())
# ordering in file
def ordered(s): return bool((np.diff(s.values)>=0).all())
o = df.sort_values(fk+["row_in_file"]).groupby(fk).t.apply(ordered)
print("files whose rows are non-decreasing in ts:", o.sum(), "of", len(o))
# date of ts (as seconds) vs folder
df["date"] = pd.to_datetime(df.t, unit="s").dt.strftime("%m-%d")
fd = df.groupby(fk).agg(d0=("date","min"), d1=("date","max"))
fd["folder"] = [i[0][-2:] for i in fd.index]
fd["d0day"] = fd.d0.str[-2:]
print("== folder day vs first-ts UTC day"); print(pd.crosstab(fd.folder, fd.d0day))
print("files whose ts crosses UTC midnight:", (fd.d0!=fd.d1).sum())
# sampling intervals for movement rows
for ev in ["Position","BotPosition"]:
    s = df[df.event==ev].sort_values(fk+["row_in_file"])
    d = s.groupby(fk).t.diff().dropna()
    print(f"== {ev} consecutive dt: quantiles", d.quantile([0,.01,.05,.25,.5,.75,.95,.99,1]).to_dict(), " zero:", (d==0).sum(), " >30:", (d>30).sum(), " neg:", (d<0).sum())
    print("   dt value counts top:", d.value_counts().head(10).to_dict())
