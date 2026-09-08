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
old=json.loads(STATE.read_text()) if STATE.exists() else {}
log=json.loads(LOG.read_text()) if LOG.exists() else {"events":[]}
now=datetime.now(timezone.utc).isoformat()
signals=re.compile(r'\b(no purchase necessary|topps access|alternate method of entry|AMOE|mail[- ]in|sweepstakes)\b',re.I)
newstate={}
events=[]
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
        newstate[url]={"checkedAt":now,"status":r.status_code,"sha256":digest,"signals":hits,"changed":changed}
        if changed:
            events.append({"time":now,"type":"SOURCE_CHANGED","source":src["name"],"url":url,"signals":hits})
    except Exception as e:
        newstate[url]={"checkedAt":now,"status":"ERROR","error":str(e)}
        events.append({"time":now,"type":"SOURCE_ERROR","source":src["name"],"url":url,"error":str(e)})

log["events"]=(events+log.get("events",[]))[:500]
LOG.write_text(json.dumps(log,indent=2))
STATE.write_text(json.dumps(newstate,indent=2))
print(json.dumps({"checked":len(SOURCES),"events":len(events)},indent=2))
