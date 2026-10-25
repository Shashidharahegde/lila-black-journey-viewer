"""B02: README numeric/semantic claims checked against raw rows."""
import sys, numpy as np, pandas as pd
df = pd.read_parquet(sys.argv[1]); df["t"] = df.ts.astype("int64")
print("Position+BotPosition share of rows:", round(df.event.isin(["Position","BotPosition"]).mean(),4), " Position only:", round((df.event=="Position").mean(),4))
print("unique user_id:", df.user_id.nunique(), " matches:", df.match_id.nunique(), " rows:", len(df), " files:", df.groupby(["folder","fname"]).ngroups)
for f, g in df.groupby("folder"):
    print(f, "UTC hours covered:", pd.to_datetime(g.t, unit="s").dt.floor("h").nunique(), " first/last:", pd.to_datetime(g.t.min(),unit="s"), pd.to_datetime(g.t.max(),unit="s"))
s = df[(df.x.round(2)==-301.45)&(df.z.round(2)==-355.55)]
print("README human sample row present:", len(s), s[["event","map_id"]].to_dict("records"), " ts int:", s.t.tolist(), "-> UTC", pd.to_datetime(s.t, unit="s").tolist())
s = df[(df.x.round(2)==-280.85)&(df.z.round(2)==-323.35)]
print("README bot sample row present:", len(s), s[["event","user_id"]].to_dict("records") if len(s) else "", " ts:", pd.to_datetime(s.t, unit="s").tolist())
print("README example pixel (1024 px):", round((-301.45+370)/900*1024,2), round((1-(-355.55+473)/900)*1024,2))
print("ts as 'elapsed within match' would need match-relative values; earliest ts per match ranges:", pd.to_datetime(df.groupby("match_id").t.min(),unit="s").agg(["min","max"]).tolist())
