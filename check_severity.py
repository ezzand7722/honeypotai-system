import json
import urllib.request

try:
    res = urllib.request.urlopen("http://127.0.0.1:8000/report/alerts")
    data = json.loads(res.read())
    print([item.get("severity") for item in data])
except Exception as e:
    print(e)
