"""A00: format-level inspection of every raw file (schema, row counts, metadata). No semantics."""
import sys, glob, os, collections, hashlib, json
import pyarrow.parquet as pq
RAW = sys.argv[1]
files = sorted(glob.glob(os.path.join(RAW, "February_*", "*")))
schemas = collections.Counter(); rows = []; meta_keys = collections.Counter(); bad = []
for f in files:
    try:
        pf = pq.ParquetFile(f)
    except Exception as e:
        bad.append((f, repr(e))); continue
    schemas[str(pf.schema_arrow)] += 1
    md = pf.metadata
    for k in (pf.schema_arrow.metadata or {}): meta_keys[k] += 1
    rows.append(md.num_rows)
print("files", len(files), "unreadable", len(bad))
for s, n in schemas.items(): print("--- schema x", n); print(s)
print("meta keys", meta_keys)
import statistics
print("rows total", sum(rows), "min", min(rows), "median", statistics.median(rows), "max", max(rows))
pf = pq.ParquetFile(files[0]); print(pf.metadata); print(pf.metadata.row_group(0))
