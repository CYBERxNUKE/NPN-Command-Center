#!/usr/bin/env python3
from pathlib import Path
from datetime import datetime, timezone
import json, os, re, requests
from urllib.parse import quote

ROOT=Path(__file__).resolve().parents[1]
URL=os.environ.get('SUPABASE_URL','').rstrip('/')
KEY=os.environ.get('SUPABASE_SERVICE_ROLE_KEY','')
if not URL or not KEY:
    raise SystemExit('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')

headers={
    'apikey':KEY,
    'Authorization':'Bearer '+KEY,
    'Content-Type':'application/json',
    'Prefer':'resolution=merge-duplicates,return=minimal'
}
sources=json.loads((ROOT/'data/sources.json').read_text()).get('items',[])
source_kind={item.get('url'):('secondary' if item.get('type','').startswith('secondary') else 'official') for item in sources}
date_re=re.compile(r'^\d{4}-\d{2}-\d{2}$')

def date_or_none(value):
    return value if date_re.match(str(value or '')) else None

def normalize_status(value):
    return value if value in {'RADAR','VERIFY_NPN','OPEN','PROGRAM','EXPIRED','CLOSED'} else 'VERIFY_NPN'

def sync(rows):
    if not rows:
        return
    response=requests.post(URL+'/rest/v1/opportunities?on_conflict=external_key',headers=headers,json=rows,timeout=30)
    response.raise_for_status()

def reconcile(rows):
    if not rows:
        return 0
    current={row.get('external_key') for row in rows if row.get('external_key')}
    response=requests.get(URL+'/rest/v1/opportunities?select=id,external_key,status,source_kind,created_by&external_key=not.is.null',headers=headers,timeout=30)
    response.raise_for_status()
    stale=[]
    for item in response.json():
        if item.get('external_key') in current or item.get('created_by'):
            continue
        if item.get('source_kind') not in {'official','secondary'}:
            continue
        if item.get('status') not in {'OPEN','PROGRAM','RADAR','VERIFY_NPN'}:
            continue
        stale.append(item)
    for item in stale:
        endpoint=URL+'/rest/v1/opportunities?external_key=eq.'+quote(str(item['external_key']),safe='')
        result=requests.patch(endpoint,headers=headers,json={'status':'CLOSED','review_notes':'No longer present in the latest public data snapshot.'},timeout=30)
        result.raise_for_status()
    return len(stale)

opportunities=json.loads((ROOT/'data/opportunities.json').read_text()).get('items',[])
watchlist=json.loads((ROOT/'data/watchlist.json').read_text()).get('items',[])
review_leads=json.loads((ROOT/'data/review-leads.json').read_text()).get('items',[]) if (ROOT/'data/review-leads.json').exists() else []
rows=[]
for item in opportunities:
    rows.append({
        'external_key':item.get('id'), 'manufacturer':item.get('manufacturer',''), 'product':item.get('product',''),
        'program':item.get('program'), 'category':item.get('category'), 'status':normalize_status(item.get('status')),
        'confidence':item.get('confidence','UNVERIFIED'), 'release_date':date_or_none(item.get('releaseDate')),
        'postmark_deadline':date_or_none(item.get('postmarkDeadline')), 'received_deadline':date_or_none(item.get('receivedDeadline')),
        'entry_limit':item.get('entryLimit'), 'method':item.get('method'), 'address':item.get('address'), 'attention':item.get('attention'),
        'instructions':item.get('instructions'), 'prize':item.get('prize'), 'source_url':item.get('source',''),
        'source_kind':source_kind.get(item.get('source'),'official'), 'checklist_url':item.get('checklistUrl'), 'odds_url':item.get('oddsUrl'),
        'review_notes':item.get('notes'), 'source_last_checked_at':datetime.now(timezone.utc).isoformat()
    })
for item in watchlist:
    rows.append({
        'external_key':'radar:'+str(item.get('id')), 'manufacturer':item.get('manufacturer',''), 'product':item.get('product',''),
        'status':'RADAR', 'confidence':'LEAD', 'release_date':date_or_none(item.get('releaseDate')),
        'postmark_deadline':date_or_none(item.get('tentativeDeadline')), 'source_url':item.get('source',''),
        'source_kind':source_kind.get(item.get('source'),'secondary'), 'source_last_checked_at':datetime.now(timezone.utc).isoformat()
    })
sync(rows)
def sync_review_leads(leads):
    if not leads:
        return
    payload=[{
        'lead_key':item.get('leadKey'),
        'source_url':item.get('sourceUrl'),
        'raw_payload':{'title':item.get('title',''),'source_name':item.get('sourceName',''),'intake':'secondary_scraper','last_seen':item.get('lastSeen')}
    } for item in leads if item.get('leadKey') and item.get('sourceUrl')]
    if not payload:
        return
    lead_headers={**headers,'Prefer':'resolution=ignore-duplicates,return=minimal'}
    response=requests.post(URL+'/rest/v1/review_queue',headers=lead_headers,json=payload,timeout=30)
    response.raise_for_status()

sync_review_leads(review_leads)
print(json.dumps({'synced':len(rows),'review_leads':len(review_leads),'closed_stale':reconcile(rows)},indent=2))
