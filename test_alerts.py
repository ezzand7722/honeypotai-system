import json
import urllib.request

d1 = json.loads(urllib.request.urlopen('http://127.0.0.1:8000/report/alerts?limit=15').read().decode('utf-8'))
d2 = json.loads(urllib.request.urlopen('http://127.0.0.1:8000/report/alerts?limit=15').read().decode('utf-8'))

print('First:', [x.get('id') for x in d1['alerts'][:3]])
print('Second:', [x.get('id') for x in d2['alerts'][:3]])
print('Total:', len(d1['alerts']))
