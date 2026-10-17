from pathlib import Path
import json, math, re, copy, hashlib
from zoneinfo import ZoneInfo
ROOT=Path(__file__).resolve().parents[1]
def read(p): return json.loads((ROOT/p).read_text())
def reject(condition,message):
 if not condition: raise ValueError(message)
def validate(value,s,path='$'):
 if 'const' in s: reject(value==s['const'],path+': const')
 if 'enum' in s: reject(value in s['enum'],path+': enum')
 t=s.get('type')
 types={'object':lambda x:isinstance(x,dict),'array':lambda x:isinstance(x,list),'string':lambda x:isinstance(x,str),'number':lambda x:isinstance(x,(int,float)) and not isinstance(x,bool) and math.isfinite(x),'integer':lambda x:isinstance(x,int) and not isinstance(x,bool),'boolean':lambda x:isinstance(x,bool)}
 if t:reject(types[t](value),path+': type')
 if t=='object':
  for k in s.get('required',[]):reject(k in value,path+': missing '+k)
  if s.get('additionalProperties') is False:reject(set(value)<=set(s.get('properties',{})),path+': unknown field')
  for k,v in value.items():
   if k in s.get('properties',{}):validate(v,s['properties'][k],path+'.'+k)
 if t=='array':
  reject(len(value)>=s.get('minItems',0) and len(value)<=s.get('maxItems',10**9),path+': array size')
  if s.get('uniqueItems'):reject(len({json.dumps(v,sort_keys=True) for v in value})==len(value),path+': duplicate item')
  for i,v in enumerate(value):validate(v,s.get('items',{}),path+'['+str(i)+']')
 if t=='string':
  reject(len(value)>=s.get('minLength',0) and len(value)<=s.get('maxLength',10**9),path+': length')
  if 'pattern' in s:reject(re.search(s['pattern'],value) is not None,path+': pattern')
 if t in ['number','integer']:
  if 'minimum' in s:reject(value>=s['minimum'],path+': minimum')
  if 'maximum' in s:reject(value<=s['maximum'],path+': maximum')
  if 'exclusiveMinimum' in s:reject(value>s['exclusiveMinimum'],path+': positive value')
SCHEMA=read('contracts/local-merchant-reference.schema.json')
def semantic(ref,expected):
 validate(ref,SCHEMA)
 reject(ref['countryCode']==expected,'country mismatch')
 ZoneInfo(ref['timeZone'])
 region_ids=[x['id'] for x in ref['regions']]
 reject(len(region_ids)==len(set(region_ids)),'duplicate region')
 ids=[x['id'] for x in ref['merchants']]
 reject(len(ids)==len(set(ids)),'duplicate merchant')
 scale=10**ref['currencyDigits']
 for m in ref['merchants']:
  reject(set(m['regions'])<=set(region_ids+['*']),'unknown region')
  reject(abs(m['mean']*scale-round(m['mean']*scale))<1e-6,'invalid monetary precision')
fr=read('country-references/fr.merchants.v1.json');gb=read('country-references/gb.example.v1.json')
semantic(fr,'FR');semantic(gb,'GB')
bad_cases=[]
def must_fail(label,ref,expected):
 try:semantic(ref,expected)
 except (ValueError,KeyError):bad_cases.append(label);return
 raise AssertionError('Invalid reference accepted: '+label)
must_fail('country mismatch',gb,'FR')
b=copy.deepcopy(fr);b['merchants'][0]['category']='unsupported';must_fail('unknown category',b,'FR')
b=copy.deepcopy(fr);b['merchants'][1]['id']=b['merchants'][0]['id'];must_fail('duplicate ID',b,'FR')
b=copy.deepcopy(fr);b['script']='execute';must_fail('unknown field',b,'FR')
b=copy.deepcopy(fr);b['merchants'][0]['mean']=-1;must_fail('negative mean',b,'FR')
b=copy.deepcopy(fr);b['merchants'][0]['mean']=1.234;must_fail('currency precision',b,'FR')
b=copy.deepcopy(fr);b['merchants'][0]['regions']=['unknown'];must_fail('unknown region',b,'FR')
configs=[]
for p in (ROOT/'configurations').glob('*.json'):
 d=json.loads(p.read_text());c=d['configuration'];ref=d['reference']
 reject(d['format']=='personia.configuration' and d['version']==2 and d['uiLocale']=='en-GB','configuration envelope')
 semantic(ref,c['countryCode'])
 for key in ['currency','currencyDigits','locale','timeZone']:reject(c[key]==ref[key],'context mismatch '+key)
 reject(c['referenceId']==ref['id'],'reference ID')
 canonical=json.dumps(ref,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()
 reject(hashlib.sha256(canonical).hexdigest()==d['referenceHash'],'reference hash')
 reject(sum(a['type']=='checking' for a in c['accounts'])==1,'one current account')
 reject(not c['incomes'] or sum(i['main'] for i in c['incomes'])==1,'one main income')
 for key in ['incomes','accounts','charges','plannedEvents']:
  ids=[x['key' if key=='accounts' else 'id'] for x in c[key]]
  reject(len(ids)==len(set(ids)),'unique '+key)
 configs.append(d['modelId'])
messages=read('i18n/en-GB.json')
reject(set(messages['categories'])=={x['key'] for x in read('reference/categories.json')},'category translation coverage')
reject(set(messages['profiles'])=={x['id'] for x in read('reference/consumption-profiles.json')},'profile translation coverage')
reject(set(messages['segments'])=={x['id'] for x in read('reference/merchant-segments.json')},'segment translation coverage')
theme=read('design/dark-theme.json')['colors']
def lum(h):
 rgb=[int(h[i:i+2],16)/255 for i in [1,3,5]]
 rgb=[x/12.92 if x<=.04045 else ((x+.055)/1.055)**2.4 for x in rgb]
 return sum(a*b for a,b in zip(rgb,[.2126,.7152,.0722]))
def contrast(a,b):
 x,y=sorted([lum(theme[a]),lum(theme[b])]);return (y+.05)/(x+.05)
checks=[]
for a,b,minimum in [('contentPrimary','canvas',4.5),('contentSecondary','surface',4.5),('contentMuted','surfaceRaised',4.5),('actionContent','actionFill',4.5),('error','surface',4.5),('controlBorder','surface',3)]:
 ratio=contrast(a,b);reject(ratio>=minimum,'contrast '+a+'/'+b);checks.append({'foreground':a,'background':b,'ratio':round(ratio,2),'minimum':minimum})
for p in ROOT.rglob('*.json'):
 json.loads(p.read_text(),parse_constant=lambda x:(_ for _ in ()).throw(ValueError(x)))
report={'scope':'Specification artifact checks only; target runtime/UI behavior is not implemented or tested by this script','referenceSchemaChecks':'Every validation keyword used in the delivered schema is checked by this utility; this is not a general-purpose JSON Schema implementation','validCountryReferences':['FR','GB'],'negativeCasesRejected':bad_cases,'targetConfigurations':sorted(configs),'referenceHashes':True,'englishRegistryCoverage':True,'contrastChecks':checks}
(ROOT/'ARTIFACT-CHECKS.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report))

