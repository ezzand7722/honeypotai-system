import re

with open('frontend/src/App.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add discardedAlertIds
content = re.sub(
    r'(const seenAlertToken = useRef\(new Map\(\)\);)',
    r'\1\n  const discardedAlertIds = useRef(new Set());',
    content
)

# 2. Filter fresh alerts
content = re.sub(
    r'(if \(data\.status === "success" && data\.alerts && data\.alerts\.length > 0\) \{)(\s*)(data\.alerts\.forEach\(alert => \{)',
    r'\1\n\2  const freshAlerts = data.alerts.filter(alert => { const utcRa = alert.received_at; const alertId = `${alert.src_ip}-${alert.attack_type}-${utcRa}`; return !discardedAlertIds.current.has(alertId); });\n\2  if (freshAlerts.length > 0) {\n\2    freshAlerts.forEach(alert => {',
    content
)

# Close the new if block
content = re.sub(
    r'(\s*\}\);\n\s*\})([\s\S]{0,100}catch \(err\))',
    r'\1\n          }\2',
    content
)

# 3. Add to discardedAlertIds when progress >= 100
content = re.sub(
    r'(if \(\(attack\.progress \|\| 0\) >= 100\) \{)(\s*)(addToHistory)',
    r'\1\n\2  discardedAlertIds.current.add(attack.id);\n\2\3',
    content
)

# 4. Add to discardedAlertIds in finalizeAttackAndSave
content = re.sub(
    r'(if \(activeTestAttack && !activeAttacks\.some\(a => a\.id === activeTestAttack\.id\)\) \{)(\s*)(savedAttacks\.push)',
    r'\1\n\2  discardedAlertIds.current.add(activeTestAttack.id);\n\2\3',
    content
)

# 5. Fix HistoryModule clear
content = re.sub(
    r'(<HistoryModule historyList=\{historyList\} onClearHistory=\{)(\(\) => setHistoryList\(\[\]\))(\} />)',
    r'\1() => { historyList.forEach(a => discardedAlertIds.current.add(a.id)); setHistoryList([]); }\3',
    content
)

# 6. Fix location coordinates
content = re.sub(
    r'(coords: \{\s*lat: \(Math\.random\(\) \* 100 - 50\),\s*lng: \(Math\.random\(\) \* 200 - 100\)\s*\})',
    r'coords: { lat: -50 + ((alert.src_ip ? alert.src_ip.split(".").reduce((a,b)=>a+(parseInt(b,10)||0),0) : 0) % 100), lng: -100 + (((alert.src_ip ? alert.src_ip.split(".").reduce((a,b)=>a+(parseInt(b,10)||0),0) : 0) * 7) % 200) }',
    content
)

with open('frontend/src/App.jsx', 'w', encoding='utf-8') as f:
    f.write(content)

print('Done!')
