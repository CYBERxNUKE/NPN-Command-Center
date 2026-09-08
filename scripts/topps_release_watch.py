#!/usr/bin/env python3
from pathlib import Path
from datetime import datetime, timedelta
import json, re, requests
from bs4 import BeautifulSoup

ROOT=Path(__file__).resolve().parents[1]
URL="https://www.topps.com/release-calendar"
r=requests.get(URL,headers={"User-Agent":"Mozilla/5.0 NPNCommandCenter"},timeout=25); r.raise_for_status()
text=" ".join(BeautifulSoup(r.text,"html.parser").stripped_strings)

# This scraper is deliberately "lead generator", not eligibility confirmer.
# Topps rules require NPN/Topps Access designation on the eligible product itself.
# The release calendar changes frequently and page markup can change, so preserve existing watchlist
# and log the raw hash via watch.py rather than silently deleting records.
data=json.loads((ROOT/"data/watchlist.json").read_text())
data["lastCalendarCheck"]=datetime.utcnow().isoformat()+"Z"
data["calendarSource"]=URL
(ROOT/"data/watchlist.json").write_text(json.dumps(data,indent=2))
print("Topps release calendar checked; existing radar preserved for human/eligibility verification.")
