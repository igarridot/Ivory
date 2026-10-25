import { GOALS } from './content.js';
import { SONGS, LESSONS, STAGES } from './curriculum.js';
import { darkTheme, setTheme, themePreference } from './theme.js';
import { Practice, noteName, isBlack, decodeMidi, filteredNotes, pianoNotes } from './music.js';
import { importScore } from './import.js';
import { validPersonalScore as validSong } from './score-data.js';
import { loadPersonalLibrary, persistPersonalScore } from './personal-library.js';
import { resetSongProgress, resetLessonProgress, resetAllProgress } from './progress.js';

const $ = (s, root = document) => root.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icons = {
  home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/>',
  piano:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16m6-16v16M7 4v8m6-8v8m5-8v8"/>',
  book:'<path d="M12 5v16M3 4c4-1 6 0 9 2 3-2 5-3 9-2v15c-4-1-6 0-9 2-3-2-5-3-9-2Z"/>',
  chart:'<path d="M4 4v16h17M8 15v-4m5 4V6m5 9v-6"/>',
  arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
  back:'<path d="M20 12H4m6-6-6 6 6 6"/>',
  play:'<path d="m8 4 12 8-12 8Z"/>',
  pause:'<path d="M8 4v16m8-16v16"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  close:'<path d="m6 6 12 12M6 18 18 6"/>',
  fire:'<path d="M12 3c1 5 7 7 7 12a7 7 0 1 1-14 0c0-2 1-4 3-6 0 4 3 4 3 1 1-2 1-4 1-7Z"/>',
  bluetooth:'<path d="m7 7 10 10-5 4V3l5 4L7 17"/>',
  settings:'<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="8" cy="18" r="2"/>',
  spark:'<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  upload:'<path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5"/>',
  download:'<path d="M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4"/>',
  notes:'<path d="M9 18V5l11-2v13M9 8l11-2"/><ellipse cx="6" cy="18" rx="3" ry="2"/><ellipse cx="17" cy="16" rx="3" ry="2"/>',
  hand:'<path d="M8 12V5a2 2 0 0 1 4 0v7-8a2 2 0 0 1 4 0v8-5a2 2 0 0 1 4 0v8c0 5-3 7-7 7-3 0-5-2-7-5l-3-4c-1-2 1-3 2-2l3 3"/>',
  pulse:'<path d="M2 12h5l3-8 4 16 3-8h5"/>',
  reset:'<path d="M4 10a8 8 0 1 1 1 8M4 4v6h6"/>',
};
const icon = name => `<svg class="icon" aria-hidden="true" viewBox="0 0 24 24">${icons[name] || icons.notes}</svg>`;
const action = (name, label, cls = 'secondary', extra = '') => `<button class="btn ${cls}" data-action="${name}" ${extra}>${label}</button>`;
const STORAGE = 'ivory.personal.v1';
const defaults = () => ({ version: 1, goal: 90, lessons: [], sessions: [], daySeconds: {}, imports: [], checkpoints: {}, best: {}, latency: 0, breakMinutes: 25 });
let storageProblem = false;
function load() {
  try { const raw = localStorage.getItem(STORAGE); return raw ? validateBackup(JSON.parse(raw)) : defaults(); }
  catch { storageProblem = true; return defaults(); }
}
function validateBackup(raw) {
  if (!raw || raw.version !== 1 || !Array.isArray(raw.lessons) || !Array.isArray(raw.sessions) || !Array.isArray(raw.imports) || !raw.imports.every(validSong)) throw new Error('El archivo no es una copia de Ivory válida.');
  const base = defaults();
  base.goal = [30,60,90,120].includes(raw.goal) ? raw.goal : 90;
  base.lessons = raw.lessons.filter(id=>LESSONS.some(l=>l.id === id));
  base.sessions = raw.sessions.filter(s=>s && typeof s.id==='string' && typeof s.title === 'string' && Number.isFinite(s.coverage) && Number.isFinite(s.accuracy) && Number.isFinite(s.bpm) && typeof s.date==='string' && Number.isFinite(Date.parse(s.date)) && Number.isFinite(s.seconds)).slice(-500);
  base.imports = raw.imports;
  base.daySeconds = Object.fromEntries(Object.entries(raw.daySeconds || {}).filter(([k,v])=>/^\d{4}-\d{2}-\d{2}$/.test(k) && Number.isFinite(v) && v>=0));
  base.best = Object.fromEntries(Object.entries(raw.best || {}).filter(([k,v])=>Number.isFinite(v) && v>=0 && v<=100));
  base.checkpoints = Object.fromEntries(Object.entries(raw.checkpoints || {}).filter(([k,v])=>v && Array.isArray(v.hits) && Array.isArray(v.misses) && Number.isFinite(v.correct) && Number.isFinite(v.wrong) && v.options && ['wait','rhythm'].includes(v.options.mode) && ['both','left','right'].includes(v.options.hand) && ['none','split'].includes(v.options.mapping) && ['bpm','from','to','split'].every(n=>Number.isFinite(v.options[n])) && v.options.from>=1 && v.options.to>=v.options.from && v.options.bpm>=20 && v.options.bpm<=200 && Number.isFinite(v.beat) && Number.isFinite(v.seconds)));
  base.latency = Number.isFinite(raw.latency) ? Math.max(-300,Math.min(300,raw.latency)) : 0;
  base.breakMinutes = [20,25,30].includes(raw.breakMinutes) ? raw.breakMinutes : 25;
  return base;
}
let state = load();
function save() {
  try { localStorage.setItem(STORAGE, JSON.stringify(state)); storageProblem = false; return true; }
  catch { storageProblem = true; toast('No se ha podido guardar. Exporta una copia de tu progreso desde Conexión.'); return false; }
}
let toastTimer;
function toast(text) { const el = $('#toast'); el.textContent = text; el.classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(()=>el.classList.remove('visible'),4500); }
const dayKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
const totalSeconds = () => Object.values(state.daySeconds).reduce((a,b)=>a+b,0);
const todayMinutes = () => Math.floor((state.daySeconds[dayKey()] || 0)/60);
let catalog = [], catalogError = '', serverImports=[], filesystemOnline=false, pendingFile=null, pendingReset=null;
const uniqueScores = scores => [...new Map(scores.map(score=>[score.id,score])).values()];
const scoreCache = new Map();
const allSongs = () => [...SONGS,...catalog,...uniqueScores([...state.imports,...serverImports]).reverse()];
const getSong = id => scoreCache.get(id) || allSongs().find(s=>s.id === id) || SONGS[0];
const barsCount = s => s.barStarts?.length || s.measureCount || Math.max(1,Math.ceil(Math.max(...s.notes.map(n=>n.beat+n.duration)) / (s.beatsPerBar || 4)));
function streak() {
  let n=0; const d=new Date();
  if (!(state.daySeconds[dayKey(d)] > 0)) d.setDate(d.getDate()-1);
  for(let i=0;i<3660 && state.daySeconds[dayKey(d)]>0;i++) { n++; d.setDate(d.getDate()-1); }
  return n;
}
let route='home', activeLesson=null, quizCorrect=false, libraryTab='all', searchText='', stageFilter='all', composerFilter='all', learnStage='all', libraryPage=1, navigationId=0;
const PAGE_SIZE=18;
let midi=null, input=null, connection='Sin conectar', velocity='—', lastNote='—', pedal=0;
let practice=null, currentSong=null, options=null, playing=false, demo=false, demoPlayed=new Set();
let currentBeat=-2, viewBeat=-2, frame=0, lastFrame=0, lastInput=0, practiceSeconds=0, pendingSave=0, sinceBreak=0;
let keyboardRange={min:48,max:83}, keyGeometry=new Map(), pointerNotes=new Map(), computerNotes=new Map();
let audio=null, audioVoices=new Map(), metronome=false, lastTick=-999, loop=false, noteLabels=true, wrongKey=null;
let observer=null, pendingImport=null, demoSnapshot=null, importRequest=0;

function shell(content, active=route) {
  const nav=[['home','home','Hoy'],['library','piano','Tocar'],['learn','book','Aprender'],['progress','chart','Mi progreso']];
  const titles={home:'Tu espacio de práctica',library:'Tu biblioteca',learn:'Un paso cada día',progress:'Cada avance cuenta',connection:'Tu piano, conectado',practice:'Una nota cada vez',lesson:'Aprender desde cero'};
  $('#app').innerHTML=`<div class="shell"><aside class="sidebar"><a class="brand" href="#home" aria-label="Ivory, inicio"><img src="./icon.svg" alt=""><span>ivory<span style="color:#9cae87">.</span></span></a><div class="tagline">Una nota cada día</div><nav class="nav" aria-label="Navegación principal">${nav.map(([id,ico,label])=>`<button data-route="${id}" class="${active===id?'active':''}" ${active===id?'aria-current="page"':''}>${icon(ico)}${label}</button>`).join('')}</nav><div class="sidebar-bottom"><div class="small-quote">“La música empieza<br>con una sola nota.”</div><button class="device-mini" data-route="connection">${icon('bluetooth')}<span><strong>CASIO AP-300</strong><small><i class="dot ${input?'connected':''}"></i><span id="sidebar-status">${esc(connection)}</span></small></span></button></div></aside><main class="main ${route==='practice'?'practice-main':''}" id="main"><header class="topbar"><div class="mobile-brand"><img src="./icon.svg" alt="">ivory.</div><div class="breadcrumb">${icon('notes')}<span>${titles[route] || titles.home}</span></div><div class="top-actions"><span class="subtle date" style="font-size:11px">${new Intl.DateTimeFormat('es',{weekday:'short',day:'numeric',month:'short'}).format(new Date())}</span><span class="streak" title="Días consecutivos con práctica">${icon('fire')} ${streak()} ${streak()===1?'día':'días'}</span><button class="theme-toggle" data-action="theme" aria-label="${darkTheme()?'Activar modo claro':'Activar modo oscuro'}" title="Cambiar tema">${darkTheme()?'☀':'☾'}</button><button class="avatar" data-route="connection" aria-label="Ajustes y conexión">I</button></div></header>${content}<div class="footer-note">Hecho para aprender a tu ritmo. Tu progreso se guarda en este navegador.</div></main></div>`;
}
function heading(eyebrow,title,subtitle,button='') { return `<div class="page-heading"><div><span class="eyebrow">${eyebrow}</span><h1>${title}</h1>${subtitle?`<p>${subtitle}</p>`:''}</div>${button}</div>`; }
function level(n){return `<span class="level">${[1,2,3].map(x=>`<i class="${x<=Math.ceil(n*3/8)?'on':''}"></i>`).join('')} Etapa ${n}</span>`;}
function songCard(s) {
  const progress=state.best[s.id];
  return `<article class="song-card"><button class="song-open" data-song="${esc(s.id)}"><div class="song-art ${esc(s.color || 'sage')}"><span class="music-line"></span><span class="music-line"></span><span class="music-line"></span><span class="music-line"></span><span class="art-orb"></span><span class="art-orb second"></span><span class="stage-badge">${s.stage!==undefined?esc(STAGES[s.stage].title):s.source==='MuseTrainer'?'MuseTrainer · repertorio':'Tu partitura'}</span><span class="art-note" aria-hidden="true">${s.id==='arpeggio'?'♬':'♪'}</span></div><div class="song-card-body"><h3>${esc(s.title)}</h3><p>${esc(s.composer)}</p><div class="song-card-meta">${s.stage!==undefined?level(s.stage+1):s.source==='MuseTrainer'?'Repertorio · sin nivel asignado':'Tu partitura'}<span>${progress!==undefined?`${progress}% · mejor`:`${s.source==='MuseTrainer'?s.noteCount+' notas':(s.minutes || Math.max(1,Math.round((s.notes?.length || s.noteCount || 30)/30)))+' min'}`}</span></div></div></button><div class="song-card-actions"><button class="item-reset" data-reset-song="${esc(s.id)}" aria-label="Reiniciar progreso de ${esc(s.title)}">${icon('reset')} Reiniciar progreso</button>${s.original?.url?`<a class="original-download" href="./api/scores/${encodeURIComponent(s.id)}/file">Descargar original</a>`:''}</div></article>`;
}
function goalTiles(){return `<div class="goals-strip">${GOALS.map(g=>`<button class="goal-tile" data-goal="${g.id}"><div class="goal-thumb ${g.color}" aria-hidden="true"></div><div><h3>${g.title}</h3><p>${g.subtitle}</p><div class="goal-lock">${g.id==='moonlight'?'Disponible en repertorio':'Tu objetivo · añade una partitura'}</div></div></button>`).join('')}</div>`;}
function week(){const days=[];for(let i=6;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);days.push(`<div class="week-day"><span>${new Intl.DateTimeFormat('es',{weekday:'narrow'}).format(d)}</span><span class="week-circle ${state.daySeconds[dayKey(d)]>0?'done':i===0?'today':''}">${state.daySeconds[dayKey(d)]>0?'✓':d.getDate()}</span></div>`);}return `<div class="week">${days.join('')}</div>`;}
function renderHome(){
  const resumed=Object.keys(state.checkpoints).find(id=>allSongs().some(s=>s.id===id));
  const song=getSong(resumed || 'five');
  const lesson=LESSONS.find(l=>!state.lessons.includes(l.id)) || LESSONS[0];
  shell(`${heading('TU MOMENTO CON LA MÚSICA',state.sessions.length?'Qué bien volver, Iván.':'Todo empieza aquí, Iván.','Un poco de curiosidad. Unas cuantas notas. Y tu piano.',action('connect',`${icon('bluetooth')} Conectar piano`))}<section class="hero"><div class="hero-copy"><span class="eyebrow">${resumed?'RETOMA DONDE LO DEJASTE':'TU PRIMER CAPÍTULO'}</span><h2>${resumed?esc(song.title):'No necesitas saber.<br>Solo empezar.'}</h2><p>${resumed?'Tu tempo, tu fragmento y tus avances siguen aquí. Cuando quieras, continuamos.':'Descubre el teclado y toca tus primeras notas. Te acompañamos, paso a paso.'}</p><button class="btn light" data-song="${song.id}">${icon('play')} ${resumed?'Continuar práctica':'Tocar mi primera nota'}</button><span class="hero-footnote">A tu ritmo · Sin teoría previa · Sin prisas</span></div><div class="piano-art" aria-hidden="true"><div class="orbit"></div><div class="orbit"></div><div class="orbit"></div><div class="art-keys">${Array.from({length:6},()=>'<span class="art-key"><i class="art-black"></i></span>').join('')}</div><span class="art-spark">✧</span></div></section><div class="dashboard-grid"><div><div class="section-head"><h2>Pequeños comienzos</h2><button class="btn ghost" data-route="library">Ver biblioteca ${icon('arrow')}</button></div><div class="card-grid home-songs">${SONGS.slice(0,3).map(songCard).join('')}</div><div class="section-head"><h2>La música que te mueve</h2><small>Tus objetivos</small></div>${goalTiles()}<div class="tip">${icon('spark')}<p><strong>Aprender también es escuchar.</strong> Prueba una frase, respira y vuelve a ella. Cada intento cuenta.</p></div></div><aside class="dashboard-aside"><section class="daily"><div class="daily-top"><h3>Tu objetivo de hoy</h3>${icon('clock')}</div><div class="daily-value">${todayMinutes()} <span>/ ${state.goal} min</span></div><div class="progress-track" role="progressbar" aria-label="Objetivo diario" aria-valuenow="${Math.min(todayMinutes(),state.goal)}" aria-valuemin="0" aria-valuemax="${state.goal}"><div class="progress-fill" style="width:${Math.min(100,todayMinutes()/state.goal*100)}%"></div></div><p>En bloques de ${state.breakMinutes} minutos, con descansos. Suma tiempo mientras practicas.</p>${week()}<div class="daily-footer"><span>Tu ritmo, tu camino</span><button class="link-button" data-action="daily-goal">Ajustar</button></div></section><section class="next-lesson"><div class="lesson-symbol">${icon(lesson.icon)}</div><span class="eyebrow" style="font-size:8px">TU SIGUIENTE DESCUBRIMIENTO</span><h3>${lesson.title}</h3><p>${lesson.category} · ${lesson.duration}</p><button class="btn ghost" data-lesson="${lesson.id}">Explorar lección ${icon('arrow')}</button></section></aside></div>`);
}
function libraryMatches(){
  const text=searchText.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase();
  return allSongs().filter(s=>
    (libraryTab==='all'||libraryTab==='original'&&s.kind==='exercise'||libraryTab==='catalog'&&s.source==='MuseTrainer'||libraryTab==='mine'&&s.id.startsWith('import-')) &&
    (stageFilter==='all'||s.stage===Number(stageFilter)) &&
    (composerFilter==='all'||s.composer===composerFilter) &&
    (s.title+' '+s.composer+' '+(s.description || '')).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase().includes(text));
}
function updateLibraryGrid(){
  const songs=libraryMatches(),pages=Math.max(1,Math.ceil(songs.length/PAGE_SIZE));libraryPage=Math.min(libraryPage,pages);
  $('#library-grid').innerHTML=songs.slice((libraryPage-1)*PAGE_SIZE,libraryPage*PAGE_SIZE).map(songCard).join('') || '<div class="empty">No hay resultados. Prueba otro nivel, autor o búsqueda.</div>';
  $('#catalog-count').textContent=songs.length+' resultados';
  $('#library-pagination').innerHTML=pages>1?`${action('previous-page','← Anterior','secondary',libraryPage===1?'disabled':'')}<span>${libraryPage} / ${pages}</span>${action('next-page','Siguiente →','secondary',libraryPage===pages?'disabled':'')}`:'';
}
function renderLibrary(){
  const composers=[...new Set(allSongs().map(s=>s.composer))].sort((a,b)=>a.localeCompare(b));
  shell(`${heading('TOCA LO QUE TE GUSTA','Tu próxima melodía.','Estudios desde cero, retos avanzados y repertorio para explorar.',action('import',`${icon('upload')} Importar partitura`))}<div class="library-tools"><div class="tabs" role="group" aria-label="Filtrar biblioteca">${[['all','Todo'],['original','Ejercicios'],['catalog','Repertorio · '+catalog.length],['mine','Mis partituras']].map(([id,t])=>`<button class="tab ${libraryTab===id?'active':''}" data-tab="${id}" aria-pressed="${libraryTab===id}">${t}</button>`).join('')}</div><input class="search" id="search" aria-label="Buscar en biblioteca" placeholder="Buscar una melodía…" value="${esc(searchText)}"></div><div class="filter-row"><label>Etapa<select id="stage-filter"><option value="all">Todas las etapas</option>${STAGES.map(g=>`<option value="${g.id}" ${stageFilter===String(g.id)?'selected':''}>${g.id+1}. ${g.title}</option>`).join('')}</select></label><label>Autor<select id="composer-filter"><option value="all">Todos los autores</option>${composers.map(c=>`<option value="${esc(c)}" ${composerFilter===c?'selected':''}>${esc(c)}</option>`).join('')}</select></label><span id="catalog-count" class="catalog-count"></span></div>${catalogError?`<div class="notice warm">${esc(catalogError)}</div>`:''}<div class="card-grid library-grid" id="library-grid"></div><div class="library-pagination" id="library-pagination"></div><p class="library-source">${catalog.length} archivos del <a href="https://github.com/musetrainer/library" target="_blank" rel="noopener noreferrer">repositorio musetrainer/library</a>, incluidos para practicar en local. Conservamos todas sus versiones y arreglos. La dificultad del repertorio no se asigna automáticamente.</p><div class="section-head"><h2>En tu horizonte</h2><small>Tres razones para seguir</small></div>${goalTiles()}<section class="import-box"><div><h3>De tu partitura a tu piano</h3><p>Importa MXL, MusicXML o MIDI desde tu dispositivo. También puedes usar archivos obtenidos mediante las opciones permitidas de MuseScore. Se guardan en la carpeta local de Ivory.</p><a class="source-link" href="https://musescore.com/legal/terms" target="_blank" rel="noopener noreferrer">Consultar condiciones de MuseScore</a></div>${action('import',`${icon('upload')} Añadir archivo`)}</section>`,'library');
  updateLibraryGrid();
}
function renderLearn(){
  const stages=STAGES.filter(g=>learnStage==='all'||g.id===Number(learnStage));
  shell(`${heading('DE LA PRIMERA NOTA A LA INTERPRETACIÓN','Entender. Sentir. Tocar.','Una ruta de ocho etapas para construir técnica, oído y criterio musical.')}<div class="notice">${state.lessons.length} de ${LESSONS.length} lecciones completadas · Puedes explorar cualquier etapa. Las últimas preparan el trabajo de repertorio profesional y la revisión con un profesor o mentor.</div><div class="filter-row"><label>Tu etapa<select id="learn-stage"><option value="all">Ver el camino completo</option>${STAGES.map(g=>`<option value="${g.id}" ${learnStage===String(g.id)?'selected':''}>${g.id+1}. ${g.title}</option>`).join('')}</select></label></div>${stages.map(g=>{const lessons=LESSONS.filter(l=>l.stage===g.id),done=lessons.filter(l=>state.lessons.includes(l.id)).length;return `<section><div class="stage-header"><div><span class="eyebrow">ETAPA ${g.id+1} DE ${STAGES.length}</span><h2>${g.title}</h2><p>${g.description}</p></div><span class="stage-progress">${done} / ${lessons.length} completadas</span></div><div class="unit-list">${lessons.map(l=>`<div class="unit-row"><button class="unit-card ${state.lessons.includes(l.id)?'done':''}" data-lesson="${l.id}"><span class="unit-number">${state.lessons.includes(l.id)?icon('check'):l.unit}</span><div><h3>${l.title}</h3><p>${l.category} · ${l.duration}${state.lessons.includes(l.id)?' · Completada':''}</p></div><span class="unit-arrow">${icon('arrow')}</span></button><button class="unit-reset" data-reset-lesson="${l.id}" aria-label="Reiniciar progreso de ${esc(l.title)}">${icon('reset')} Reiniciar progreso</button></div>`).join('')}</div></section>`;}).join('')}<div class="tip">${icon('hand')}<p>El progreso registra las actividades completadas. El dominio profesional necesita interpretación de obras completas y valoración externa de técnica, lectura, sonido y estilo.</p></div>`,'learn');
}
function renderLesson(){
  const l=LESSONS.find(x=>x.id===activeLesson) || LESSONS[0];quizCorrect=false;
  shell(`<article class="lesson-content"><button class="back" data-route="learn">${icon('back')} Todas las lecciones</button><span class="eyebrow">LECCIÓN ${l.unit} · ${l.category.toUpperCase()} · ${l.duration}</span><h1>${l.title}</h1><div class="lesson-body">${l.paragraphs.map(p=>`<p>${p}</p>`).join('')}</div>${l.lab?`<section class="lesson-lab"><span class="eyebrow">DEL CONCEPTO AL TECLADO</span><h3>Tu laboratorio de hoy</h3><ol>${l.lab.map(step=>`<li>${esc(step)}</li>`).join('')}</ol><p class="lesson-target"><strong>Objetivo:</strong> ${esc(l.target)}</p>${l.listen?action('listen-lesson',icon('notes')+' Escuchar ejemplo','secondary'): ''}</section>`:''}<section class="quiz"><span class="eyebrow">UN MOMENTO PARA RECORDAR</span><h3>${l.question}</h3><div class="quiz-options">${l.answers.map((a,i)=>`<button class="quiz-option" data-answer="${i}">${a}</button>`).join('')}</div><div id="quiz-feedback" class="quiz-feedback" role="status"></div></section><div class="lesson-actions">${action('complete-lesson',`${icon('check')} Completar lección`,'primary','id="complete-lesson" disabled')}<button class="btn secondary" data-song="${l.exercise}">${icon('piano')} Probar en el teclado</button></div></article>`,'learn');
}
function renderProgress(){
  const sessions=[...state.sessions].reverse();
  shell(`${heading('TU CAMINO HASTA AQUÍ','Cada nota deja huella.','Tu progreso se conserva entre sesiones en este navegador.',action('export',`${icon('download')} Guardar copia`))}<div class="stat-grid"><div class="stat-card"><small>Tiempo de práctica</small><div class="stat-value">${Math.floor(totalSeconds()/60)}<span style="font-size:15px"> min</span></div><p>Tiempo activo ante el teclado</p></div><div class="stat-card"><small>Lecciones completadas</small><div class="stat-value">${state.lessons.length}<span style="font-size:15px"> / ${LESSONS.length}</span></div><p>Ideas que ya son tuyas</p></div><div class="stat-card"><small>Prácticas terminadas</small><div class="stat-value">${sessions.length}</div><p>Pequeños pasos, cada día</p></div><div class="stat-card"><small>Días consecutivos</small><div class="stat-value">${streak()}</div><p>La constancia tiene su ritmo</p></div></div><div class="section-head"><h2>Lo que has tocado</h2><small>Hasta 500 prácticas recientes</small></div>${sessions.length?`<div class="history">${sessions.slice(0,30).map(s=>`<div class="history-row"><div><strong>${esc(s.title)}</strong><p>${new Intl.DateTimeFormat('es',{day:'numeric',month:'short'}).format(new Date(s.date))} · ${s.mode==='wait'?'A tu ritmo':'Seguir el pulso'} · ${s.bpm} BPM · ${Math.max(1,Math.round(s.seconds/60))} min${s.source==='touch'?' · Teclado virtual':''}</p></div><div class="history-score">${s.coverage}%<small style="display:block;font-family:system-ui;font-size:9px;color:#8d9780">notas acertadas</small></div></div>`).join('')}</div>`:'<div class="empty">Tu historia empieza con la primera práctica.<br>Las sesiones terminadas aparecerán aquí.</div>'}<div class="section-head"><h2>Puedes continuar</h2></div><div class="card-grid">${Object.keys(state.checkpoints).filter(id=>allSongs().some(s=>s.id===id)).map(id=>songCard(getSong(id))).join('') || '<div class="empty">No hay prácticas pendientes. Elige una melodía para empezar.</div>'}</div><div class="notice">El guardado es local: cada navegador tiene su propio progreso. Exporta una copia para cambiar de navegador o dispositivo. Borrar los datos del sitio elimina el progreso local.</div>`);
}
function renderConnection(){
  const supported=typeof navigator.requestMIDIAccess === 'function';
  shell(`${heading('UN PUENTE A TU PIANO','Conecta y deja que suene.','Casio AP-300 · Bluetooth Low Energy MIDI o USB')}<div class="connection-layout"><section class="panel"><span class="eyebrow">01 · ELIGE TU CONEXIÓN</span><h3>Tu piano, al otro lado</h3><div class="connection-status"><i class="dot ${input?'connected':''}"></i><span id="connection-status">${esc(connection)}</span></div>${!supported?'<div class="notice warm">Este navegador no ofrece acceso MIDI. En iPad, abre esta misma dirección en MIDIWeb. Añadir la web a la pantalla de inicio no habilita MIDI en Safari.</div><a class="btn secondary" href="https://apps.apple.com/app/id6757226617" target="_blank" rel="noopener noreferrer">Ver MIDIWeb en App Store ↗</a>':`${action('request-midi',`${icon('bluetooth')} ${midi?'Actualizar dispositivos':'Permitir acceso MIDI'}`,'primary')}<label class="field" style="margin-top:20px">Entrada MIDI<select id="midi-input"><option value="">Selecciona tu piano</option>${midi?[...midi.inputs.values()].map(i=>`<option value="${esc(i.id)}" ${input?.id===i.id?'selected':''}>${esc(i.name || 'Entrada MIDI')}</option>`).join(''):''}</select></label>`}<div class="monitor"><div><small>Última nota</small><strong id="monitor-note">${esc(lastNote)}</strong></div><div><small>Velocidad MIDI</small><strong id="monitor-velocity">${velocity}</strong></div><div><small>Pedal</small><strong id="monitor-pedal">${pedal>=64?'Sí':'No'}</strong></div></div><p style="margin-top:15px">Pulsa una tecla para comprobar que llegan datos. La conexión real con AP-300 y MIDIWeb necesita una prueba con tu instrumento.</p></section><section class="panel"><span class="eyebrow">02 · PREPARA EL CASIO</span><h3>Bluetooth MIDI, paso a paso</h3><ol><li>Inserta el adaptador WU-BT10 en el puerto USB-A del piano. Activa su función inalámbrica.</li><li>En MIDIWeb, abre el panel Bluetooth MIDI y selecciona <strong>WU-BT10 MIDI</strong>. Los nombres de los controles dependen de la versión del navegador.</li><li>Vuelve a esta web, permite MIDI y selecciona la entrada del piano.</li><li>Toca varias notas y comprueba el pedal en este panel.</li></ol><p>Escucha las notas directamente en el piano o con auriculares conectados a él. «WU-BT10 AUDIO» es otra conexión y no transmite las teclas.</p><div class="notice">Si hay cortes, desconecta el audio Bluetooth y otras apps MIDI. Como alternativa, utiliza el puerto USB-B del piano con un cable de datos compatible con tu iPad y un navegador que ofrezca MIDI.</div><a class="source-link" href="https://support.casio.com/global/en/emi/manual/ap-300_s200_en/chap13-sec003.html" target="_blank" rel="noopener noreferrer">Manual de conexión del AP-300 ↗</a></section><section class="panel"><span class="eyebrow">03 · A TU RITMO</span><h3>Tu rutina y sincronización</h3><label class="field">Apariencia<select id="theme-preference">${[['system','Seguir el sistema'],['light','Claro'],['dark','Oscuro']].map(([v,t])=>`<option value="${v}" ${themePreference()===v?'selected':''}>${t}</option>`).join('')}</select></label><div class="form-grid"><label class="field">Objetivo diario<select id="daily-goal">${[30,60,90,120].map(n=>`<option value="${n}" ${state.goal===n?'selected':''}>${n} minutos</option>`).join('')}</select></label><label class="field">Recordar descanso cada<select id="break-minutes">${[20,25,30].map(n=>`<option value="${n}" ${state.breakMinutes===n?'selected':''}>${n} minutos</option>`).join('')}</select></label></div><label class="field">Compensación de entrada: <span id="latency-value">${state.latency} ms</span><input type="range" id="latency" min="-300" max="300" step="10" value="${state.latency}"></label><p>En modo ritmo, un valor positivo considera que la señal llegó tarde y descuenta ese retardo. Ajusta con el metrónomo. No elimina las variaciones de Bluetooth ni mide la latencia automáticamente.</p></section><section class="panel"><span class="eyebrow">04 · CONSERVA TU CAMINO</span><h3>Tu progreso es tuyo</h3><p>Tu progreso y el punto donde pausaste se guardan en este navegador. Las partituras se conservan en el servidor local de Ivory.</p><div class="settings-actions">${action('export',`${icon('download')} Exportar copia`)}${action('restore',`${icon('upload')} Restaurar copia`)}${action('reset-global',`${icon('reset')} Restablecer progreso global`,'danger')}</div><div class="notice ${storageProblem?'warm':''}">${storageProblem?'Hay un problema con el almacenamiento. Exporta una copia antes de cerrar.':'Guardado local disponible. Exporta copias periódicas para evitar perder el progreso si se borran los datos del navegador.'}</div><p>La restauración combina lecciones y prácticas. ${filesystemOnline?'Tus partituras están guardadas en la carpeta local data/uploads/ del servidor.':'Las partituras guardadas se pueden consultar desde la caché. Inicia el servidor local para guardar nuevas subidas.'} Restablecer el progreso conserva las partituras y las preferencias.</p><p style="margin-top:12px"><a class="source-link" href="https://developer.mozilla.org/en-US/docs/Web/API/Web_MIDI_API" target="_blank" rel="noopener noreferrer">Acerca del soporte MIDI en navegadores ↗</a></p></section></div>`);
}

async function navigate(next, id){
  const ticket=++navigationId;
  if(demo)stopDemo();else stopPlayback();checkpoint();observer?.disconnect();cancelAnimationFrame(frame);
  if(next==='practice'){
    const meta=getSong(id);
    if(meta.fileUrl&&!scoreCache.has(meta.id)){
      route='library';shell('<div class="loading-card" role="status">Preparando '+esc(meta.title)+'…</div>','library');
      try{
        const response=await fetch(meta.fileUrl);if(!response.ok)throw new Error('No se pudo abrir el archivo local.');
        const data=importScore(await response.arrayBuffer(),meta.file);
        scoreCache.set(meta.id,{...meta,...data,title:meta.title,composer:meta.composer});
      }catch(error){if(ticket!==navigationId)return;route='library';renderLibrary();toast('No se pudo abrir la partitura: '+error.message);return;}
      if(ticket!==navigationId)return;
    }
    route=next;openPractice(id);
  }else{route=next;practice=null;currentSong=null;if(next==='lesson')activeLesson=id;render();}
  const hash=next==='practice'?`practice/${encodeURIComponent(currentSong.id)}`:next==='lesson'?`lesson/${encodeURIComponent(activeLesson)}`:next;
  history.replaceState(null,'','#'+hash);window.scrollTo({top:0,behavior:'instant'});
}
function render(){({home:renderHome,library:renderLibrary,learn:renderLearn,lesson:renderLesson,progress:renderProgress,connection:renderConnection}[route] || renderHome)();}
function openDialog(html){if(playing){if(demo)stopDemo();else stopPlayback();checkpoint();}const dialog=$('#dialog');dialog.innerHTML=`<div class="dialog-top"><span class="eyebrow" style="margin:0">IVORY · A TU RITMO</span><button class="close" data-action="close-dialog" aria-label="Cerrar">${icon('close')}</button></div>${html}`;if(!dialog.open)dialog.showModal();}
function closeDialog(){importRequest++;$('#dialog').close();}

function goalDialog(id){const g=GOALS.find(x=>x.id===id);openDialog(`<h2>${g.title}</h2><p>${g.subtitle}</p><div class="goal-modal-art ${g.color}" aria-hidden="true">${g.id==='moonlight'?'☾':g.id==='interstellar'?'✧':'♬'}</div><p>${g.description}</p><div class="notice">${g.label}<br>${g.id==='moonlight'?'Hay versiones de Moonlight en el repertorio incluido. Puedes buscarlas en la biblioteca.':'Puedes importar un archivo autorizado del arreglo que quieras aprender.'}</div><div class="dialog-actions">${g.id==='moonlight'?action('find-moonlight','Ver Moonlight en mi biblioteca','primary'):''}<a class="btn secondary" href="https://musescore.com/sheetmusic?text=${encodeURIComponent(g.query)}" target="_blank" rel="noopener noreferrer">Buscar en MuseScore ↗</a>${action('import','Importar mi archivo')}</div><p class="onboarding-note">No descargamos ni redistribuimos automáticamente partituras de MuseScore. La disponibilidad de formatos depende de cada partitura y de tu acceso.</p>`);}
function importDialog(){pendingImport=null;pendingFile=null;openDialog(`<h2>Tu próxima partitura.</h2><p>Importa un archivo que tengas permiso para usar. MusicXML conserva más información musical; MIDI permite practicar notas y tiempos.</p><label class="field">Archivo MXL, MusicXML o MIDI<input id="score-file" type="file" accept=".mxl,.musicxml,.xml,.mid,.midi"></label><div id="import-preview"></div><div class="notice">Hasta 5 MB. Los archivos .mxl se descomprimen aquí mismo. Para .mscz o PDF, exporta MusicXML desde un editor de partituras.</div><p class="onboarding-note">El archivo se guarda en la carpeta local de Ivory; el progreso permanece en este navegador. ${filesystemOnline?'Almacenamiento local conectado.':'El almacenamiento local no está disponible. Inicia Ivory con make up o npm run dev antes de guardar.'}</p>`);}
async function readScore(file){
  if(!file)return;
  const ticket=++importRequest;const preview=$('#import-preview');pendingImport=null;pendingFile=null;preview.textContent='Leyendo partitura…';
  try{
    if(file.size>5*1024*1024)throw new Error('El archivo supera 5 MB. Exporta un fragmento más pequeño.');
    const ext=file.name.split('.').pop().toLowerCase();
    if(!['mxl','xml','musicxml','mid','midi'].includes(ext))throw new Error('Selecciona MXL, MusicXML o MIDI.');
    const buffer=await file.arrayBuffer();if(ticket!==importRequest||!preview.isConnected||!$('#dialog').open)return;
    const data=importScore(buffer,file.name);
    pendingImport={...data,id:'import-'+crypto.randomUUID(),title:data.title&&data.title!=='Partitura importada'?data.title:file.name.replace(/\.[^.]+$/,'').replace(/_/g,' '),composer:data.composer || 'Tu partitura · MIDI',level:1,color:'lilac',minutes:5,source:'Archivo personal',fileName:file.name};
    pendingFile=file;
    if(!validSong(pendingImport))throw new Error('La estructura o los tiempos del archivo superan lo admitido por esta versión. Exporta un fragmento más sencillo.');
    preview.innerHTML=`<div class="notice">${data.notes.length} notas · ${barsCount(pendingImport)} compases · ${data.bpm} BPM${data.warnings?.length?`<br>${data.warnings.map(esc).join('<br>')}`:''}</div><label class="field">Título<input id="import-title" value="${esc(pendingImport.title)}" maxlength="140"></label><label class="field">Enlace de procedencia (opcional)<input id="import-source" type="url" placeholder="https://musescore.com/…"></label><p class="subtle">Para MIDI, la división inicial de manos usa el Do4. Puedes ajustarla antes de tocar.</p>${action('confirm-import','Guardar en mi biblioteca','primary')}`;
  }catch(e){if(ticket!==importRequest||!preview.isConnected)return;pendingImport=null;preview.innerHTML=`<div class="notice warm" role="alert">${esc(e.message)}</div>`;}
}

function optionsFor(song){return {mode:'wait',hand:'both',bpm:Math.max(20,Math.min(200,song.bpm || 60)),from:1,to:barsCount(song),mapping:'none',split:60,range:'original'};}
function selectedNotes(){let source=currentSong;if(options.mapping==='split')source={...source,notes:source.notes.map(n=>({...n,hand:n.pitch<options.split?'left':'right'}))};return pianoNotes(filteredNotes(source,options.hand,options.from,options.to),options.range==='piano');}
function openPractice(id){
  currentSong=getSong(id);const cp=state.checkpoints[currentSong.id];
  options=cp?.options?{...optionsFor(currentSong),...cp.options}:optionsFor(currentSong);
  options.from=Math.min(barsCount(currentSong),Math.max(1,options.from));options.to=Math.max(options.from,Math.min(barsCount(currentSong),options.to));
  practice=new Practice(selectedNotes(),options.mode,Math.max(.15,options.bpm/60*.22));
  currentBeat=-2;practiceSeconds=0;sinceBreak=0;
  if(cp && practice.notes.length && cp.hits.every(id=>Number.isInteger(id) && id>=0 && id<practice.notes.length)){
    for(const n of practice.notes){n.hit=cp.hits.includes(n.id);n.missed=cp.misses.includes(n.id);}
    practice.correct=practice.notes.filter(n=>n.hit).length;practice.wrong=Math.max(0,cp.wrong);
    while(practice.current?.notes.every(n=>n.hit))practice.index++;
    currentBeat=Number.isFinite(cp.beat)?cp.beat:-2;practiceSeconds=cp.seconds || 0;
  }
  if(practice.done){practice=new Practice(selectedNotes(),options.mode);currentBeat=-2;}
  viewBeat=options.mode==='wait'?(practice.current?.beat || 0)-2:currentBeat;
  renderPractice();
  if(cp)toast('Práctica recuperada. Pulsa Continuar cuando quieras.');
}
function checkpoint(){
  if(!practice || !currentSong || demo || practice.done || !practice.notes.length)return;
  state.checkpoints[currentSong.id]={options:{...options},hits:practice.notes.filter(n=>n.hit).map(n=>n.id),misses:practice.notes.filter(n=>n.missed).map(n=>n.id),correct:practice.correct,wrong:practice.wrong,beat:currentBeat,seconds:practiceSeconds,updated:new Date().toISOString()};
  save();
}
function resetPractice(){stopPlayback();practice=new Practice(selectedNotes(),options.mode,Math.max(.15,options.bpm/60*.22));currentBeat=-2;viewBeat=(options.mode==='wait'?practice.current?.beat || 0:0)-2;practiceSeconds=0;lastInput=0;demo=false;demoPlayed.clear();checkpoint();renderPractice();}
function renderPractice(){
  cancelAnimationFrame(frame);observer?.disconnect();
  const s=currentSong;
  const outside=s.notes.filter(n=>n.pitch<21||n.pitch>108).length;
  shell(`<button class="back" data-route="library">${icon('back')} Volver a la biblioteca</button><div class="practice-heading"><div><span class="eyebrow">UNA NOTA CADA VEZ</span><h1>${esc(s.title)}</h1><p>${esc(s.composer)} · ${s.source==='MuseTrainer'?'Repertorio · MuseTrainer':s.source?'Partitura importada':'Ejercicio original'}</p></div><div class="practice-top-controls">${action('connect',`${icon('bluetooth')} ${input?'Piano conectado':'Conectar'}`)}</div></div>${outside?`<div class="notice warm">${options.range==='piano'?`${outside} notas fuera del rango se trasladan una octava para poder tocarlas en el AP-300.`:`Esta partitura incluye ${outside} notas fuera de las 88 teclas del AP-300. Puedes verlas en el teclado virtual o adaptar su octava.`}${options.range!=='piano'?action('adapt-range','Adaptar al rango del piano','secondary'):''}</div>`:''}${s.instructions?`<div class="exercise-brief"><p><strong>${esc(s.description)}</strong></p><ol>${s.instructions.map(step=>`<li>${esc(step)}</li>`).join('')}</ol>${s.lessonId?`<button class="btn ghost" data-lesson="${s.lessonId}">Volver a la lección ${icon('arrow')}</button>`:''}</div>`:''}<div class="control-bar"><div class="control-group"><label for="mode">Modo</label><select id="mode"><option value="wait" ${options.mode==='wait'?'selected':''}>A mi ritmo</option><option value="rhythm" ${options.mode==='rhythm'?'selected':''}>Seguir el pulso</option></select></div><div class="control-group"><label for="hand">Manos</label><select id="hand">${[['both','Ambas'],['right','Derecha'],['left','Izquierda']].map(([v,t])=>`<option value="${v}" ${options.hand===v?'selected':''}>${t}</option>`).join('')}</select></div><div class="control-group"><label for="tempo">Tempo</label><input id="tempo" type="range" min="20" max="200" value="${options.bpm}"><span id="tempo-value">${options.bpm}</span> BPM</div><div class="control-group"><label for="measure-from">Compases</label><input id="measure-from" aria-label="Primer compás" type="number" min="1" max="${barsCount(s)}" value="${options.from}"><span>–</span><input id="measure-to" aria-label="Último compás" type="number" min="1" max="${barsCount(s)}" value="${options.to}"></div></div><div class="playground"><div class="playground-head"><span class="practice-badge"><i class="dot"></i><span id="practice-status">${input?'Piano conectado':'Teclado virtual disponible'}</span></span><span class="practice-legend"><span>D · Derecha</span><span>I · Izquierda</span></span></div><div class="roll-wrap"><canvas id="roll" aria-label="Notas descendentes. El verde indica mano derecha y el coral mano izquierda."></canvas><div class="roll-message" id="roll-message">${practice.notes.length?'Pulsa Empezar. Las notas se acercarán al teclado.':'No hay notas para esta mano en el fragmento. Cambia las manos o los compases.'}</div></div><div class="key-viewport"><div id="keyboard" class="keyboard" role="group" aria-label="Teclado de práctica"></div></div></div><div class="playground-footer"><div class="playback">${action('toggle-play',`${icon('play')} ${state.checkpoints[s.id]?'Continuar':'Empezar'}`,'primary','id="play-button"'+(!practice.notes.length?' disabled':''))}<button class="small-btn" data-action="restart" aria-label="Volver a empezar" title="Volver a empezar">${icon('reset')}</button><button class="small-btn" data-action="demo" id="demo-button" aria-label="Escuchar demostración" title="Escuchar sin puntuar">${icon('notes')}</button><button class="small-btn" data-action="metronome" id="metronome-button" aria-label="Activar metrónomo" aria-pressed="${metronome}" title="Metrónomo" style="${metronome?'background:#d7e2c3':''}">${icon('pulse')}</button><button class="small-btn" data-action="practice-settings" aria-label="Opciones de práctica" title="Más opciones">${icon('settings')}</button></div><div class="live-score"><div><small>Notas acertadas</small><strong id="score-count">${practice.correct}<span style="font-size:11px;color:#9ca68c"> / ${practice.notes.length}</span></strong></div><div><small>Precisión</small><strong id="score-accuracy">${practice.accuracy}%</strong></div></div></div><div class="practice-tip">${icon('spark')}<span>${options.mode==='wait'?'A tu ritmo: el recorrido espera a que pulses las notas correctas. Para acordes, puedes encontrar las notas poco a poco.':'Seguir el pulso: pulsa al llegar a la línea. Las notas que pasan quedan registradas como omitidas.'}<br>${input?'El piano suena por sí mismo; la app no duplica su sonido.':'Puedes explorar con el teclado táctil o las teclas A W S E D F T G Y H U J K del ordenador. Para practicar con el Casio en iPad, usa MIDIWeb.'}</span></div>${s.warnings?.length?`<div class="notice">${s.warnings.map(esc).join('<br>')}</div>`:''}${s.sourceUrl?`<p style="margin-top:18px"><a class="source-link" href="${esc(s.sourceUrl)}" target="_blank" rel="noopener noreferrer">Ver procedencia de esta partitura ↗</a></p>`:''}<div class="note-list" id="note-list"></div>`,'library');
  buildKeyboard(); updatePracticeUI(); lastFrame=performance.now(); frame=requestAnimationFrame(tickFrame);
  observer=new ResizeObserver(()=>resizeCanvas());observer.observe($('#roll'));resizeCanvas();
}
function buildKeyboard(){
  const pitches=practice.notes.map(n=>n.pitch);const min=Math.min(...pitches,60),max=Math.max(...pitches,72);
  keyboardRange.min=Math.max(0,Math.floor((min-3)/12)*12);keyboardRange.max=Math.min(127,Math.max(keyboardRange.min+23,Math.ceil((max+2)/12)*12-1));
  const whites=[];for(let p=keyboardRange.min;p<=keyboardRange.max;p++)if(!isBlack(p))whites.push(p);
  const unit=100/whites.length;keyGeometry=new Map();
  for(let p=keyboardRange.min;p<=keyboardRange.max;p++){
    const before=whites.filter(x=>x<p).length;
    keyGeometry.set(p,isBlack(p)?{x:before*unit-unit*.31,width:unit*.62}:{x:before*unit,width:unit});
  }
  $('#keyboard').innerHTML=[...keyGeometry].map(([p,g])=>`<button class="key ${isBlack(p)?'black':'white'}" data-pitch="${p}" style="left:${g.x}%;width:${g.width}%" aria-label="${noteName(p)}">${noteLabels && (!isBlack(p)||p%12===1)?esc(noteName(p,p%12===0)):''}</button>`).join('');
  const width=Math.max(570,whites.length*22);
  $('#keyboard').style.minWidth=width+'px';
  $('.roll-wrap').style.minWidth=width+'px';
  $('.key-viewport').style.minWidth=(width+24)+'px';
  $('.playground-head').style.minWidth=(width+24)+'px';
}
function resizeCanvas(){const c=$('#roll');if(!c)return;const dpr=Math.min(2,window.devicePixelRatio||1);c.width=c.clientWidth*dpr;c.height=c.clientHeight*dpr;}
function drawRoll(){
  const canvas=$('#roll');if(!canvas||!practice)return;const ctx=canvas.getContext('2d');if(!ctx)return;
  const dpr=Math.min(2,window.devicePixelRatio||1),w=canvas.width/dpr,h=canvas.height/dpr;
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
  for(const [p,g]of keyGeometry){if(isBlack(p)){ctx.fillStyle='#ffffff03';ctx.fillRect(g.x/100*w,0,g.width/100*w,h);}else{ctx.strokeStyle='#ffffff09';ctx.beginPath();ctx.moveTo(g.x/100*w,0);ctx.lineTo(g.x/100*w,h);ctx.stroke();}}
  const hitLine=h-18,pixels=58;
  const beatStart=Math.max(0,Math.floor(viewBeat));
  for(let b=beatStart;b<viewBeat+h/pixels+2;b++){const y=hitLine-(b-viewBeat)*pixels;if(y<0||y>h)continue;ctx.strokeStyle=b%(currentSong.beatsPerBar||4)===0?'#ffffff15':'#ffffff07';ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
  if(currentSong.barStarts){
    const offset=currentSong.barStarts[options.from-1] || 0;
    for(const beat of currentSong.barStarts.slice(options.from-1,options.to)){
      const y=hitLine-(beat-offset-viewBeat)*pixels;if(y<0||y>h)continue;
      ctx.strokeStyle='#b8cfa132';ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();
    }
  }
  for(const n of practice.notes){
    const g=keyGeometry.get(n.pitch);if(!g)continue;
    const y=hitLine-(n.beat-viewBeat)*pixels,nh=Math.max(17,Math.min(120,n.duration*pixels-5));
    if(y< -10||y-nh>h)continue;
    const x=g.x/100*w+2,nw=Math.max(7,g.width/100*w-4);
    ctx.globalAlpha=n.hit?.3:n.missed?.18:1;ctx.fillStyle=n.hand==='left'?'#d6a18d':'#bdcf9b';
    ctx.beginPath();ctx.roundRect(x,y-nh,nw,nh,4);ctx.fill();
    if(noteLabels&&nw>20&&nh>=20){ctx.fillStyle='#24412d';ctx.font='9px system-ui';ctx.textAlign='center';ctx.fillText((n.hand==='left'?'I ':'D ')+noteName(n.pitch,false),x+nw/2,y-8);}
    ctx.globalAlpha=1;
  }
  ctx.strokeStyle='#b9d28c';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,hitLine);ctx.lineTo(w,hitLine);ctx.stroke();
  ctx.fillStyle='#97ad79';ctx.font='8px system-ui';ctx.textAlign='right';ctx.fillText('TOCA AQUÍ',w-12,hitLine-7);
}
function updatePracticeUI(){
  if(!practice||route!=='practice')return;
  $('#score-count').innerHTML=`${practice.correct}<span style="font-size:11px;color:#9ca68c"> / ${practice.notes.length}</span>`;
  $('#score-accuracy').textContent=practice.accuracy+'%';
  const expected=options.mode==='wait'?practice.current?.notes.filter(n=>!n.hit) || []:practice.notes.filter(n=>!n.hit&&!n.missed&&Math.abs(n.beat-currentBeat)<.5);
  for(const key of document.querySelectorAll('[data-pitch]')){const pitch=+key.dataset.pitch;key.classList.toggle('expected',expected.some(n=>n.pitch===pitch));key.classList.toggle('pressed',practice.held.has(pitch));key.classList.toggle('wrong',wrongKey===pitch);}
  $('#note-list').innerHTML=expected.slice(0,10).map(n=>`<span class="note-chip ${n.hand==='left'?'left':''}">${n.hand==='left'?'I':'D'} · ${noteName(n.pitch)}</span>`).join('');
}
function checkpointBeat(){return currentBeat-state.latency/1000*options.bpm/60;}
function handleOn(pitch,vel=80,source='touch'){
  velocity=vel;lastNote=noteName(pitch);updateMonitor();
  if(source==='touch')soundOn(pitch,vel);
  if(!practice||!playing||demo||currentBeat<0&&options.mode==='rhythm')return;
  lastInput=performance.now();
  const result=practice.on(pitch,checkpointBeat());
  if(result.result==='wrong'){wrongKey=pitch;setTimeout(()=>{if(wrongKey===pitch)wrongKey=null;updatePracticeUI();},250);}
  if(source==='midi')practice.source='midi';else if(!practice.source)practice.source='touch';
  updatePracticeUI();checkpoint();
  if(practice.done)finishPractice();
}
function handleOff(pitch,source='touch'){if(source==='touch')soundOff(pitch);practice?.off(pitch);updatePracticeUI();}
function updateMonitor(){if($('#monitor-note'))$('#monitor-note').textContent=lastNote;if($('#monitor-velocity'))$('#monitor-velocity').textContent=velocity;if($('#monitor-pedal'))$('#monitor-pedal').textContent=pedal>=64?'Sí':'No';}
function tickFrame(now){
  if(route!=='practice'||!practice)return;
  const activePractice=practice;
  const dt=Math.min(.1,(now-lastFrame)/1000);lastFrame=now;
  if(playing){
    if(demo){
      currentBeat+=dt*options.bpm/60;viewBeat=currentBeat;
      practice.notes.forEach(n=>{if(n.beat<=currentBeat&&!demoPlayed.has(n.id)){demoPlayed.add(n.id);playTone(n.pitch,Math.max(.08,n.duration*60/options.bpm),.12);}});
      if(currentBeat>Math.max(...practice.notes.map(n=>n.beat+n.duration))+.6){stopDemo();toast('Ahora te toca a ti. La escucha no suma puntos.');}
    }else{
      if(options.mode==='rhythm'){currentBeat+=dt*options.bpm/60;viewBeat=currentBeat;practice.advance(checkpointBeat());if(practice.done)finishPractice();}
      else {const target=practice.current?.beat || 0;viewBeat+=(target-viewBeat)*Math.min(1,dt*5);currentBeat=target;}
      if(lastInput && now-lastInput<60000){practiceSeconds+=dt;state.daySeconds[dayKey()]=(state.daySeconds[dayKey()] || 0)+dt;sinceBreak+=dt;pendingSave+=dt;}
      if(pendingSave>=5){pendingSave=0;checkpoint();}
      if(sinceBreak>=state.breakMinutes*60){sinceBreak=0;stopPlayback();checkpoint();openDialog('<h2>Un pequeño respiro.</h2><p>Has practicado un bloque completo. Levántate, mueve las manos con suavidad y descansa unos minutos antes de continuar.</p>'+action('close-dialog','Volver cuando esté listo','primary'));}
    }
    if(metronome && playing){const beat=options.mode==='wait'?(now/1000*options.bpm/60):currentBeat;const integer=Math.floor(beat);if(integer!==lastTick){lastTick=integer;playClick(integer%(currentSong.beatsPerBar||4)===0);}}
    updatePracticeUI();
  }
  if(practice!==activePractice || route!=='practice')return;
  drawRoll();frame=requestAnimationFrame(tickFrame);
}
function stopPlayback(){
  playing=false;demoPlayed.clear();practice?.clearHeld();pointerNotes.clear();computerNotes.clear();silence();
  if($('#play-button'))$('#play-button').innerHTML=icon('play')+' Continuar';
  if($('#practice-status'))$('#practice-status').textContent=input?'Piano conectado':'Práctica en pausa';
}
function stopDemo(){stopPlayback();demo=false;if(demoSnapshot){currentBeat=demoSnapshot.beat;viewBeat=demoSnapshot.view;demoSnapshot=null;}updatePracticeUI();}
function togglePlay(){
  if(!practice?.notes.length)return;
  if(playing){if(demo)stopDemo();else stopPlayback();checkpoint();return;}
  ensureAudio();demo=false;playing=true;lastTick=-999;lastInput=0;
  $('#play-button').innerHTML=icon('pause')+' Pausar';$('#practice-status').textContent=options.mode==='wait'?'A tu ritmo':'Sigue el pulso';$('#roll-message').textContent=options.mode==='wait'?'Encuentra las notas iluminadas.':'Cuenta dos pulsos y empieza.';
}
function finishPractice(){
  if(!playing||demo)return;
  const p=practice,s=currentSong;stopPlayback();delete state.checkpoints[s.id];
  const session={id:crypto.randomUUID(),title:s.title,songId:s.id,date:new Date().toISOString(),coverage:p.coverage,accuracy:p.accuracy,mode:options.mode,bpm:options.bpm,seconds:practiceSeconds,source:p.source || 'touch',hand:options.hand,from:options.from,to:options.to};
  state.sessions.push(session);state.sessions=state.sessions.slice(-500);
  state.best[s.id]=Math.max(state.best[s.id] || 0,p.coverage);save();
  const stars=p.coverage>=95&&p.accuracy>=90?3:p.coverage>=65?2:1;
  openDialog(`<h2>${p.coverage>=80?'Una melodía más cerca.':'Cada intento cuenta.'}</h2><p>${esc(s.title)} · Compases ${options.from}–${options.to}</p><div class="result-stars" aria-label="${stars} de 3 estrellas">${'★'.repeat(stars)}${'☆'.repeat(3-stars)}</div><div class="result-stats"><div><strong>${p.coverage}%</strong><small>Notas acertadas</small></div><div><strong>${p.accuracy}%</strong><small>Precisión de pulsaciones</small></div><div><strong>${p.wrong}</strong><small>Pulsaciones extra</small></div></div><p>${options.mode==='wait'?'Has encontrado todas las notas del fragmento a tu ritmo. Prueba a reducir las pulsaciones extra o a seguir el pulso.':'Las notas que no tocaste a tiempo cuentan como omitidas. Baja el tempo o practica un fragmento más corto si lo necesitas.'}</p><div class="dialog-actions">${action('again','Volver a tocar','primary')}${action('finish-home','Guardar y volver')}</div><p class="onboarding-note">${storageProblem?'No se pudo guardar localmente. Exporta una copia desde Conexión.':'Práctica guardada en este navegador.'} Las estrellas corresponden a este fragmento y esta configuración; no certifican el dominio de la pieza completa.</p>`);
  if(loop){closeDialog();resetPractice();togglePlay();}
}
function ensureAudio(){try{if(!audio)audio=new(window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')audio.resume();}catch{toast('El sonido de la app no está disponible. El piano puede seguir sonando por sí mismo.');}return audio;}
function soundOn(pitch,vel=80){
  const ac=ensureAudio();if(!ac)return;soundOff(pitch);
  const gain=ac.createGain(),osc=ac.createOscillator();osc.type='triangle';osc.frequency.value=440*2**((pitch-69)/12);gain.gain.setValueAtTime(0,ac.currentTime);gain.gain.linearRampToValueAtTime(.16*(vel/127),ac.currentTime+.008);gain.gain.exponentialRampToValueAtTime(.035,ac.currentTime+.6);osc.connect(gain).connect(ac.destination);osc.start();audioVoices.set(pitch,{osc,gain});
}
function soundOff(pitch){const v=audioVoices.get(pitch);if(!v||!audio)return;v.gain.gain.cancelScheduledValues(audio.currentTime);v.gain.gain.setTargetAtTime(0,audio.currentTime,.045);v.osc.stop(audio.currentTime+.22);audioVoices.delete(pitch);}
function silence(){for(const p of audioVoices.keys())soundOff(p);}
function playTone(pitch,duration,volume){const ac=ensureAudio();if(!ac)return;const osc=ac.createOscillator(),gain=ac.createGain();osc.type='triangle';osc.frequency.value=440*2**((pitch-69)/12);gain.gain.setValueAtTime(volume,ac.currentTime);gain.gain.exponentialRampToValueAtTime(.001,ac.currentTime+duration);osc.connect(gain).connect(ac.destination);osc.start();osc.stop(ac.currentTime+duration+.05);}
function playClick(accent){const ac=audio;if(!ac)return;const osc=ac.createOscillator(),gain=ac.createGain();osc.frequency.value=accent?1200:850;gain.gain.setValueAtTime(.045,ac.currentTime);gain.gain.exponentialRampToValueAtTime(.001,ac.currentTime+.04);osc.connect(gain).connect(ac.destination);osc.start();osc.stop(ac.currentTime+.05);}

async function requestMidi(){
  try{
    if(!navigator.requestMIDIAccess){navigate('connection');return;}
    midi=await navigator.requestMIDIAccess({sysex:false});
    midi.onstatechange=()=>{
      if(input?.state==='disconnected'){input.onmidimessage=null;input=null;connection='Piano desconectado';stopPlayback();checkpoint();toast('Se perdió la conexión. La práctica está en pausa y guardada.');}
      if(route==='connection')renderConnection();updateConnectionLabels();
    };
    const connected=[...midi.inputs.values()].filter(i=>i.state==='connected');
    const chosen=connected.find(i=>/WU-BT10|CASIO/i.test(i.name)) || (connected.length===1?connected[0]:null);
    if(chosen)await selectInput(chosen.id);
    else toast('Acceso MIDI permitido. Conecta WU-BT10 MIDI en el navegador y elige su entrada.');
    if(route==='connection')renderConnection();
  }catch(e){toast(e.name==='NotAllowedError'?'Permiso MIDI denegado. Revisa los permisos de esta web en el navegador.':'No se pudo abrir MIDI. Comprueba el navegador y vuelve a intentarlo.');}
}
async function selectInput(id){
  if(input){input.onmidimessage=null;await input.close().catch(()=>{});}
  input=null;connection='Sin conectar';stopPlayback();
  const candidate=midi?.inputs.get(id);if(!candidate){updateConnectionLabels();return;}
  try{await candidate.open();input=candidate;connection='Piano conectado';input.onmidimessage=event=>{
    const msg=decodeMidi(event.data);if(!msg)return;
    if(msg.type==='on')handleOn(msg.pitch,msg.velocity,'midi');
    else if(msg.type==='off')handleOff(msg.pitch,'midi');
    else {pedal=msg.value;practice?.setPedal(msg.value);updateMonitor();}
  };updateConnectionLabels();toast('Entrada MIDI conectada. Toca una nota para comprobarla.');}
  catch{toast('No se pudo abrir esa entrada MIDI. Comprueba su conexión.');}
}
function updateConnectionLabels(){if($('#sidebar-status'))$('#sidebar-status').textContent=connection;if($('#connection-status'))$('#connection-status').textContent=connection;if($('#practice-status'))$('#practice-status').textContent=connection;document.querySelectorAll('.device-mini .dot,.connection-status .dot').forEach(d=>d.classList.toggle('connected',!!input));}

function exportBackup(){checkpoint();const backup={...state,imports:uniqueScores([...state.imports,...serverImports])};const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`ivory-progreso-${dayKey()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);toast('Copia exportada: guárdala en Archivos para conservar tu progreso.');}
function restoreDialog(){openDialog('<h2>Recupera tu camino.</h2><p>Elige una copia JSON exportada desde Ivory. Se combinarán tus lecciones, prácticas y partituras sin eliminar los avances actuales.</p><label class="field">Copia de progreso<input id="backup-file" type="file" accept=".json,application/json"></label><div id="backup-preview" role="status"></div>');}
async function restoreBackup(file){
  if(!file)return;
  try{
    if(file.size>10*1024*1024)throw new Error('La copia supera el límite de 10 MB.');
    const other=validateBackup(JSON.parse(await file.text()));
    const byId=(a,b)=>[...new Map([...a,...b].map(x=>[x.id,x])).values()];
    for(const score of other.imports){const stored=await persistPersonalScore(score);serverImports=byId(serverImports.filter(s=>s.id!==stored.id),[stored]);}
    state.lessons=[...new Set([...state.lessons,...other.lessons])];
    state.sessions=byId(other.sessions,state.sessions).sort((a,b)=>a.date.localeCompare(b.date)).slice(-500);
    for(const [d,s]of Object.entries(other.daySeconds))state.daySeconds[d]=Math.max(state.daySeconds[d] || 0,s);
    for(const [id,n]of Object.entries(other.best))state.best[id]=Math.max(state.best[id] || 0,n);
    for(const [id,cp]of Object.entries(other.checkpoints))if(!state.checkpoints[id] || String(cp.updated)>String(state.checkpoints[id].updated))state.checkpoints[id]=cp;
    if(save()){closeDialog();toast('Copia combinada. Tus avances están disponibles.');if(route==='connection')renderConnection();}
  }catch(e){$('#backup-preview').innerHTML=`<div class="notice warm">${esc(e.message || 'No se pudo leer la copia.')}</div>`;}
}

function confirmProgressReset(kind,id){
  const item=kind==='song'?getSong(id):kind==='lesson'?LESSONS.find(l=>l.id===id):null;
  if(kind!=='all'&&!item)return;
  pendingReset={kind,id};
  const message=kind==='song'?'Se borrarán el mejor resultado, las sesiones terminadas y el punto de práctica de esta pieza. El tiempo total practicado se conserva.':kind==='lesson'?'La lección volverá a estar pendiente. El progreso de sus ejercicios se conserva.':'Se borrarán las lecciones completadas, resultados, sesiones, puntos de práctica, tiempo acumulado y rachas de este navegador. Tus partituras y preferencias se conservan.';
  openDialog(`<h2>${kind==='all'?'¿Empezar de nuevo?':'¿Reiniciar este progreso?'}</h2>${item?`<p><strong>${esc(item.title)}</strong></p>`:''}<p>${message}</p><div class="dialog-actions">${action('apply-progress-reset',kind==='all'?'Restablecer progreso global':'Reiniciar progreso','danger')}${action('close-dialog','Cancelar')}</div>`);
}
function applyProgressReset(){
  if(!pendingReset)return;
  const {kind,id}=pendingReset,previous=state;
  const next=kind==='song'?resetSongProgress(state,id):kind==='lesson'?resetLessonProgress(state,id):resetAllProgress(state);
  state=next;if(!save()){state=previous;return;}
  if(kind==='all'||kind==='song'&&currentSong?.id===id){cancelAnimationFrame(frame);practice=null;currentSong=null;}
  pendingReset=null;closeDialog();render();toast('Progreso restablecido. Las partituras se conservan.');
}

document.addEventListener('click',async event=>{
  const el=event.target.closest('button,[data-route]');if(!el || el.disabled)return;
  if(el.dataset.resetSong){confirmProgressReset('song',el.dataset.resetSong);return;}
  if(el.dataset.resetLesson){confirmProgressReset('lesson',el.dataset.resetLesson);return;}
  if(el.dataset.route){closeDialog();navigate(el.dataset.route);return;}
  if(el.dataset.song){closeDialog();navigate('practice',el.dataset.song);return;}
  if(el.dataset.lesson){navigate('lesson',el.dataset.lesson);return;}
  if(el.dataset.goal){goalDialog(el.dataset.goal);return;}
  if(el.dataset.tab){libraryTab=el.dataset.tab;libraryPage=1;stageFilter='all';composerFilter='all';renderLibrary();return;}
  if(el.dataset.answer!==undefined){
    const l=LESSONS.find(x=>x.id===activeLesson),correct=+el.dataset.answer===l.correct;
    document.querySelectorAll('.quiz-option').forEach(x=>x.classList.remove('selected'));el.classList.add('selected');
    $('#quiz-feedback').textContent=correct?'✓ '+l.explanation:'Prueba otra vez. Vuelve a leer la explicación con calma.';
    if(correct){quizCorrect=true;$('#complete-lesson').disabled=false;}return;
  }
  switch(el.dataset.action){
    case 'reset-global':confirmProgressReset('all');break;
    case 'apply-progress-reset':applyProgressReset();break;
    case 'theme':setTheme(darkTheme()?'light':'dark');break;
    case 'find-moonlight':closeDialog();libraryTab='catalog';stageFilter='all';composerFilter='all';searchText='moonlight';libraryPage=1;navigate('library');break;
    case 'previous-page':libraryPage=Math.max(1,libraryPage-1);updateLibraryGrid();$('#library-grid').scrollIntoView({block:'start'});break;
    case 'next-page':libraryPage++;updateLibraryGrid();$('#library-grid').scrollIntoView({block:'start'});break;
    case 'listen-lesson':{const l=LESSONS.find(l=>l.id===activeLesson);if(l?.listen){ensureAudio();l.listen.notes.forEach((pitch,i)=>setTimeout(()=>playTone(pitch,.8,.15),l.listen.together?0:i*900));}break;}
    case 'connect':navigate('connection');break;
    case 'request-midi':await requestMidi();break;
    case 'close-dialog':closeDialog();break;
    case 'import':importDialog();break;
    case 'confirm-import':{
      if(!pendingImport)break;
      const url=$('#import-source').value.trim();
      if(url && !/^https?:\/\//i.test(url)){toast('El enlace de procedencia debe empezar por https:// o http://.');break;}
      pendingImport.title=$('#import-title').value.trim() || pendingImport.title;pendingImport.sourceUrl=url;
      el.disabled=true;
      try{
        const stored=await persistPersonalScore(pendingImport,pendingFile);
        serverImports=uniqueScores([...serverImports.filter(s=>s.id!==stored.id),stored]);filesystemOnline=true;
        pendingImport=null;pendingFile=null;closeDialog();libraryTab='mine';stageFilter='all';composerFilter='all';searchText='';libraryPage=1;
        navigate('library');toast('Partitura guardada en la carpeta local.');
      }catch(error){toast(error.message);el.disabled=false;}
      break;
    }
    case 'complete-lesson':if(quizCorrect){if(!state.lessons.includes(activeLesson))state.lessons.push(activeLesson);save();toast('Lección completada. Un descubrimiento más.');navigate('learn');}break;
    case 'toggle-play':togglePlay();break;
    case 'adapt-range':options.range='piano';resetPractice();toast('Octavas fuera de rango adaptadas al AP-300.');break;
    case 'restart':resetPractice();toast('Fragmento preparado desde el principio.');break;
    case 'again':closeDialog();resetPractice();break;
    case 'finish-home':closeDialog();navigate('home');break;
    case 'demo':{
      if(!practice.notes.length)break;if(demo){stopDemo();break;}stopPlayback();checkpoint();demoSnapshot={beat:currentBeat,view:viewBeat};demo=true;playing=true;currentBeat=-1;demoPlayed.clear();ensureAudio();$('#play-button').innerHTML=icon('pause')+' Detener escucha';$('#practice-status').textContent='Demostración · no puntúa';$('#roll-message').textContent='Escucha cómo se conectan las notas.';break;
    }
    case 'metronome':metronome=!metronome;ensureAudio();el.setAttribute('aria-pressed',String(metronome));el.style.background=metronome?'#d7e2c3':'';break;
    case 'practice-settings':openDialog(`<h2>Ajusta tu práctica.</h2><label class="field">Registro del instrumento<select id="range-fit"><option value="original" ${options.range!=='piano'?'selected':''}>Conservar notas originales</option><option value="piano" ${options.range==='piano'?'selected':''}>Adaptar notas fuera de las 88 teclas</option></select></label><label class="field">Asignación de manos<select id="mapping"><option value="none" ${options.mapping==='none'?'selected':''}>Usar la asignación de la partitura</option><option value="split" ${options.mapping==='split'?'selected':''}>Dividir por registro</option></select></label><label class="field">Primera nota de la mano derecha<select id="split">${[48,55,60,64,67,72].map(n=>`<option value="${n}" ${options.split===n?'selected':''}>${noteName(n)}</option>`).join('')}</select></label><label class="field">Repetir al terminar<select id="loop"><option value="no" ${!loop?'selected':''}>No</option><option value="yes" ${loop?'selected':''}>Sí, repetir el fragmento</option></select></label><label class="field">Nombres de las notas<select id="labels"><option value="yes" ${noteLabels?'selected':''}>Mostrar</option><option value="no" ${!noteLabels?'selected':''}>Ocultar</option></select></label><p>La división por registro es una ayuda: no siempre coincide con la mano adecuada. Cambiar manos o compases reinicia el fragmento.</p>${action('close-dialog','Listo','primary')}`);break;
    case 'daily-goal':openDialog(`<h2>Encuentra tu ritmo.</h2><p>Entre una y dos horas, en bloques con descansos. El objetivo acompaña tu rutina: no hace falta completarlo todos los días.</p><label class="field">Objetivo diario<select id="daily-goal">${[30,60,90,120].map(n=>`<option value="${n}" ${state.goal===n?'selected':''}>${n} minutos</option>`).join('')}</select></label><p class="subtle">Tu plan actual sugiere bloques de ${state.breakMinutes} minutos. Puedes ajustar los descansos en Conexión.</p>${action('goal-done','Guardar objetivo','primary')}`);break;
    case 'goal-done':closeDialog();renderHome();break;
    case 'export':exportBackup();break;
    case 'restore':restoreDialog();break;
  }
});
document.addEventListener('change',event=>{
  const el=event.target;
  if(el.id==='theme-preference')setTheme(el.value);
  if(el.id==='stage-filter'){stageFilter=el.value;libraryPage=1;updateLibraryGrid();}
  if(el.id==='composer-filter'){composerFilter=el.value;libraryPage=1;updateLibraryGrid();}
  if(el.id==='learn-stage'){learnStage=el.value;renderLearn();}
  if(el.id==='score-file')readScore(el.files[0]);
  if(el.id==='backup-file')restoreBackup(el.files[0]);
  if(el.id==='midi-input')selectInput(el.value);
  if(el.id==='daily-goal'){state.goal=+el.value;save();}
  if(el.id==='break-minutes'){state.breakMinutes=+el.value;save();}
  if(el.id==='latency'){state.latency=+el.value;$('#latency-value').textContent=state.latency+' ms';save();}
  if(route!=='practice')return;
  if(el.id==='loop'){loop=el.value==='yes';return;}
  if(el.id==='labels'){noteLabels=el.value==='yes';buildKeyboard();updatePracticeUI();return;}
  if(['mode','hand','tempo','measure-from','measure-to','mapping','split','range-fit'].includes(el.id)){
    if(el.id==='mode')options.mode=el.value;
    if(el.id==='hand')options.hand=el.value;
    if(el.id==='tempo')options.bpm=+el.value;
    if(el.id==='measure-from')options.from=Math.max(1,Math.min(barsCount(currentSong),Math.round(+el.value || 1)));
    if(el.id==='measure-to')options.to=Math.max(options.from,Math.min(barsCount(currentSong),Math.round(+el.value || options.from)));
    if(options.from>options.to)options.to=options.from;
    if(el.id==='mapping')options.mapping=el.value;
    if(el.id==='split')options.split=+el.value;
    if(el.id==='range-fit')options.range=el.value;
    resetPractice();
  }
});
document.addEventListener('input',event=>{
  if(event.target.id==='tempo'&&$('#tempo-value'))$('#tempo-value').textContent=event.target.value;
  if(event.target.id==='latency'&&$('#latency-value'))$('#latency-value').textContent=event.target.value+' ms';
  if(event.target.id==='search'){searchText=event.target.value;libraryPage=1;updateLibraryGrid();}
});
document.addEventListener('pointerdown',event=>{
  const key=event.target.closest('[data-pitch]');if(!key)return;event.preventDefault();key.setPointerCapture?.(event.pointerId);const pitch=+key.dataset.pitch;pointerNotes.set(event.pointerId,pitch);handleOn(pitch);
});
const pointerEnd=event=>{const pitch=pointerNotes.get(event.pointerId);if(pitch!==undefined){handleOff(pitch);pointerNotes.delete(event.pointerId);}};
document.addEventListener('pointerup',pointerEnd);document.addEventListener('pointercancel',pointerEnd);document.addEventListener('lostpointercapture',pointerEnd);
const computerMap='awsedftgyhujk';
document.addEventListener('keydown',event=>{
  if(route!=='practice'||event.repeat||event.ctrlKey||event.metaKey||event.altKey||$('#dialog').open||/INPUT|SELECT|TEXTAREA/.test(event.target.tagName))return;
  if(event.code==='Space'){event.preventDefault();togglePlay();return;}
  const i=computerMap.indexOf(event.key.toLowerCase());if(i<0||event.key.length!==1)return;
  const pitch=60+i;computerNotes.set(event.key,pitch);handleOn(pitch);
});
document.addEventListener('keyup',event=>{const pitch=computerNotes.get(event.key);if(pitch!==undefined){handleOff(pitch);computerNotes.delete(event.key);}});
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(demo)stopDemo();else stopPlayback();checkpoint();}});
window.addEventListener('pagehide',()=>{if(demo)stopDemo();else stopPlayback();checkpoint();});
window.addEventListener('blur',()=>{if(playing){if(demo)stopDemo();else stopPlayback();checkpoint();}});
$('#dialog').addEventListener('click',event=>{if(event.target===$('#dialog')){const rect=event.target.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)closeDialog();}});
function initialRoute(){const [r,id]=location.hash.slice(1).split('/');if(['home','library','learn','progress','connection'].includes(r))navigate(r);else if(r==='practice'&&allSongs().some(s=>s.id===decodeURIComponent(id || '')))navigate('practice',decodeURIComponent(id));else if(r==='lesson'&&LESSONS.some(l=>l.id===id))navigate('lesson',id);else navigate('home');}
window.addEventListener('hashchange',initialRoute);
async function bootstrap(){
  const [manifest,personal]=await Promise.allSettled([
    fetch('./scores/manifest.json').then(response=>{if(!response.ok)throw new Error();return response.json();}),
    loadPersonalLibrary(),
  ]);
  if(manifest.status==='fulfilled')catalog=manifest.value.scores;else catalogError='No se pudo cargar el repertorio incluido. Comprueba los archivos locales y recarga la página.';
  if(personal.status==='fulfilled'){
    serverImports=personal.value.scores;filesystemOnline=personal.value.online;
    if(personal.value.warnings.length)catalogError=personal.value.warnings.join(' ');
  }
  if(filesystemOnline&&state.imports.length){
    const pending=[];
    for(const score of state.imports){
      try{const stored=serverImports.find(s=>s.id===score.id)||await persistPersonalScore(score);serverImports=uniqueScores([...serverImports,stored]);}
      catch{pending.push(score);}
    }
    state.imports=pending;save();
    if(pending.length)catalogError='Algunas partituras antiguas siguen en este navegador porque no se pudieron copiar a la carpeta local.';
  }
  initialRoute();
}

bootstrap();
if(storageProblem)toast('No se pudo recuperar el guardado local. Conserva tus copias de seguridad.');
if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
