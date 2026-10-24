"""A04: folder timezone hypothesis, out-of-order files, repeated content inside files, match composition."""
import sys, numpy as np, pandas as pd
df = pd.read_parquet(sys.argv[1]); df["t"] = df.ts.astype("int64")
df["idform"] = np.where(df.user_id.str.fullmatch(r"\d+"), "numeric", "uuid")
fk = ["folder","fname"]
F = df.groupby(fk).agg(t0=("t","min"), t1=("t","max"), user=("user_id","first"), match=("match_id","first"),
    map=("map_id","first"), idform=("idform","first"), sha=("file_sha","first"), n=("t","size"),
    hasBP=("event", lambda s: (s=="BotPosition").any())).reset_index()
F["fday"] = F.folder.str[-2:].astype(int)
print("== which UTC offsets make folder == local date of the file's first event?")
ok = []
for off_min in range(-12*60, 14*60+1, 15):
    d = pd.to_datetime(F.t0 + off_min*60, unit="s").dt.day
    ok.append((off_min/60, (d==F.fday).mean(), (d==F.fday).sum()))
best = sorted(ok, key=lambda r: -r[1])[:8]; print(best)
for col in ["t0","t1"]:
    for off in [0, 5.5]:
        d = pd.to_datetime(F[col] + off*3600, unit="s").dt.day
        print(col, "offset", off, "matches", (d==F.fday).sum())
print("UTC hour of first event for files whose folder day != UTC day:")
mis = F[pd.to_datetime(F.t0, unit="s").dt.day != F.fday]
print(pd.to_datetime(mis.t0, unit="s").dt.strftime("%m-%d %H:%M").tolist(), mis.folder.tolist())
print("== file count by UTC hour-of-day of first event"); print(pd.to_datetime(F.t0,unit="s").dt.hour.value_counts().sort_index().to_dict())
print("== out-of-order files")
srt = df.sort_values(fk+["row_in_file"])
for (fo, fn), s in srt.groupby(fk):
    t = s.t.values
    if (np.diff(t)<0).any():
        n = len(s); h = n//2
        cols = ["user_id","match_id","map_id","x","y","z","t","event"]
        a = s.iloc[:h][cols].reset_index(drop=True); b = s.iloc[h:2*h][cols].reset_index(drop=True)
        brk = int(np.argmax(np.diff(t)<0))+1
        print(fo, "rows", n, "even?", n%2==0, "first break at row", brk, "second half == first half:", n%2==0 and a.equals(b), "idform", s.idform.iat[0])
print("== repeated blocks: files where some contiguous suffix equals a prefix (any length >= 5)")
cnt=0
for (fo, fn), s in srt.groupby(fk):
    v = list(zip(s.x, s.z, s.t, s.event)); n=len(v)
    for L in range(n//2, 4, -1):
        if v[:L]==v[n-L:] and n-L>=L: cnt+=1; print(fo, n, L); break
print("files with repeated prefix-suffix:", cnt)
print("== exact duplicate rows inside a file (all 8 source columns)")
cols = ["user_id","match_id","map_id","x","y","z","ts","event"]
dd = df[df.duplicated(fk+cols, keep=False)]
print("rows in duplicate groups:", len(dd), " files:", dd.groupby(fk).ngroups)
print(dd.groupby(fk).size().value_counts().to_dict())
print("events of dup rows:", dd.event.value_counts().to_dict())
F.to_parquet(sys.argv[2], index=False)
