// Recordings: Salamander Grand Piano, Alexander Holm, CC BY 3.0.
// Attribution and the unmodified source files are in audio/salamander/.
export const PIANO_SAMPLES = Object.freeze(Array.from({length:30},(_,i)=>{
  const pitch=21+i*3,name={0:'C',3:'Ds',6:'Fs',9:'A'}[pitch%12],file=`${name}${Math.floor(pitch/12)-1}.mp3`;
  return Object.freeze({pitch,file,url:`./audio/salamander/${file}`});
}));

export function sampleForPitch(pitch){
  if(!Number.isInteger(pitch)||pitch<0||pitch>127)throw new RangeError('Nota MIDI no válida.');
  return PIANO_SAMPLES[Math.max(0,Math.min(29,Math.round((pitch-21)/3)))];
}

export class GrandPiano {
  constructor(context,{fetchSample=globalThis.fetch,maxVoices=64}={}){
    this.context=context;this.fetchSample=(url,options)=>fetchSample(url,options);this.maxVoices=maxVoices;
    this.buffers=new Map();this.requests=new Map();this.voices=new Set();this.held=new Map();this.loading=null;
    this.output=context.createGain();this.output.gain.value=.7;
    const compressor=context.createDynamicsCompressor();
    compressor.threshold.value=-14;compressor.knee.value=20;compressor.ratio.value=4;
    compressor.attack.value=.003;compressor.release.value=.18;
    this.output.connect(compressor).connect(context.destination);
  }
  get ready(){return this.buffers.size===PIANO_SAMPLES.length;}
  async loadSample(sample){
    if(this.buffers.has(sample.pitch))return;
    if(!this.requests.has(sample.pitch)){
      const request=(async()=>{
        const response=await this.fetchSample(new URL(sample.url,import.meta.url),{signal:AbortSignal.timeout(15000)});
        if(!response.ok)throw new Error('No se pudo cargar '+sample.file+'.');
        const buffer=await this.context.decodeAudioData(await response.arrayBuffer());
        this.buffers.set(sample.pitch,buffer);
      })().finally(()=>this.requests.delete(sample.pitch));
      this.requests.set(sample.pitch,request);
    }
    await this.requests.get(sample.pitch);
  }
  async load(){
    if(this.ready)return;
    if(!this.loading){
      let next=0;
      // Bound decoding concurrency to avoid a memory/CPU burst on tablets.
      this.loading=Promise.all(Array.from({length:4},async()=>{
        while(next<PIANO_SAMPLES.length)await this.loadSample(PIANO_SAMPLES[next++]);
      })).finally(()=>{this.loading=null;});
    }
    await this.loading;
  }
  play(pitch,duration=.8,velocity=80,when=this.context.currentTime){
    const sample=sampleForPitch(pitch),buffer=this.buffers.get(sample.pitch);
    if(!buffer)return null;
    const strength=Math.max(0,Math.min(127,Number.isFinite(velocity)?velocity:80))/127;
    if(!strength)return null;
    const start=Math.max(this.context.currentTime,when),source=this.context.createBufferSource(),gain=this.context.createGain();
    source.buffer=buffer;source.playbackRate.value=2**((pitch-sample.pitch)/12);
    const level=.5*strength**1.5;
    gain.gain.setValueAtTime(level,start);source.connect(gain).connect(this.output);
    const voice={source,gain,level,start,releaseAt:null,releaseDuration:0,ended:false};
    source.onended=()=>{
      voice.ended=true;this.voices.delete(voice);source.disconnect();gain.disconnect();
      if(this.held.get(pitch)?.voice===voice)this.held.delete(pitch);
    };
    if(this.voices.size>=this.maxVoices){
      const oldest=this.voices.values().next().value;
      this.release(oldest,this.context.currentTime,.005);this.voices.delete(oldest);
    }
    this.voices.add(voice);source.start(start);
    if(Number.isFinite(duration))this.release(voice,start+Math.max(.02,duration));
    return voice;
  }
  release(voice,when=this.context.currentTime,tail=.18){
    if(!voice||voice.ended)return;
    const at=Math.max(this.context.currentTime,when);
    let level=at<voice.start?0:voice.level;
    if(voice.releaseAt!==null&&at>=voice.releaseAt)level*=Math.max(0,1-(at-voice.releaseAt)/voice.releaseDuration);
    voice.gain.gain.cancelScheduledValues(at);voice.gain.gain.setValueAtTime(level,at);
    voice.gain.gain.linearRampToValueAtTime(0,at+tail);voice.source.stop(at+tail);
    voice.releaseAt=at;voice.releaseDuration=tail;
  }
  async noteOn(pitch,velocity=80){
    sampleForPitch(pitch);this.noteOff(pitch);
    if(velocity<=0)return;
    const entry={voice:null};this.held.set(pitch,entry);
    try{
      if(!this.ready)await this.load();
      // A key released while samples load must never sound afterwards.
      if(this.held.get(pitch)!==entry)return;
      entry.voice=this.play(pitch,Infinity,velocity);
    }catch(error){if(this.held.get(pitch)===entry)this.held.delete(pitch);throw error;}
  }
  noteOff(pitch){const entry=this.held.get(pitch);this.held.delete(pitch);if(entry?.voice)this.release(entry.voice);}
  allNotesOff(){this.held.clear();for(const voice of this.voices)this.release(voice,this.context.currentTime,.025);}
}
