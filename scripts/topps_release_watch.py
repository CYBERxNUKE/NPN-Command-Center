#!/usr/bin/env python3
from pathlib import Path
from datetime import datetime, timedelta, timezone
import json, re, requests
from bs4 import BeautifulSoup

ROOT=Path(__file__).resolve().parents[1]
URL="https://www.topps.com/release-calendar"
WATCHLIST=ROOT/"data/watchlist.json"
MONTHS="Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec"
DATE_RE=re.compile(r"\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)?[,]?\s*(?:"+MONTHS+r")\s+\d{1,2}(?:[,]?\s+\d{4})?",re.I)
YEAR_RE=re.compile(r"\b(?:19|20)\d{2}\b")

def clean(value):
    return re.sub(r"\s+"," "," ".join(str(value or "").split())).strip()

def parse_date(value, year):
    match=DATE_RE.search(value)
    if not match:
        return None
    raw=clean(match.group(0)).replace(",","")
    if not YEAR_RE.search(raw):
        raw=raw+" "+str(year)
    for fmt in ("%B %d %Y","%b %d %Y"):
        try:
            return datetime.strptime(raw,fmt).date()
        except ValueError:
            pass
    return None

def product_name(anchor_text):
    value=clean(anchor_text)
    value=re.sub(r"\b(?:Pre-order|Notify me)\b","",value,flags=re.I)
    value=DATE_RE.sub("",value)
    value=re.sub(r"\b(?:19|20)\d{2}\b\s*(?:at\s+\d{1,2}:\d{2}\s*(?:AM|PM)\s*UTC)?","",value,flags=re.I)
    value=re.sub(r"^Image:\s*","",value,flags=re.I)
    value=clean(value)
    if len(value)<8 or not re.search(r"\b(?:Topps|Bowman)\b",value,re.I):
        return None
    return value

def parse_releases(html, year):
    soup=BeautifulSoup(html,"html.parser")
    releases=[]
    seen=set()
    for anchor in soup.find_all("a",href=True):
        text=clean(anchor.get_text(" ",strip=True))
        parent=anchor.find_parent(["article","li"])
        block=clean(parent.get_text(" ",strip=True) if parent else text)
        name=product_name(text)
        release_date=parse_date(block,year)
        if not name or not release_date:
            continue
        key=(name.casefold(),release_date.isoformat())
        if key in seen:
            continue
        seen.add(key)
        releases.append({
            "id":"topps-"+re.sub(r"[^a-z0-9]+","-",name.lower()).strip("-")+"-"+release_date.isoformat(),
            "manufacturer":"Topps",
            "product":name,
            "releaseDate":release_date.isoformat(),
            "tentativeDeadline":(release_date+timedelta(days=45)).isoformat(),
            "status":"VERIFY_NPN",
            "source":URL
        })
    return releases

now=datetime.now(timezone.utc)
response=requests.get(URL,headers={"User-Agent":"Mozilla/5.0 NPNCommandCenter"},timeout=25)
response.raise_for_status()
releases=parse_releases(response.text,now.year)
if not releases:
    raise RuntimeError("Topps release calendar returned no parseable products; existing watchlist was not changed")

data=json.loads(WATCHLIST.read_text())
existing=data.get("items",[])
manual=[item for item in existing if item.get("source")!=URL]
old_calendar={item.get("product","").casefold():item for item in existing if item.get("source")==URL}
synced=[]
added=0
updated=0
for release in releases:
    previous=old_calendar.get(release["product"].casefold())
    if previous:
        release["status"]=previous.get("status",release["status"])
        release["id"]=previous.get("id",release["id"])
        updated+=1
    else:
        added+=1
    synced.append(release)

removed=len(old_calendar)-sum(1 for release in releases if release["product"].casefold() in old_calendar)
data["items"]=manual+synced
data["generated"]=now.date().isoformat()
data["lastCalendarCheck"]=now.isoformat()
data["calendarSource"]=URL
data["syncSummary"]={"added":added,"updated":updated,"removed":removed,"calendarProducts":len(releases)}
WATCHLIST.write_text(json.dumps(data,indent=2)+"\n")
print(json.dumps({"calendarProducts":len(releases),"added":added,"updated":updated,"removed":removed},indent=2))
