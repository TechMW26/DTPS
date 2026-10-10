#!/usr/bin/env python3
"""Estimate Mongo BSON and per-group gzip sizes from an offline Firestore backup.

Streams existing backup records only. Does not access a provider or emit field values.
BSON estimates assume int64, BSON dates, and string IDs; envelope/index costs are extra.
"""
import argparse
import collections
import gzip
import json
import time
import zlib


def document_size(fields):
    return 5 + sum(2 + len(key.encode()) + value_size(value) for key, value in fields.items())


def value_size(value):
    if "stringValue" in value:
        return 5 + len(value["stringValue"].encode())
    if any(key in value for key in ("integerValue", "doubleValue", "timestampValue")):
        return 8
    if "booleanValue" in value:
        return 1
    if "nullValue" in value:
        return 0
    if "mapValue" in value:
        return document_size(value["mapValue"].get("fields", {}))
    if "arrayValue" in value:
        return 5 + sum(2 + len(str(index)) + value_size(item)
                       for index, item in enumerate(value["arrayValue"].get("values", [])))
    if "bytesValue" in value:
        return 5 + len(value["bytesValue"]) * 3 // 4
    if "referenceValue" in value:
        return 5 + len(value["referenceValue"].encode())
    if "geoPointValue" in value:
        return 43
    raise ValueError("Unsupported Firestore typed value")


def audit(path):
    groups = collections.defaultdict(lambda: {"documents": 0, "rawBytes": 0,
        "gzipBytes": 0, "estimatedBsonBytes": 0, "largestBsonBytes": 0})
    compressors = {}
    started = time.time()
    with gzip.open(path, "rb") as source:
        for line in source:
            row = json.loads(line)
            parts = row["name"].split("/documents/", 1)[-1].split("/")
            group = parts[-2]
            fields = row.get("fields", {})
            bson = document_size(fields) + (0 if "_id" in fields else 10 + len(parts[-1]))
            current = groups[group]
            current["documents"] += 1
            current["rawBytes"] += len(line)
            current["estimatedBsonBytes"] += bson
            current["largestBsonBytes"] = max(current["largestBsonBytes"], bson)
            if group not in compressors:
                compressors[group] = zlib.compressobj(6, zlib.DEFLATED, 31)
            current["gzipBytes"] += len(compressors[group].compress(line))
    for group, compressor in compressors.items():
        groups[group]["gzipBytes"] += len(compressor.flush())
    return {"source": "offline Firestore REST typed JSONL gzip", "seconds": time.time() - started,
        "limitations": "Estimates exclude storage envelope, Mongo indexes, live changes and external Blob bytes.",
        "groups": dict(sorted(groups.items(), key=lambda item: -item[1]["estimatedBsonBytes"]))}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("backup")
    args = parser.parse_args()
    print(json.dumps(audit(args.backup), indent=2))
