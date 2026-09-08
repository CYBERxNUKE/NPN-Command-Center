#!/usr/bin/env python3
from pathlib import Path
from datetime import datetime, timezone
from urllib.parse import urljoin, urlparse
import hashlib, json, re, requests
from bs4 import BeautifulSoup

ROOT=Path(__file__).resolve().parents[1]
SOURCES=json.loads((ROOT/'data/sources.json').read_text()).get('items',[])
OUTPUT=ROOT/'data/review-leads.json'
previous=json.loads(OUTPUT.read_text()) if OUTPUT.exists() else {'items':[]}
old_by_key={item.get('leadKey'):item for item in previous.get('items',[]) if item.get('leadKey')}
now=datetime.now(timezone.utc).isoformat()
signal=re.compile(r'no purchase necessary|alternate method of entry|amoe|mail[- ]in|npn',re.I)
generic=re.compile(r'^(other npn|follow @|click here|all your no purchase|topps\.com/npn)$',re.I)
all_leads=[]
checks=[]
headers={'User-Agent':'NPNCommandCenter/1.0 (+personal research; polite daily monitor)'}

for source in [item for item in SOURCES if item.get('type','').lower().startswith('secondary')]:
    source_url=source['url']
    try:
        response=requests.get(source_url,headers=headers,timeout=25)
        response.raise_for_status()
        soup=BeautifulSoup(response.text,'html.parser')
        found=[]
        for anchor in soup.find_all('a',href=True):
            title=' '.join(anchor.get_text(' ',strip=True).split())
            parent=anchor.find_parent(['article','li','section','div'])
            context=' '.join((parent.get_text(' ',strip=True) if parent else title).split())
            if not signal.search(title+' '+context):
                continue
            link=urljoin(source_url,anchor['href'])
            parsed=urlparse(link)
            if parsed.scheme not in {'http','https'}:
                continue
            if link.rstrip('/')==source_url.rstrip('/') or any(part in parsed.path.lower() for part in ('contact','about','submit')) or parsed.netloc.lower() in {'twitter.com','x.com','www.twitter.com'} or generic.search(title.strip()):
                continue
            key='scraper:'+hashlib.sha256(link.encode('utf-8')).hexdigest()
            lead=old_by_key.get(key,{'leadKey':key,'sourceUrl':link,'sourceName':source['name'],'title':title or context[:160],'firstSeen':now})
            lead.update({'sourceUrl':link,'sourceName':source['name'],'title':title or context[:160],'lastSeen':now,'status':'pending'})
            found.append(lead)
        by_key={item['leadKey']:item for item in found}
        all_leads.extend(by_key.values())
        checks.append({'name':source['name'],'url':source_url,'status':'OK','leads':len(by_key)})
    except Exception as error:
        preserved=[item for item in old_by_key.values() if item.get('sourceName')==source['name']]
        all_leads.extend(preserved)
        checks.append({'name':source['name'],'url':source_url,'status':'ERROR','error':str(error)})

OUTPUT.write_text(json.dumps({'generatedAt':now,'checks':checks,'items':list({item['leadKey']:item for item in all_leads}.values())[:500]},indent=2)+'\n')
print(json.dumps({'sources':len(checks),'leads':len(all_leads),'errors':sum(1 for item in checks if item['status']=='ERROR')},indent=2))
