declare module "soundtouchjs" {
  type Listener = {
    eventName: string;
    cb: Function;
  };

  class SoundTouch {
    constructor();
    _rate: number;
    _tempo: number;
    virtualPitch: number;
    virtualRate: number;
    virtualTempo: number;
    clear(): void;
    clone(): SoundTouch;
    get rate(): number;
    set rate(rate: number): void;
    set rateChange(rateChange: number): void;
    get tempo(): number;
    set tempo(tempo: number): void;
    set tempoChange(tempoChange: number): void;
    set pitch(pitch: number): void;
    set pitchOctaves(pitchOctaves: number): void;
    set pitchSemitones(pitchSemitones: number): void;
    get inputBuffer(): any;
    get outputBuffer(): any;
    calculateEffectiveRateAndTempo(): void;
    process(): void;
  }

  class PitchShifter {
    _soundtouch: SoundTouch;
    timePlayed: number;
    sourcePosition: number;
    _filter: unknown; // SimpleFilter
    _node: ScriptProcessorNode;
    tempo: number;
    rate: number;
    duration: number;
    sampleRate: number;
    listeners: Listener[];
    constructor(context: AudioContext, buffer: AudioBuffer, bufferSize: number, onEnd?: Function);
    get formattedDuration(): string;
    get formattedTimePlayed(): string;
    get percentagePlayed(): number;
    set percentagePlayed(perc: number): void;
    get node(): ScriptProcessorNode;
    set pitch(pitch: number): void;
    set pitchSemitones(semitone: number): void;
    set rate(rate: number): void;
    set tempo(tempo: number): void;
    connect(toNode: AudioNode): void;
    disconnect(): void;
    on(eventName: string, cb: Function): void;
    off(eventName: string | null): void;
  }
}
