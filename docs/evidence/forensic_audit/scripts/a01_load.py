"""A01: load every raw file into one table with provenance. Independent of lila_pipeline.
Usage: python a01_load.py <raw player_data dir> <out parquet>"""
import sys, glob, os, hashlib
import pyarrow.parquet as pq, pandas as pd
RAW, OUT = sys.argv[1], sys.argv[2]
parts = []
for f in sorted(glob.glob(os.path.join(RAW, "February_*", "*"))):
    t = pq.read_table(f).to_pandas()
    raw = open(f, "rb").read()
    t["folder"] = os.path.basename(os.path.dirname(f))
    t["fname"] = os.path.basename(f)
    t["file_sha"] = hashlib.sha256(raw).hexdigest()
    t["row_in_file"] = range(len(t))
    t["nrows_file"] = len(t)
    parts.append(t)
df = pd.concat(parts, ignore_index=True)
df["event_raw"] = df["event"]
df["event"] = df["event"].apply(lambda b: b.decode("utf-8", errors="strict"))
df.to_parquet(OUT, index=False)
print(df.shape); print(df.dtypes)
