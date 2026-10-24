// Frontend ↔ data verification: for every map × date, the text each page renders vs the value computed independently from
// the shipped JSON (no frontend code is imported). Needs the dev server and a Chrome with --remote-debugging-port.
// usage (from web/): node ../docs/evidence/frontend_verification/verify_rendered.mjs public/data http://localhost:5287 9433 out.json
import fs from 'node:fs'
const [D, BASE, PORT, OUT] = process.argv.slice(2)
const J = (p) => JSON.parse(fs.readFileSync(`${D}/${p}`, 'utf8'))
const stats = J('stats.json')
const index = J('index.json')
const DATES = [...stats.dates.map((d) => d.date), 'all']

// ---- independent formatting of the stored values ----
const n = (x) => x.toLocaleString('en-US')
const r2 = (x) => x.toFixed(2)
const mss = (s) => { const t = Math.round(s); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}` }
const pct4 = (num, den) => `${((Math.round((num / den) * 1e4) / 1e4) * 100).toFixed(1)}%`
const pl = (c, one, many) => `${n(c)} ${c === 1 ? one : many}`
const ptime = (s) => (s < 1 ? 'under 1 s' : Math.round(s) < 60 ? `${Math.round(s)} s` : `${n(Math.round(s / 60))} min`)
const MISSING = '—'
const val = (sl, id) => sl.values[id]

function tiles(sl) {
  const e = sl.flags.empty
  return {
    'Human journeys': e ? MISSING : n(sl.sample.human_journeys),
    'Players observed': e ? MISSING : n(sl.sample.human_players),
    'Median recorded span': val(sl, 'journey_span_s')?.median != null ? mss(val(sl, 'journey_span_s').median) : MISSING,
    'Kills per human journey': val(sl, 'kill_rate') ? r2(val(sl, 'kill_rate').value) : MISSING,
    'Items looted per human journey': val(sl, 'loot_rate') ? r2(val(sl, 'loot_rate').value) : MISSING,
    'Storm deaths': val(sl, 'storm_death_rate') ? `${r2(val(sl, 'storm_death_rate').value)}%` : MISSING,
  }
}
const scope = (sl, date) =>
  `${pl(sl.sample.human_journeys, 'human journey', 'human journeys')} in ${pl(sl.sample.matches_with_human, 'match', 'matches')} · ${pl(sl.sample.human_players, 'player observed', 'players observed')} · ${date === 'all' ? 'all dates' : date}`

// ---- CDP ----
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
const page = list.find((t) => t.type === 'page')
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((r) => (ws.onopen = r))
let id = 0
const pending = new Map()
const errors = []
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data)
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id) }
  if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description?.slice(0, 200))
}
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
await send('Runtime.enable')
await send('Page.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
// reduced motion: CountUp shows final values at once where it honours it; we also wait past its 900 ms either way
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const evalJs = async (js) => (await send('Runtime.evaluate', { expression: js, returnByValue: true, awaitPromise: true })).result?.result?.value
async function open(path, readyJs, settle = 1200) {
  await send('Page.navigate', { url: BASE + path })
  for (let t = 0; t < 60; t++) { await sleep(250); if (await evalJs(`!!(${readyJs})`)) break }
  await sleep(settle)
}

const rows = []
const check = (page, map, date, metric, source, expected, displayed) =>
  rows.push({ page, map, date, metric, source, expected, displayed: displayed ?? null, result: expected === displayed ? 'match' : 'MISMATCH' })

const READ_TILES = `Object.fromEntries([...document.querySelectorAll('[data-slot=card]')].map(c=>{const v=c.querySelector('.text-2xl');const l=c.querySelector('p.font-medium');return v&&l?[l.innerText.trim(),v.innerText.trim()]:null}).filter(Boolean))`
const READ_SCOPE = `[...document.querySelectorAll('p')].map(p=>p.innerText).find(t=>/human journeys? in /.test(t) && / · /.test(t))??null`

// 1. Overview, every date
for (const date of DATES) {
  const sl = stats.slices.all[date]
  await open(`/stats${date === 'all' ? '' : `?date=${date}`}`, `document.querySelectorAll('[data-slot=card] .text-2xl').length>=6 && !document.querySelector('main .inline-grid, [data-slot=card] .inline-grid')`, 800)
  const shown = await evalJs(READ_TILES)
  for (const [label, exp] of Object.entries(tiles(sl))) check('Overview', 'all', date, `tile: ${label}`, 'stats.json all/date', exp, shown[label])
  check('Overview', 'all', date, 'scope line', 'stats.json sample', scope(sl, date), await evalJs(READ_SCOPE))
  // map cards (Compare on = Human journeys) and the comparison strip
  const cards = await evalJs(`Object.fromEntries([...document.querySelectorAll('button[aria-label^="Select "]')].map(b=>{const card=b.parentElement;return [b.getAttribute('aria-label').slice(7), [...card.querySelectorAll('.tabular-nums')].map(e=>e.innerText.trim())]}))`)
  const strip = await evalJs(`Object.fromEntries([...document.querySelectorAll('section[aria-label="Map comparison charts"] [data-slot=card]')].map(c=>[c.querySelector('[data-slot=card-title]')?.innerText.trim(), [...c.querySelectorAll('li')].map(li=>li.innerText.replace(/\\s+/g,' ').trim())]))`)
  const total = stats.slices.all[date].sample.human_journeys
  for (const map of stats.maps) {
    const ms = stats.slices[map][date]
    const t = tiles(ms)
    const card = cards[map] ?? []
    check('Overview', map, date, 'map card: human journeys', 'stats.json map/date', t['Human journeys'], card[0])
    check('Overview', map, date, 'map card: recorded span', 'stats.json map/date', t['Median recorded span'], card[1])
    check('Overview', map, date, 'map card: kills per journey', 'stats.json map/date', t['Kills per human journey'], card[2])
    const share = `${total ? Math.round((ms.sample.human_journeys / total) * 100) : 0}%`
    check('Overview', map, date, 'donut share of human journeys', 'stats.json map/all journeys', `${map} ${share}`, strip['Where human journeys were recorded']?.find((x) => x.startsWith(map)))
    check('Overview', map, date, 'bar: kills per human journey', 'stats.json kill_rate', `${map} ${t['Kills per human journey']}`, strip['Kills per human journey']?.find((x) => x.startsWith(map)))
    check('Overview', map, date, 'bar: items per human journey', 'stats.json loot_rate', `${map} ${t['Items looted per human journey']}`, strip['Items looted per human journey']?.find((x) => x.startsWith(map)))
    check('Overview', map, date, 'bar: storm deaths', 'stats.json storm_death_rate', `${map} ${t['Storm deaths']}`, strip['Storm deaths']?.find((x) => x.startsWith(map)))
  }
}

// 2. Map reports: tiles, scope line, Combat and Loot figures
for (const map of stats.maps) for (const date of DATES) {
  const sl = stats.slices[map][date]
  const q = `?map=${map}${date === 'all' ? '' : `&date=${date}`}`
  await open(`/stats${q}&section=combat`, `document.querySelectorAll('[data-slot=card] .text-2xl').length>=6`)
  const shown = await evalJs(READ_TILES)
  for (const [label, exp] of Object.entries(tiles(sl))) check('Map report', map, date, `tile: ${label}`, 'stats.json map/date', exp, shown[label])
  if (sl.flags.empty) { check('Map report', map, date, 'empty state', 'stats.json flags.empty', true, await evalJs(`document.body.innerText.includes('No human journeys recorded on ${map}')`)); continue }
  check('Map report', map, date, 'scope line', 'stats.json sample', scope(sl, date), await evalJs(READ_SCOPE))
  const wd = val(sl, 'journeys_with_death')
  check('Map report', map, date, 'combat: deaths', 'stats.json deaths', n(val(sl, 'deaths').value), shown['Deaths'])
  check('Map report', map, date, 'combat: journeys ending in a recorded death', 'stats.json journeys_with_death', `${((wd.value) * 100).toFixed(1)}%`, shown['Human journeys ending in a recorded death'])
  await open(`/stats${q}&section=loot`, `[...document.querySelectorAll('p.font-medium')].some(p=>p.innerText.includes('any loot'))`, 500)
  const loot = await evalJs(READ_TILES)
  const wl = val(sl, 'journeys_with_loot')
  check('Map report', map, date, 'loot: journeys with any loot', 'stats.json journeys_with_loot', `${(wl.value * 100).toFixed(1)}%`, loot['Human journeys with any loot'])
  const fl = val(sl, 'first_loot_s')
  check('Map report', map, date, 'loot: median time to first loot', 'stats.json first_loot_s', fl?.median != null ? mss(fl.median) : MISSING, loot['Median time to first loot'])
}

// 3. Heatmaps summary, every map × date × layer
for (const map of stats.maps) {
  for (const date of DATES) for (const layer of ['traffic', 'kills', 'deaths']) {
    const sl = stats.slices[map][date]
    await open(`/heatmaps?map=${map}${date === 'all' ? '' : `&date=${date}`}${layer === 'traffic' ? '' : `&layer=${layer}`}`, `document.querySelector('section[aria-label="Summary"]')`, 400)
    const shown = await evalJs(`(()=>{const s=document.querySelector('section[aria-label="Summary"]');if(!s)return null;const lead=s.querySelector('.text-2xl');return {text:s.innerText.replace(/\\s+/g,' ').trim(),lead:lead?.innerText.trim()??null,figures:Object.fromEntries([...s.querySelectorAll('dl > div')].map(d=>[d.querySelector('dt').innerText.trim(),d.querySelector('dd').innerText.trim()]))}})()`)
    const tag = `layer ${layer}`
    if (sl.flags.empty) { check('Heatmaps', map, date, `${tag}: empty state`, 'stats.json flags.empty', true, !!shown?.text?.startsWith('No human journeys recorded')); continue }
    const f = shown?.figures ?? {}
    const ms = index.matches.filter((m) => m.map === map && (date === 'all' || m.date === date))
    const matchesWH = n(sl.sample.matches_with_human)
    if (layer === 'traffic') {
      const sum = val(sl, 'movement_time_s').sum
      check('Heatmaps', map, date, `${tag}: estimated player time`, 'stats.json movement_time_s.sum (= heatmap total)', ptime(sum), shown?.lead)
      check('Heatmaps', map, date, `${tag}: per human journey`, 'movement_time_s.sum ÷ human_journeys', ptime(sum / sl.sample.human_journeys), f['per human journey'])
      check('Heatmaps', map, date, `${tag}: human journeys`, 'stats.json human_journeys', n(sl.sample.human_journeys), f['human journeys'])
      check('Heatmaps', map, date, `${tag}: matches with humans`, 'stats.json matches_with_human', matchesWH, f['matches with humans'])
    } else if (layer === 'kills') {
      const withKill = ms.filter((m) => m.counts.kill > 0).length
      const kills = val(sl, 'kills').value
      if (kills === 0) { check('Heatmaps', map, date, `${tag}: empty state`, 'stats.json kills = 0', true, !!shown?.text?.startsWith('No human kills')); continue }
      check('Heatmaps', map, date, `${tag}: kills`, 'stats.json kills', n(kills), shown?.lead)
      check('Heatmaps', map, date, `${tag}: kills per human journey`, 'stats.json kill_rate', r2(val(sl, 'kill_rate').value), f['kills per human journey'])
      check('Heatmaps', map, date, `${tag}: share of matches with a kill`, 'index.json matches with kill ÷ matches_with_human', pct4(withKill, sl.sample.matches_with_human), f['of matches with humans had a kill'])
      check('Heatmaps', map, date, `${tag}: matches with humans`, 'stats.json matches_with_human', matchesWH, f['matches with humans'])
    } else {
      const deaths = val(sl, 'deaths')
      if (deaths.value === 0) { check('Heatmaps', map, date, `${tag}: empty state`, 'stats.json deaths = 0', true, !!shown?.text?.startsWith('No human deaths')); continue }
      check('Heatmaps', map, date, `${tag}: deaths`, 'stats.json deaths', n(deaths.value), shown?.lead)
      check('Heatmaps', map, date, `${tag}: journeys ending in a recorded death`, 'stats.json journeys_with_death', `${(val(sl, 'journeys_with_death').value * 100).toFixed(1)}%`, f['of human journeys ended in a recorded death'])
      const stormKey = Object.keys(f).find((k) => k.startsWith('storm deaths'))
      check('Heatmaps', map, date, `${tag}: storm deaths`, 'stats.json deaths.parts.storm', `${n(deaths.parts.storm)} | storm deaths (${pct4(deaths.parts.storm, deaths.value)})`, stormKey ? `${f[stormKey]} | ${stormKey}` : undefined)
    }
  }
}

// 4. Journeys match list header, every map × date
for (const map of stats.maps) for (const date of DATES) {
  await open(`/journeys?map=${map}${date === 'all' ? '' : `&date=${date}`}`, `document.querySelector('#match-list-title')`, 300)
  const head = await evalJs(`document.querySelector('#match-list-title')?.innerText.replace(/\\s+/g,' ').trim()`)
  check('Journeys', map, date, 'match list: matches', 'index.json matches (= stats.json matches)', `Matches ${stats.slices[map][date].sample.matches}`, head)
}

// 5. Selected matches: match card and legend vs index.json and the match file
const picks = new Set()
for (const map of stats.maps) {
  const ms = index.matches.filter((m) => m.map === map)
  for (const pick of [
    [...ms].sort((a, b) => b.counts.kill - a.counts.kill)[0],
    ms.find((m) => m.bots > 0), ms.find((m) => m.counts.kill_killed_pair > 0), ms.find((m) => m.unknown > 0),
    ms.find((m) => m.counts.storm_death > 0), ms.find((m) => m.humans > 1),
  ]) if (pick) picks.add(pick)
}
for (const m of picks) {
  const file = J(`matches/${m.id}.json`)
  await open(`/journeys?map=${m.map}&match=${m.id}`, `document.querySelector('#legend-title') && document.querySelector('#journeys-count-title')`, 600)
  const card = await evalJs(`Object.fromEntries(['journeys-count-title','human-events-title'].flatMap(id=>[...document.getElementById(id).parentElement.querySelectorAll('[data-slot=stat]')].map(s=>[id+':'+s.querySelector('dt').innerText.trim(), s.querySelector('dd').innerText.trim()])))`)
  const legend = await evalJs(`Object.fromEntries([...document.querySelector('#legend-title').parentElement.querySelectorAll('li')].map(li=>{const c=li.querySelector('[aria-label$=" recorded"]');const l=li.querySelector('label span.min-w-0');return c&&l?[l.innerText.replace(/\\s+/g,' ').trim(),c.innerText.trim()]:null}).filter(Boolean))`)
  const tag = `match ${m.id}`
  const c = m.counts
  for (const [k, v] of [['journeys-count-title:Humans', m.humans], ['journeys-count-title:Bots', m.bots], ['human-events-title:Kills', c.kill], ['human-events-title:Deaths', c.death], ['human-events-title:Loot', c.loot]])
    check('Journeys', m.map, m.date, `${tag} card ${k.split(':')[1]}`, 'index.json match row', String(v), card[k])
  if (m.unknown) check('Journeys', m.map, m.date, `${tag} card Unknown`, 'index.json match row', String(m.unknown), card['journeys-count-title:Unknown'])
  if (c.storm_death) check('Journeys', m.map, m.date, `${tag} card Storm deaths`, 'index.json match row', String(c.storm_death), card['human-events-title:Storm deaths'])
  if (c.kill_killed_pair) check('Journeys', m.map, m.date, `${tag} card Kill/Killed pairs`, 'index.json match row', String(c.kill_killed_pair), card['human-events-title:Kill/Killed pairs'])
  // legend: markers drawn (every actor kind, every event of its type, pair Kills included)
  const ev = { kill: 0, death: 0, storm_death: 0, loot: 0 }
  const kinds = { human: 0, bot: 0, unknown: 0 }
  for (const a of file.actors) { kinds[a.kind]++; for (const e of a.events) if (e.type in ev) ev[e.type]++ }
  const legendKey = (prefix) => Object.keys(legend).find((k) => k.startsWith(prefix))
  check('Journeys', m.map, m.date, `${tag} legend Humans`, 'match file actors', String(kinds.human), legend['Humans'])
  check('Journeys', m.map, m.date, `${tag} legend Bots`, 'match file actors', String(kinds.bot), legend['Bots'])
  for (const [label, type] of [['Kill', 'kill'], ['Death', 'death'], ['Storm death', 'storm_death'], ['Loot', 'loot']]) {
    const key = Object.keys(legend).find((k) => k === label || k.startsWith(label + ' incl.')) ?? legendKey(label)
    check('Journeys', m.map, m.date, `${tag} legend ${label}`, 'match file events (all actors)', String(ev[type]), key ? legend[key] : undefined)
  }
}

ws.close()
const bad = rows.filter((r) => r.result !== 'match')
fs.writeFileSync(OUT, JSON.stringify({ base: BASE, checked: rows.length, mismatches: bad.length, exceptions: errors, rows }, null, 1))
console.log(JSON.stringify({ checked: rows.length, mismatches: bad.length, exceptions: errors.length }))
for (const r of bad.slice(0, 40)) console.log('MISMATCH', r.page, r.map, r.date, r.metric, '| expected', JSON.stringify(r.expected), '| shown', JSON.stringify(r.displayed))
