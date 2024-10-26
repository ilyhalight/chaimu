import { PitchShifter } from "soundtouchjs";
import Chaimu from "./client.js";
import { FetchFunction } from "./types/controller.js";
export declare const videoLipSyncEvents: string[];
export declare function initAudioContext(): AudioContext | undefined;
export declare class BasePlayer {
    static name: string;
    chaimu: Chaimu;
    _src: string | undefined;
    fetch: FetchFunction;
    constructor(chaimu: Chaimu, src?: string);
    init(): Promise<this>;
    clear(): Promise<this>;
    lipSync(mode?: false | string): this;
    handleVideoEvent: (event: Event) => this;
    removeVideoEvents(): this;
    addVideoEvents(): this;
    play(): Promise<unknown>;
    pause(): Promise<this>;
    get name(): string;
    set src(url: string | undefined);
    get src(): string | undefined;
    get currentSrc(): unknown;
    set volume(value: number);
    get volume(): number;
    get playbackRate(): number;
    set playbackRate(value: number);
    get currentTime(): number;
}
export declare class AudioPlayer extends BasePlayer {
    static name: string;
    audio: HTMLAudioElement;
    gainNode: GainNode | undefined;
    audioSource: MediaElementAudioSourceNode | undefined;
    constructor(chaimu: Chaimu, src?: string);
    initAudioBooster(): this;
    init(): Promise<this>;
    audioErrorHandle: (e: DOMException) => void;
    lipSync(mode?: false | string): this;
    clear(): Promise<this>;
    syncPlay(): this;
    play(): Promise<this>;
    pause(): Promise<this>;
    set src(url: string);
    get src(): string;
    get currentSrc(): string;
    set volume(value: number);
    get volume(): number;
    get playbackRate(): number;
    set playbackRate(value: number);
    get currentTime(): number;
}
export declare class ChaimuPlayer extends BasePlayer {
    static name: string;
    audioBuffer: AudioBuffer | undefined;
    sourceNode: AudioBufferSourceNode | undefined;
    gainNode: GainNode | undefined;
    audioShifter: PitchShifter | undefined;
    cleanerRunned: boolean;
    fetchAudio(): Promise<this>;
    initAudioBooster(): this;
    init(): Promise<this>;
    lipSync(mode?: false | string): this;
    reopenCtx(): Promise<this>;
    clear(): Promise<this>;
    start(): Promise<this>;
    pause(): Promise<this>;
    play(): Promise<this>;
    set src(url: string | undefined);
    get src(): string | undefined;
    get currentSrc(): AudioBuffer | undefined;
    set volume(value: number);
    get volume(): number;
    set playbackRate(value: number);
    get playbackRate(): number;
    get currentTime(): number;
}
//# sourceMappingURL=player.d.ts.map