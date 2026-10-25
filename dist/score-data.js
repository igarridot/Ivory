export function validPersonalScore(song) {
  return !!(song && typeof song.id === 'string' && /^import-[a-zA-Z0-9-]{1,80}$/.test(song.id) && typeof song.title === 'string' &&
    (!song.sourceUrl || typeof song.sourceUrl==='string' && /^https?:\/\//i.test(song.sourceUrl)) &&
    Array.isArray(song.notes) && song.notes.length>0 && song.notes.length<=20000 &&
    song.notes.every(n=>Number.isInteger(n.pitch)&&n.pitch>=0&&n.pitch<=127&&Number.isFinite(n.beat)&&n.beat>=0&&n.beat<=100000&&Number.isFinite(n.duration)&&n.duration>0&&n.duration<=10000&&['left','right'].includes(n.hand)) &&
    Number.isFinite(song.bpm)&&song.bpm>0&&Number.isFinite(song.beatsPerBar)&&song.beatsPerBar>0&&song.beatsPerBar<=32 &&
    (!song.barStarts || Array.isArray(song.barStarts)&&song.barStarts.length<=20000&&song.barStarts.every((b,i)=>Number.isFinite(b)&&b>=0&&b<=100000&&(i===0||b>song.barStarts[i-1]))));
}

export function normalizePersonalScore(score) {
  if(!validPersonalScore(score))throw new Error('La partitura contiene datos no válidos.');
  const result={};
  for(const key of ['id','title','composer','notes','bpm','beatsPerBar','barStarts','barMeters','measureNumbers','endBeat','warnings','color','minutes','sourceUrl','fileName']){
    if(score[key]!==undefined)result[key]=score[key];
  }
  result.title=score.title.slice(0,500);
  result.composer=typeof score.composer==='string'?score.composer.slice(0,500):'Autor no indicado';
  result.notes=score.notes.map(({pitch,beat,duration,hand})=>({pitch,beat,duration,hand}));
  result.color=['sage','rose','sand','lilac','blue'].includes(score.color)?score.color:'lilac';
  result.warnings=Array.isArray(score.warnings)?score.warnings.filter(w=>typeof w==='string').map(w=>w.slice(0,1000)).slice(0,20):[];
  result.source='Archivo personal';
  return result;
}
