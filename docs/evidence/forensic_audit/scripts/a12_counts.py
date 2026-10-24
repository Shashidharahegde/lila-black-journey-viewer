"""A12: independent reference counts under explicitly stated conventions (written before reading any project docs).
Conventions: drop byte-identical duplicate file copy; keep first half of the 3 self-doubled files; classes U+P / N+BP / N+P."""
import sys, json, numpy as np, pandas as pd
df = pd.read_parquet(sys.argv[1]); df["t"] = df.ts.astype("int64")
F = pd.read_parquet(sys.argv[2]).drop_duplicates("sha")
F["kind"] = np.select([F.idform.eq("uuid")&~F.hasBP, F.idform.eq("numeric")&F.hasBP], ["U+P","N+BP"], "N+P")
df = df.merge(F[["folder","fname","kind"]], on=["folder","fname"])
fk = ["folder","fname"]; cols = ["user_id","match_id","map_id","x","y","z","ts","event"]
n = df.groupby(fk).row_in_file.transform("size"); dbl = df.groupby(fk).t.transform(lambda s: (np.diff(s.values)<0).any())
print("rows after dropping duplicate file copy:", len(df), " rows removed by un-doubling:", int((dbl & (df.row_in_file >= n//2)).sum()))
df = df[~dbl | (df.row_in_file < n//2)].copy()
print("rows after un-doubling:", len(df))
fd = df.duplicated(fk+cols)
print("a naive within-file full-row dedupe would further remove:", int(fd.sum()), "rows:", df[fd].event.value_counts().to_dict())
out = {}
out["rows"] = len(df); out["files"] = int(F.shape[0]); out["files_by_kind"] = F.kind.value_counts().to_dict()
out["events_by_kind"] = {k: g.event.value_counts().to_dict() for k, g in df.groupby("kind")}
out["matches"] = int(df.match_id.nunique())
out["matches_by_map"] = df.groupby("map_id").match_id.nunique().to_dict()
out["files_by_map_kind"] = {f"{m}|{k}": int(v) for (m,k), v in F.groupby(["map","kind"]).size().items()}
mstart = df.groupby("match_id").t.min()
d_utc = pd.to_datetime(mstart, unit="s").dt.strftime("%Y-%m-%d")
fold = F.groupby("match").folder.min()
out["matches_by_utc_start_date"] = d_utc.value_counts().sort_index().to_dict()
out["matches_by_min_folder"] = fold.value_counts().sort_index().to_dict()
out["uuid_users"] = int(F[F.kind=="U+P"].user.nunique())
# post-death rows: displacement from the death location
DEATH = ["BotKilled","Killed","KilledByStorm"]
s = df.sort_values(fk+["row_in_file"])
dr = s[s.event.isin(DEATH)].groupby(fk).agg(td=("t","first"), rd=("row_in_file","first"), xd=("x","first"), zd=("z","first")).reset_index()
a = s.merge(dr, on=fk); a = a[a.row_in_file > a.rd]
a["disp"] = np.hypot(a.x-a.xd, a.z-a.zd)
print("post-death rows:", len(a), a.event.value_counts().to_dict(), " displacement from death point quantiles:", a.disp.quantile([.5,.9,1]).round(2).to_dict(), " dt:", (a.t-a.td).value_counts().sort_index().to_dict())
# human deaths & kills per map (U+P only)
U = df[df.kind=="U+P"]
out["human_events_by_map"] = {m: g.event.value_counts().to_dict() for m, g in U.groupby("map_id")}
json.dump(out, open(sys.argv[3], "w"), indent=1, default=int); print(json.dumps(out, indent=1, default=int))
