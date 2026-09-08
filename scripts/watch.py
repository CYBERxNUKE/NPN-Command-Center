#!/usr/bin/env python3
"""
NPN Command Center watcher.
- Fetches official pages.
- Detects rule-signal changes.
- Updates last-checked metadata / discovery log.
- Does NOT submit entries.
This is intentionally conservative: a page match becomes a lead, not VERIFIED eligibility.
"""
from pathlib import Path
from datetime import datetime, timezone
import hashlib, json, re, requests
from bs4 import BeautifulSoup

ROOT=Path(__file__).resolve().parents[1]
SOURCES=json.loads((ROOT/"data/sources.json").read_text())["items"]
LOG=ROOT/"data/discovery-log.json"
STATE=ROOT/"data/source-state.json"
STATUS=ROOT/"data/engine-status.json"
old=json.loads(STATE.read_text()) if STATE.exists() else {}
log=json.loads(LOG.read_text()) if LOG.exists() else {"events":[]}
started=datetime.now(timezone.utc)
now=started.isoformat()
signals=re.compile(r'\b(no purchase necessary|topps access|alternate method of entry|AMOE|mail[- ]in|sweepstakes)\b',re.I)
newstate={}
events=[]
results=[]
headers={"User-Agent":"NPNCommandCenter/1.0 (+personal research; polite daily monitor)"}

for src in SOURCES:
    url=src["url"]
    try:
        r=requests.get(url,headers=headers,timeout=25)
        r.raise_for_status()
        soup=BeautifulSoup(r.text,"html.parser")
        text=" ".join(soup.stripped_strings)
        hits=sorted({m.group(0).lower() for m in signals.finditer(text)})
        digest=hashlib.sha256(text[:250000].encode("utf-8","ignore")).hexdigest()
        previous=old.get(url,{})
        changed=bool(previous and previous.get("sha256")!=digest)
        result={"name":src["name"],"url":url,"checkedAt":now,"status":r.status_code,"signals":hits,"changed":changed}
        newstate[url]={**result,"sha256":digest}
        results.append(result)
        if changed:
            events.append({"time":now,"type":"SOURCE_CHANGED","source":src["name"],"url":url,"signals":hits})
    except Exception as e:
        result={"name":src["name"],"url":url,"checkedAt":now,"status":"ERROR","error":str(e)}
        newstate[url]=result
        results.append(result)
        events.append({"time":now,"type":"SOURCE_ERROR","source":src["name"],"url":url,"error":str(e)})

log["events"]=(events+log.get("events",[]))[:500]
LOG.write_text(json.dumps(log,indent=2))
STATE.write_text(json.dumps(newstate,indent=2))
STATUS.write_text(json.dumps({
    "startedAt":now,
    "completedAt":datetime.now(timezone.utc).isoformat(),
    "sourceCount":len(SOURCES),
    "checkedCount":sum(1 for x in results if x["status"] != "ERROR"),
    "errorCount":sum(1 for x in results if x["status"] == "ERROR"),
    "results":results
},indent=2))
print(json.dumps({"sourceCount":len(SOURCES),"checked":len(results),"errors":sum(1 for x in results if x["status"] == "ERROR"),"events":len(events)},indent=2))
