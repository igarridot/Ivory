export function resetSongProgress(state, id) {
  const checkpoints={...state.checkpoints},best={...state.best};
  delete checkpoints[id];delete best[id];
  return {...state,checkpoints,best,sessions:state.sessions.filter(s=>s.songId!==id)};
}
export function resetLessonProgress(state,id){
  return {...state,lessons:state.lessons.filter(l=>l!==id)};
}
export function resetAllProgress(state){
  return {...state,lessons:[],sessions:[],daySeconds:{},checkpoints:{},best:{}};
}
