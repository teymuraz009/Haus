import json, os, sys, base64, wave, time, urllib.request, urllib.error
KEY = os.environ['POLZA_API_KEY']
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1]; CAP = float(sys.argv[2]) if len(sys.argv) > 2 else 50.0
S = json.load(open(ROOT + '/script.json', encoding='utf-8'))
STATE = OUT + '/state.json'
st = json.load(open(STATE)) if os.path.exists(STATE) else {'spent': 0.0, 'img': {}}
def save(): json.dump(st, open(STATE, 'w'), ensure_ascii=False, indent=1)
def post(path, body):
    for attempt in range(6):
        try: return _post(path, body)
        except urllib.error.HTTPError as e:
            if e.code != 429: raise
            time.sleep(15 * (attempt + 1))
    raise RuntimeError('429 persists')
def _post(path, body):
    r = urllib.request.Request('https://api.polza.ai' + path, method='POST', data=json.dumps(body).encode(),
        headers={'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json'})
    return json.load(urllib.request.urlopen(r, timeout=300))
def get(path):
    r = urllib.request.Request('https://api.polza.ai' + path, headers={'Authorization': 'Bearer ' + KEY})
    return json.load(urllib.request.urlopen(r, timeout=60))
def guard(extra):
    if st['spent'] + extra > CAP: save(); sys.exit(f"STOP: бюджет {CAP} ₽ был бы превышен (потрачено {st['spent']:.2f})")
# images (async, submitted once)
for i, p in enumerate(S['images']):
    k = str(i)
    if k in st['img']: continue
    guard(3.0)
    r = post('/api/v1/media', {'model': 'bytedance/seedream-4', 'async': True,
        'input': {'prompt': p + '. ' + S['style'], 'aspect_ratio': '9:16', 'image_resolution': '2K'}})
    st['img'][k] = {'id': r['id']}; save(); print('img', i, r['id'])
# voice
for sc in S['scenes']:
    f = f"{OUT}/{sc['id']}.wav"
    if os.path.exists(f): continue
    guard(1.5)
    d = post('/v1/audio/speech', {'model': 'elevenlabs/eleven-v4', 'input': sc['text'], 'voice': S.get('voice', 'adam')})
    w = wave.open(f, 'wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(24000)
    w.writeframes(base64.b64decode(d['audio'])); w.close()
    st['spent'] += d['usage']['cost_rub']; save(); print(sc['id'], d['duration'], d['usage']['cost_rub'])
# poll images
def urls(o):
    if isinstance(o, dict):
        for k, v in o.items():
            if k == 'url' and isinstance(v, str): yield v
            else: yield from urls(v)
    elif isinstance(o, list):
        for v in o: yield from urls(v)
pending = [k for k, v in st['img'].items() if 'done' not in v]
for _ in range(60):
    for k in list(pending):
        d = get('/api/v1/media/' + st['img'][k]['id'])
        if d['status'] in ('completed', 'failed', 'cancelled'):
            pending.remove(k)
            if d['status'] != 'completed': print('FAILED', k, d.get('error')); st['img'][k]['done'] = 'failed'; continue
            u = next(urls(d.get('data')))
            urllib.request.urlretrieve(u, f"{OUT}/img{int(k):02d}.png")
            st['img'][k]['done'] = 'ok'; st['spent'] += d['usage']['cost_rub']; save(); print('img ok', k, d['usage']['cost_rub'])
    if not pending: break
    time.sleep(8)
print('ИТОГО потрачено ₽:', round(st['spent'], 2))
