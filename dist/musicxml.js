const fail = text => { throw new Error(text); };
const children = (el, name) => [...el.children].filter(c => c.localName === name);
const first = (el, name) => children(el, name)[0];
const value = (el, selector, fallback = '') => el.querySelector(selector)?.textContent?.trim() ?? fallback;
const endingNumbers = text => (text || '').split(/[, ]+/).flatMap(n => {
  if (/^\d+-\d+$/.test(n)) { const [a,b] = n.split('-').map(Number); return Array.from({length:Math.min(8,b-a+1)},(_,i)=>a+i); }
  return /^\d+$/.test(n) ? [Number(n)] : [];
});

export function measureOrder(measures) {
  const order = [], stack = [], starts = new Map(), passes = new Map();
  let nested = false;
  for (let i=0; i<measures.length; i++) {
    if(measures[i].forward) { if(stack.length) nested=true; stack.push(i); }
    if(measures[i].backward) starts.set(i,stack.pop() ?? 0);
  }
  if(nested) return { order: measures.map((_,i)=>i), nested:true };
  let i=0, pass=1;
  const limit=Math.max(100,measures.length*16);
  for(let steps=0; i<measures.length; steps++) {
    if(steps>limit) fail('Las repeticiones no se pueden resolver de forma segura. Exporta la partitura desplegada.');
    const m=measures[i];
    if(m.forward) {
      const end=[...starts].find(([end,start])=>start===i)?.[0];
      pass=end===undefined?1:(passes.get(end) || 1);
    }
    const include=!m.endings.length || m.endings.includes(pass);
    if(include) order.push(i);
    if(include && m.backward) {
      const current=passes.get(i) || 1;
      const times=Math.min(8,Math.max(2,m.times || 2));
      if(current<times) { passes.set(i,current+1);pass=current+1;i=starts.get(i) ?? 0;continue; }
    }
    i++;
  }
  return { order, nested:false };
}

export function importMusicXML(text) {
  if (/<!ENTITY|<!DOCTYPE[^>]*\[/i.test(text)) fail('El MusicXML contiene entidades no compatibles.');
  text=text.replace(/<!DOCTYPE[^>]*>/gi,'');
  const doc=new DOMParser().parseFromString(text,'application/xml');
  if(doc.querySelector('parsererror'))fail('El MusicXML no es válido.');
  if(doc.documentElement.localName!=='score-partwise')fail('Exporta el MusicXML como score-partwise.');
  const parts=children(doc.documentElement,'part');
  if(!parts.length)fail('La partitura no contiene partes musicales.');
  const count=Math.max(...parts.map(p=>children(p,'measure').length));
  if(count>10000)fail('La partitura supera 10.000 compases.');
  const measures=Array.from({length:count},()=>({notes:[],duration:0,meter:4,forward:false,backward:false,endings:[]}));
  const warnings=[];
  const tempos=[...doc.querySelectorAll('sound[tempo]')].map(n=>Number(n.getAttribute('tempo'))).filter(n=>Number.isFinite(n)&&n>0);
  const metronome=Number(value(doc,'metronome per-minute',80));
  const bpm=Math.round(tempos[0] || (Number.isFinite(metronome)&&metronome>0?metronome:80));
  const multiTempo=new Set(tempos).size>1;
  let hasGrace=false,hasOrnaments=false,hasJumps=false,hasTies=false,roundedTuplets=false;
  const partStaffCounts=parts.map(p=>Math.max(1,...[...p.querySelectorAll('staves, staff')].map(n=>Number(n.textContent)||1)));
  const partMean=parts.map(p=>{const ps=[...p.querySelectorAll('pitch')].map(n=>(Number(value(n,'octave',4))+1)*12+({C:0,D:2,E:4,F:5,G:7,A:9,B:11}[value(n,'step','C')]||0));return ps.length?ps.reduce((a,b)=>a+b,0)/ps.length:60;});
  let notesTotal=0;
  for(let pi=0;pi<parts.length;pi++) {
    let divisions=1,meter=4,transpose=0,activeEnding=[];
    const list=children(parts[pi],'measure');
    for(let mi=0;mi<list.length;mi++) {
      const el=list[mi],m=measures[mi],attrs=first(el,'attributes');
      if(attrs) {
        divisions=Number(value(attrs,'divisions',divisions));
        if(!(divisions>0 && Number.isFinite(divisions)))fail('Divisiones MusicXML no válidas.');
        const time=first(attrs,'time');
        if(time && !time.querySelector('senza-misura')) {
          const beats=value(time,'beats','4').split('+').reduce((sum,n)=>sum+Number(n),0);
          meter=beats*4/Number(value(time,'beat-type',4));
          if(!(meter>0&&meter<=32))fail('La partitura contiene un compás no compatible.');
        }
        if(first(attrs,'transpose'))transpose=Number(value(attrs,'transpose chromatic',0))+12*Number(value(attrs,'transpose octave-change',0));
      }
      if(pi===0) {
        m.meter=meter;
        for(const bar of children(el,'barline')) {
          const repeat=first(bar,'repeat');
          if(repeat?.getAttribute('direction')==='forward')m.forward=true;
          if(repeat?.getAttribute('direction')==='backward'){m.backward=true;m.times=Number(repeat.getAttribute('times'))||2;}
          const ending=first(bar,'ending');
          if(ending?.getAttribute('type')==='start')activeEnding=endingNumbers(ending.getAttribute('number'));
        }
        m.endings=[...activeEnding];
      }
      let cursor=0,maximum=0,lastOnset=0;
      for(const item of el.children) {
        if(['backup','forward'].includes(item.localName)) {
          cursor+=Number(value(item,'duration',0))/divisions*(item.localName==='backup'?-1:1);
          if(cursor < -.01 || !Number.isFinite(cursor))fail('Tiempo MusicXML no válido.');
          cursor=Math.max(0,cursor);maximum=Math.max(maximum,cursor);continue;
        }
        if(item.localName!=='note')continue;
        if(first(item,'grace')){hasGrace=true;continue;}
        if(item.querySelector('ornaments'))hasOrnaments=true;
        let duration=Number(value(item,'duration',0))/divisions;
        if(!Number.isFinite(duration)||duration<0)fail('Duración MusicXML no válida.');
        // Some exporters round tuplet durations to integer ticks (e.g. 29 notes
        // in 16 eighths). Recover the exact ratio when it differs by <= one tick.
        const modification=first(item,'time-modification');
        if(modification) {
          const unit={maxima:32,long:16,breve:8,whole:4,half:2,quarter:1,eighth:.5,'16th':.25,'32nd':.125,'64th':.0625,'128th':.03125}[value(item,'type')];
          const actual=Number(value(modification,'actual-notes',0)),normal=Number(value(modification,'normal-notes',0));
          const dots=children(item,'dot').length;
          const exact=unit*(2-2**(-dots))*normal/actual;
          if(exact>0&&Number.isFinite(exact)&&Math.abs(exact-duration)<=1/divisions+.0000001){roundedTuplets ||= Math.abs(exact-duration)>.000001;duration=exact;}
        }
        if(!duration && first(item,'rest')?.getAttribute('measure')==='yes')duration=meter;
        const chord=!!first(item,'chord'),onset=chord?lastOnset:cursor;
        if(!chord){lastOnset=cursor;cursor+=duration;}
        maximum=Math.max(maximum,onset+duration,cursor);
        const pitchEl=first(item,'pitch');if(!pitchEl)continue;
        const step=value(pitchEl,'step','C'),alter=Number(value(pitchEl,'alter',0)),octave=Number(value(pitchEl,'octave',4));
        if(!['C','D','E','F','G','A','B'].includes(step)||!Number.isInteger(alter))fail('Altura MusicXML no compatible.');
        const pitch=(octave+1)*12+({C:0,D:2,E:4,F:5,G:7,A:9,B:11}[step])+alter+transpose;
        if(!Number.isInteger(pitch)||pitch<0||pitch>127)fail('Altura fuera del rango MIDI.');
        const staff=Number(value(item,'staff',1));
        const hand=partStaffCounts[pi]>1?(staff>1?'left':'right'):(parts.length>1?(partMean[pi]<60?'left':'right'):(pitch<60?'left':'right'));
        const tieStart=!!item.querySelector('tie[type="start"], tied[type="start"]'),tieStop=!!item.querySelector('tie[type="stop"], tied[type="stop"]');
        hasTies ||= tieStart || tieStop;
        m.notes.push({pitch,beat:onset,duration:Math.max(.02,duration),hand,tieStart,tieStop,key:`${pi}:${staff}:${value(item,'voice',1)}:${pitch}`});
        if(++notesTotal>20000)fail('La partitura supera 20.000 notas escritas.');
      }
      const implicit=el.getAttribute('implicit')==='yes';
      m.duration=Math.max(m.duration,implicit||el.querySelector('senza-misura')?maximum:Math.max(meter,maximum));
      if(pi===0 && [...el.querySelectorAll('ending')].some(n=>['stop','discontinue'].includes(n.getAttribute('type'))))activeEnding=[];
    }
  }
  hasJumps=[...doc.querySelectorAll('sound')].some(n=>['dacapo','dalsegno','tocoda'].some(a=>n.hasAttribute(a)));
  const sequence=measureOrder(measures);
  const expanded=sequence.order.length!==measures.length || new Set(sequence.order).size!==sequence.order.length;
  const notes=[],barStarts=[],barMeters=[],measureNumbers=[],ties=new Map();
  let offset=0;
  for(let oi=0;oi<sequence.order.length;oi++) {
    const mi=sequence.order[oi],m=measures[mi];
    if(oi && mi!==sequence.order[oi-1]+1)ties.clear();
    barStarts.push(offset);barMeters.push(m.meter);measureNumbers.push(mi+1);
    for(const n of m.notes) {
      const previous=ties.get(n.key);
      if(hasTies && n.tieStop && previous && Math.abs(previous.beat+previous.duration-(offset+n.beat))<.02)previous.duration+=n.duration;
      else {const note={pitch:n.pitch,beat:offset+n.beat,duration:n.duration,hand:n.hand};notes.push(note);if(n.tieStart)ties.set(n.key,note);}
      if(n.tieStop&&!n.tieStart)ties.delete(n.key);
    }
    offset+=m.duration || m.meter;
    if(notes.length>20000)fail('La partitura desplegada supera 20.000 notas.');
  }
  if(!notes.length)fail('No se encontraron notas con altura en la partitura.');
  if(notes.some(n=>!Number.isFinite(n.beat)||n.beat>100000||!Number.isFinite(n.duration)||n.duration>10000))fail('Los tiempos de esta partitura no son compatibles.');
  if(expanded)warnings.push('Repeticiones y casillas desplegadas: los números de práctica siguen el recorrido, no la numeración impresa.');
  if(sequence.nested)warnings.push('Hay repeticiones anidadas: se practica una vez cada compás en orden escrito.');
  if(hasJumps)warnings.push('Los saltos D.C., D.S. y coda no se ejecutan: revisa el recorrido con la partitura original.');
  if(multiTempo)warnings.push('Se utiliza un tempo de práctica fijo; los cambios de tempo originales no se reproducen.');
  if(hasGrace||hasOrnaments)warnings.push('Las notas de gracia y los adornos no se desarrollan en la evaluación.');
  if(roundedTuplets)warnings.push('Se han compensado redondeos de los grupos irregulares usando la proporción escrita.');
  if(new Set(barMeters).size>1)warnings.push('Se conservan los límites de los compases aunque cambie su duración. El pulso de práctica se expresa en negras.');
  return {title:value(doc,'work-title',value(doc,'movement-title','Partitura importada')),composer:value(doc,'creator[type="composer"]','Autor no indicado'),notes:notes.sort((a,b)=>a.beat-b.beat||a.pitch-b.pitch),bpm,beatsPerBar:barMeters[0]||4,barStarts,barMeters,measureNumbers,endBeat:offset,warnings};
}
