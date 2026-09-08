#!/usr/bin/env python3
from pathlib import Path
from datetime import date, datetime, timezone
import copy, json, re

ROOT=Path(__file__).resolve().parents[1]
ACTIVE=ROOT/"data/opportunities.json"
ARCHIVE=ROOT/"data/expired-npn.json"
TODAY=date.today()
DATE_RE=re.compile(r"^\d{4}-\d{2}-\d{2}$")

active_data=json.loads(ACTIVE.read_text())
archive_data=json.loads(ARCHIVE.read_text()) if ARCHIVE.exists() else {"items":[]}
archived_ids={item.get("id") for item in archive_data.get("items",[])}
remaining=[]
expired=[]

for item in active_data.get("items",[]):
    deadline=item.get("postmarkDeadline","")
    if not DATE_RE.match(deadline):
        remaining.append(item)
        continue
    if date.fromisoformat(deadline)>=TODAY:
        remaining.append(item)
        continue
    if item.get("id") not in archived_ids:
        record=copy.deepcopy(item)
        record["archivedAt"]=datetime.now(timezone.utc).isoformat()
        record["expirationReason"]="Postmark deadline passed"
        record["expiredDate"]=deadline
        expired.append(record)

if expired:
    archive_data["items"] = archive_data.get("items",[])+expired
    archive_data["generated"] = TODAY.isoformat()
    archive_data["lastArchiveRun"] = datetime.now(timezone.utc).isoformat()
    ARCHIVE.write_text(json.dumps(archive_data,indent=2)+"\n")

if len(remaining)!=len(active_data.get("items",[])):
    active_data["items"]=remaining
    active_data["generated"]=TODAY.isoformat()
    ACTIVE.write_text(json.dumps(active_data,indent=2)+"\n")

print(json.dumps({"checked":len(active_data.get("items",[]))+len(expired),"archived":len(expired),"remaining":len(remaining)},indent=2))
