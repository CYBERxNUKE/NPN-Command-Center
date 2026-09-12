#!/usr/bin/env python3
from pathlib import Path
from datetime import datetime, timedelta, timezone
import json, re, requests
from bs4 import BeautifulSoup

ROOT=Path(__file__).resolve().parents[1]
SOURCES=ROOT/"data/sources.json"
WATCHLIST=ROOT/"data/watchlist.json"
MONTHS="Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec"
DATE_RE=re.compile(r"\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)?[,]?\s*(?:"+MONTHS+r")\s+\d{1,2}(?:[,]?\s+\d{4})?",re.I)
YEAR_RE=re.compile(r"\b(?:19|20)\d{2}\b")
REQUEST_HEADERS={
    "Accept":"text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language":"en-US,en;q=0.8",
    "User-Agent":"NPNCommandCenter/1.0 (+personal research; polite daily monitor)",
}

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
    if len(value)<8 or value.lower() in {"release calendar","available now","dropping soon"}:
        return None
    return value

def parse_releases(html, year, manufacturer):
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
        key=(manufacturer.casefold(),name.casefold(),release_date.isoformat())
        if key in seen:
            continue
        seen.add(key)
        slug=re.sub(r"[^a-z0-9]+","-",(manufacturer+"-"+name).lower()).strip("-")
        releases.append({
            "id":slug+"-"+release_date.isoformat(),
            "manufacturer":manufacturer,
            "product":name,
            "releaseDate":release_date.isoformat(),
            "tentativeDeadline":(release_date+timedelta(days=45)).isoformat(),
            "status":"VERIFY_NPN"
        })
    return releases

now=datetime.now(timezone.utc)
source_items=json.loads(SOURCES.read_text()).get("items",[])
calendars=[item for item in source_items if item.get("type","").lower()=="release_calendar"]
data=json.loads(WATCHLIST.read_text())
existing=data.get("items",[])
calendar_urls={item.get("url") for item in calendars}
manual=[item for item in existing if item.get("source") not in calendar_urls]
old_by_source={}
for item in existing:
    if item.get("source") in calendar_urls:
        old_by_source.setdefault(item.get("source"),{})[item.get("product","").casefold()]=item

synced=[]
checks=[]
added=0
updated=0
removed=0
successful=0
for source in calendars:
    url=source["url"]
    manufacturer=source.get("manufacturer",source.get("name","Unknown"))
    try:
        response=requests.get(url,headers=REQUEST_HEADERS,timeout=25)
        response.raise_for_status()
        releases=parse_releases(response.text,now.year,manufacturer)
        if not releases:
            raise RuntimeError("calendar returned no parseable products")
        successful+=1
        old=old_by_source.get(url,{})
        current=[]
        for release in releases:
            previous=old.get(release["product"].casefold())
            release["source"]=url
            if previous:
                release["status"]=previous.get("status",release["status"])
                release["id"]=previous.get("id",release["id"])
                updated+=1
            else:
                added+=1
            current.append(release)
        removed+=len(old)-sum(1 for release in releases if release["product"].casefold() in old)
        synced.extend(current)
        checks.append({"name":source.get("name"),"url":url,"status":"OK","products":len(releases)})
    except requests.HTTPError as error:
        synced.extend(item for item in existing if item.get("source")==url)
        if error.response is not None and error.response.status_code == 403:
            checks.append({
                "name":source.get("name"),
                "url":url,
                "status":"SKIPPED",
                "error":"calendar denied automated access (HTTP 403); retained last known products",
            })
        else:
            checks.append({"name":source.get("name"),"url":url,"status":"ERROR","error":str(error)})
    except Exception as error:
        synced.extend(item for item in existing if item.get("source")==url)
        checks.append({"name":source.get("name"),"url":url,"status":"ERROR","error":str(error)})

data["items"]=manual+synced
data["lastCalendarCheck"]=now.isoformat()
data["calendarChecks"]=checks
data["calendarSource"]=[source["url"] for source in calendars]
data["syncSummary"]={"added":added,"updated":updated,"removed":removed,"successfulCalendars":successful,"calendarCount":len(calendars)}
WATCHLIST.write_text(json.dumps(data,indent=2)+"\n")
print(json.dumps(data["syncSummary"]|{"checks":checks},indent=2))
if calendars and successful==0 and not any(check["status"] == "SKIPPED" for check in checks):
    raise SystemExit(1)
