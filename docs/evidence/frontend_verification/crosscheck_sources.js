// Cross-checks the generated files against each other for every map × date: stats.json, index.json, heatmaps, zones and all
// match files. usage: node crosscheck_sources.js web/public/data > sources_report.json
const fs=require('fs');const D=process.argv[2];
const s=JSON.parse(fs.readFileSync(D+'/stats.json'));const idx=JSON.parse(fs.readFileSync(D+'/index.json'));
const bad=[];let n=0;const eq=(a,b,what)=>{n++; if(a!==b) bad.push(`${what}: ${a} != ${b}`)};
const dates=[...s.dates.map(d=>d.date),'all'];
for(const map of s.maps){
 const h=JSON.parse(fs.readFileSync(`${D}/heatmaps/${map}.json`));const z=JSON.parse(fs.readFileSync(`${D}/zones/${map}.json`));
 for(const date of dates){
  const sl=s.slices[map][date];const v=sl.values;const key=date;
  const ms=idx.matches.filter(m=>m.map===map&&(date==='all'||m.date===date));
  const tag=`${map}/${date}`;
  eq(ms.length, sl.sample.matches, tag+' index matches vs stats.matches');
  eq(ms.filter(m=>m.humans>0).length, sl.sample.matches_with_human, tag+' index matches_with_human');
  eq(ms.reduce((a,m)=>a+m.humans,0), sl.sample.human_journeys, tag+' index humans vs human_journeys');
  const smp=h.samples[key];
  if(sl.flags.empty){ if(smp) bad.push(tag+' heatmap has sample for empty slice'); continue;}
  eq(smp?.human_journeys, sl.sample.human_journeys, tag+' heatmap sample journeys');
  eq(smp?.matches, sl.sample.matches_with_human, tag+' heatmap sample matches');
  eq(h.totals.kills[key], v.kills.value, tag+' heatmap kills total vs stats kills');
  eq(h.totals.deaths[key], v.deaths.value, tag+' heatmap deaths total vs stats deaths');
  eq(h.totals.traffic[key], v.movement_time_s.sum, tag+' traffic total vs movement_time_s.sum');
  eq(ms.reduce((a,m)=>a+m.counts.kill,0), v.kills.value, tag+' index kill sum vs stats kills');
  eq(ms.reduce((a,m)=>a+m.counts.death+m.counts.storm_death,0), v.deaths.value, tag+' index death+storm vs stats deaths');
  eq(ms.reduce((a,m)=>a+m.counts.storm_death,0), v.deaths.parts.storm, tag+' index storm vs stats storm');
  eq(ms.reduce((a,m)=>a+m.counts.loot,0), v.loot_events.value, tag+' index loot vs stats loot');
  eq(ms.reduce((a,m)=>a+m.counts.kill_killed_pair,0), v.kill_killed_pairs.value, tag+' index pairs vs stats pairs');
  eq(v.kill_rate.numerator, v.kills.value, tag+' kill_rate num'); eq(v.kill_rate.denominator, sl.sample.human_journeys, tag+' kill_rate den');
  eq(+(v.kill_rate.numerator/v.kill_rate.denominator).toFixed(2), v.kill_rate.value, tag+' kill_rate value');
  eq(+(v.loot_rate.numerator/v.loot_rate.denominator).toFixed(2), v.loot_rate.value, tag+' loot_rate value');
  eq(+(100*v.storm_death_rate.numerator/v.storm_death_rate.denominator).toFixed(2), v.storm_death_rate.value, tag+' storm rate value');
  eq(v.storm_death_rate.numerator, v.deaths.parts.storm, tag+' storm rate num');
  // cells sum to totals
  for(const L of ['kills','deaths','traffic']){ const cells=h.layers[L][key]||[]; const sum=cells.reduce((a,c)=>a+c[c.length-1],0); n++; if(Math.abs(sum-h.totals[L][key])>(L==="traffic"?0.05*cells.length+0.5:1e-9) /* traffic cells are stored to 0.1 s (±0.05 each), totals to 1 s */) bad.push(`${tag} ${L} cell sum ${sum} vs total ${h.totals[L][key]}`);}
  const sel=z.selections[key];
  if(sel){ for(const L of ['kills','deaths','traffic']){ const zl=sel.layers[L]; eq(Math.round(zl.total*1000), Math.round(h.totals[L][key]*1000), `${tag} zones ${L} total`);
     for(const zz of zl.zones){ n++; if(zl.total>0 && Math.abs(zz.value/zl.total - zz.share)>0.00051) bad.push(`${tag} zone ${L} ${zz.i},${zz.j} share ${zz.share} vs ${zz.value/zl.total}`);}
     const cons=zl.zones.filter(q=>q.tier==='consistent'); for(let i=1;i<cons.length;i++){ n++; if(cons[i].value>cons[i-1].value) bad.push(`${tag} ${L} hotspot order`);} } }
  else bad.push(tag+' no zone selection');
 }
}
// match files vs index
let mf=0;
for(const m of idx.matches){ const f=JSON.parse(fs.readFileSync(`${D}/matches/${m.id}.json`)); mf++;
 const k={human:0,bot:0,unknown:0}; const c={kill:0,death:0,storm_death:0,loot:0,kill_killed_pair:0};
 for(const a of f.actors){k[a.kind]++; if(a.kind!=='human') continue; for(const e of a.events){ if(e.type==='kill'){ if(e.kill_killed_pair) c.kill_killed_pair++; else c.kill++; } else if(c[e.type]!==undefined) c[e.type]++; }}
 eq(k.human,m.humans,m.id+' humans');eq(k.bot,m.bots,m.id+' bots');eq(k.unknown,m.unknown,m.id+' unknown');
 for(const t of Object.keys(c)) eq(c[t], m.counts[t], `${m.id} ${t}`);
 eq(f.duration_s,m.duration_s,m.id+' duration');
}
// date list counts
for(const d of idx.dates) eq(idx.matches.filter(m=>m.date===d.date).length, d.matches, 'index date '+d.date);
console.log(JSON.stringify({checks:n, matchFiles:mf, mismatches:bad.length, sample:bad.slice(0,40)},null,1));
