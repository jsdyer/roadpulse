export const compareFields = ['status','severity','description','roads','schedule','event_type','event_subtypes','headline','geography','areas'];
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value==='object') return `{${Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')}}`;
  return JSON.stringify(value);
}
export function validateCapture(value) {
  if (!value || value.schemaVersion!==1 || value.tool!=='roadpulse' || !Number.isFinite(Date.parse(value.capturedAt)) || value.complete!==true || value.source!=='https://api.open511.gov.bc.ca/events' || !value.scope || value.scope.source!==value.source || !value.scope.filters || Array.isArray(value.scope.filters) || typeof value.scope.filters!=='object' || !Array.isArray(value.events) || value.events.length>50000) throw Error('This is not a complete Road Pulse capture.');
  const ids=new Set();
  for (const e of value.events) {
    if (!e || typeof e.id!=='string' || !e.id.startsWith('drivebc.ca/') || ids.has(e.id) || !['ACTIVE','ARCHIVED'].includes(e.status)) throw Error('Capture contains invalid or duplicate event records.');
    ids.add(e.id);
    for(const k of ['headline','description','event_type','severity']) if(e[k]!==undefined && typeof e[k]!=='string') throw Error('Invalid event text field.');
    if(e.schedule!==undefined && (!e.schedule || typeof e.schedule!=='object' || Array.isArray(e.schedule) || (e.schedule.intervals!==undefined && (!Array.isArray(e.schedule.intervals)||e.schedule.intervals.some(i=>typeof i!=='string'))))) throw Error('Invalid event schedule.');
    if (!['created','updated'].every(k=>typeof e[k]==='string' && Number.isFinite(Date.parse(e[k])))) throw Error('Event source timestamps are missing or invalid.');
    for(const k of ['roads','areas','event_subtypes']) if(e[k]!==undefined && !Array.isArray(e[k])) throw Error('An event collection has an invalid shape.');
    if(e.roads?.some(r=>!r || typeof r!=='object') || e.areas?.some(a=>!a || typeof a!=='object')) throw Error('Invalid road or area.');
  }
  return value;
}
export function comparison(current, previous) {
  if(!previous) return {comparable:false,reason:'First retained capture. Changes will appear after another successful collection.',rows:current.events.map(event=>({event,change:'baseline',fields:[]}))};
  if(Date.parse(previous.capturedAt)>=Date.parse(current.capturedAt)) return {comparable:false,reason:'Choose an earlier capture to compare.',rows:current.events.map(event=>({event,change:'baseline',fields:[]}))};
  if(canonical(current.scope)!==canonical(previous.scope)) return {comparable:false,reason:'Collection scopes differ. No appearance or disappearance claims are made across different filters.',rows:current.events.map(event=>({event,change:'baseline',fields:[]}))};
  const old=new Map(previous.events.map(e=>[e.id,e]));
  const rows=current.events.map(event=>{const before=old.get(event.id); old.delete(event.id); const fields=before?compareFields.filter(k=>canonical(event[k])!==canonical(before[k])):[]; return {event,before,change:!before?'appeared':fields.length?'changed':'unchanged',fields};});
  for (const event of old.values()) rows.push({event,before:event,change:'absent',fields:[]});
  return {comparable:true,reason:'Events are matched by DriveBC event ID. Absence from this capture does not confirm reopening.',rows};
}
export const words = value => String(value??'').replaceAll('_',' ').toLowerCase().replace(/^\w/,c=>c.toUpperCase());
export function roadNames(e) {return (e.roads??[]).map(r=>String(r.name??'')).filter(Boolean);}
export function label(e) {return roadNames(e).join(' / ') || e.headline || e.id;}
export function filterRows(rows, f={}) {
  return rows.filter(({event:e,change})=>{
    const text=[e.id,e.headline,e.description,...roadNames(e),...(e.areas??[]).map(a=>a.name)].join(' ').toLowerCase();
    return (!f.query||f.query.toLowerCase().split(/\s+/).every(q=>text.includes(q))) && (!f.road||roadNames(e).some(r=>r.toLowerCase().includes(f.road.toLowerCase()))) && (!f.area||(e.areas??[]).some(a=>a.id===f.area)) && (!f.type||e.event_type===f.type) && (!f.severity||e.severity===f.severity) && (!f.status||e.status===f.status) && (!f.since||e.updated.slice(0,10)>=f.since) && (!f.change||f.change===change);
  });
}
export function timingNotes(e) {
  return String(e.description??'').split(/(?<=[.!?])\s+|\n/).map(s=>s.trim()).filter(s=>/reopen|re-open|estimated|estimate|next update|expected|anticipated/i.test(s));
}
export function sourceLink(e) {try{const u=new URL(e.url); return u.protocol==='https:'&&u.hostname==='api.open511.gov.bc.ca'&&u.pathname.startsWith('/events/')?u.href:null;}catch{return null;}}
export function mapLink(e) {
  const g=e.geography; const p=g?.type==='Point'?g.coordinates:g?.type==='LineString'?g.coordinates?.[0]:null;
  if(!Array.isArray(p)||p.length<2||!p.slice(0,2).every(Number.isFinite)||Math.abs(p[0])>180||Math.abs(p[1])>90)return null;
  return `https://www.openstreetmap.org/?mlat=${p[1]}&mlon=${p[0]}#map=12/${p[1]}/${p[0]}`;
}
export function csv(rows, capturedAt) {
  const cell=v=>'"'+String(v??'').replace(/^[=+@\-\t\r]/,"'$&").replaceAll('"','""')+'"';
  const head=['observed_at','event_id','change','road','status','severity','source_updated','description','schedule','source_url'];
  return [head,...rows.map(r=>[capturedAt,r.event.id,r.change,roadNames(r.event).join('; '),r.event.status,r.event.severity,r.event.updated,r.event.description,JSON.stringify(r.event.schedule??{}),sourceLink(r.event)??''])].map(row=>row.map(cell).join(',')).join('\r\n');
}
