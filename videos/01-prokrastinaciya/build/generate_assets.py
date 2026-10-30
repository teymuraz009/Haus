import json, os, base64, wave, urllib.request, time
KEY = os.environ['POLZA_API_KEY']
OUT = '/tmp/claude-0/-home-user-Haus/1428d2df-0751-5ab0-b920-e39c13d0aca6/scratchpad/gen'
STATE = OUT + '/state.json'
state = json.load(open(STATE)) if os.path.exists(STATE) else {}
def save(): json.dump(state, open(STATE, 'w'), ensure_ascii=False, indent=1)
def call(method, path, body=None):
    req = urllib.request.Request('https://api.polza.ai/api/v1' + path, method=method,
        data=json.dumps(body).encode() if body else None,
        headers={'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=300) as r: return json.load(r)

scenes = {
 's2': "Когда задача пугает, скучна или непонятна, мозг включает защиту. И ищет, как избежать дискомфорта прямо сейчас.",
 's3': "Поэтому ты открываешь телефон, а не документ. Не потому что слабый. А потому что телефон даёт облегчение за секунду.",
 's4': "Это называется регуляция эмоций. А не управление временем. Исследователи из Карлтонского университета показали: прокрастинация — это про настроение, а не про планирование.",
 's5': "Что делать? Не заставляй себя. Уменьши шаг до смешного. Открыть файл. Написать одну строку. Всего две минуты.",
 's6': "Начать — это единственное, что тебе нужно сегодня.",
 's7': "А ты правда ленивый?",
}
for k, text in scenes.items():
    if os.path.exists(f'{OUT}/{k}.wav'): continue
    r = call('POST', '/audio/speech' if False else '/media', {'model': 'elevenlabs/eleven-v4', 'input': {'text': text, 'voice': 'adam'}}) if False else None
    import urllib.error
    req = urllib.request.Request('https://api.polza.ai/v1/audio/speech', method='POST',
        data=json.dumps({'model': 'elevenlabs/eleven-v4', 'input': text, 'voice': 'adam'}).encode(),
        headers={'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json'})
    d = json.load(urllib.request.urlopen(req, timeout=300))
    w = wave.open(f'{OUT}/{k}.wav', 'wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(24000)
    w.writeframes(base64.b64decode(d['audio'])); w.close()
    print(k, d['duration'], d['usage']['cost_rub'])

style = "vertical cinematic abstract motion background, deep black and dark navy, single warm amber accent light, soft volumetric glow, slow camera move, no text, no people, no logos, film grain"
clips = {
 'v1': "glowing neural network inside a dark void, one amber node pulses like an alarm and sends warning light through the network. " + style,
 'v2': "dark desk seen from above, a glowing smartphone screen lights up amber while a blank document in shadow stays untouched, slow push-in. " + style,
 'v3': "an hourglass of amber light sand slowly turning into floating calm particles, mood shifts from tense to calm. " + style,
 'v4': "a tiny amber light is switched on in a huge dark room and gradually illuminates a path forward, slow dolly forward, hopeful. " + style,
}
for k, p in clips.items():
    if k in state: continue
    r = call('POST', '/media', {'model': 'kling/v3', 'async': True,
        'input': {'prompt': p, 'aspect_ratio': '9:16', 'duration': '5', 'mode': 'pro', 'sound': False}})
    state[k] = r; save(); print(k, r.get('id'), r.get('status'))
