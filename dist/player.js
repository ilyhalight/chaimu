import { PitchShifter } from "soundtouchjs";
import debug from "./debug.js";
import config from "./config.js";
export const videoLipSyncEvents = [
    "playing",
    "ratechange",
    "play",
    "waiting",
    "pause",
    "seeked",
];
export function initAudioContext() {
    const audioContext = window.AudioContext || window.webkitAudioContext;
    return audioContext ? new audioContext() : undefined;
}
export class BasePlayer {
    static name = "BasePlayer";
    chaimu;
    _src;
    fetch;
    constructor(chaimu, src) {
        this.chaimu = chaimu;
        this._src = src;
        this.fetch = config.fetchFn;
    }
    async init() {
        return new Promise((resolve) => {
            return resolve(this);
        });
    }
    clear() {
        return new Promise((resolve) => {
            return resolve(this);
        });
    }
    lipSync(mode = false) {
        return this;
    }
    handleVideoEvent = (event) => {
        debug.log(`handle video ${event.type}`);
        this.lipSync(event.type);
        return this;
    };
    removeVideoEvents() {
        for (const e of videoLipSyncEvents) {
            this.chaimu.video.removeEventListener(e, this.handleVideoEvent);
        }
        return this;
    }
    addVideoEvents() {
        for (const e of videoLipSyncEvents) {
            this.chaimu.video.addEventListener(e, this.handleVideoEvent);
        }
        return this;
    }
    async play() {
        return new Promise((resolve) => {
            return resolve(this);
        });
    }
    async pause() {
        return new Promise((resolve) => {
            return resolve(this);
        });
    }
    get name() {
        return this.constructor.name;
    }
    set src(url) {
        this._src = url;
    }
    get src() {
        return this._src;
    }
    get currentSrc() {
        return this._src;
    }
    set volume(value) {
        return;
    }
    get volume() {
        return 0;
    }
    get playbackRate() {
        return 0;
    }
    set playbackRate(value) {
        return;
    }
    get currentTime() {
        return 0;
    }
}
export class AudioPlayer extends BasePlayer {
    static name = "AudioPlayer";
    audio;
    gainNode;
    audioSource;
    constructor(chaimu, src) {
        super(chaimu, src);
        this.audio = new Audio(src);
        this.audio.crossOrigin = "anonymous";
    }
    initAudioBooster() {
        if (!this.chaimu.audioContext) {
            return this;
        }
        if (this.gainNode && this.audioSource) {
            this.audioSource.disconnect(this.gainNode);
            this.gainNode.disconnect();
        }
        this.gainNode = this.chaimu.audioContext.createGain();
        this.gainNode.connect(this.chaimu.audioContext.destination);
        this.audioSource = this.chaimu.audioContext.createMediaElementSource(this.audio);
        this.audioSource.connect(this.gainNode);
        return this;
    }
    async init() {
        return new Promise((resolve) => {
            this.initAudioBooster();
            return resolve(this);
        });
    }
    audioErrorHandle = (e) => {
        console.error("[AudioPlayer]", e);
    };
    lipSync(mode = false) {
        debug.log("[AudioPlayer] lipsync video", this.chaimu.video);
        if (!this.chaimu.video) {
            return this;
        }
        this.audio.currentTime = this.chaimu.video.currentTime;
        this.audio.playbackRate = this.chaimu.video.playbackRate;
        if (!mode) {
            debug.log("[AudioPlayer] lipsync mode isn't set");
            return this;
        }
        debug.log(`[AudioPlayer] lipsync mode is ${mode}`);
        switch (mode) {
            case "play":
            case "playing":
            case "seeked": {
                if (!this.chaimu.video.paused) {
                    this.syncPlay();
                }
                return this;
            }
            case "pause":
            case "waiting": {
                void this.pause();
                return this;
            }
            default: {
                return this;
            }
        }
    }
    async clear() {
        return new Promise((resolve) => {
            this.audio.pause();
            this.audio.src = "";
            this.audio.removeAttribute("src");
            return resolve(this);
        });
    }
    syncPlay() {
        debug.log("[AudioPlayer] sync play called");
        this.audio.play().catch(this.audioErrorHandle);
        return this;
    }
    async play() {
        debug.log("[AudioPlayer] play called");
        await this.audio.play().catch(this.audioErrorHandle);
        return this;
    }
    async pause() {
        return new Promise((resolve) => {
            debug.log("[AudioPlayer] pause called");
            this.audio.pause();
            return resolve(this);
        });
    }
    set src(url) {
        this._src = url;
        if (!url) {
            void this.clear();
            return;
        }
        this.audio.src = url;
    }
    get src() {
        return this._src;
    }
    get currentSrc() {
        return this.audio.currentSrc;
    }
    set volume(value) {
        if (this.gainNode) {
            this.gainNode.gain.value = value;
            return;
        }
        this.audio.volume = value;
    }
    get volume() {
        return this.gainNode ? this.gainNode.gain.value : this.audio.volume;
    }
    get playbackRate() {
        return this.audio.playbackRate;
    }
    set playbackRate(value) {
        this.audio.playbackRate = value;
    }
    get currentTime() {
        return this.audio.currentTime;
    }
}
export class ChaimuPlayer extends BasePlayer {
    static name = "ChaimuPlayer";
    audioBuffer;
    sourceNode;
    gainNode;
    audioShifter;
    cleanerRunned = false;
    async fetchAudio() {
        if (!this._src) {
            throw new Error("No audio source provided");
        }
        if (!this.chaimu.audioContext) {
            throw new Error("No audio context available");
        }
        debug.log(`[ChaimuPlayer] Fetching audio from ${this._src}...`);
        try {
            const res = await this.fetch(this._src);
            debug.log(`[ChaimuPlayer] Decoding fetched audio...`);
            const data = await res.arrayBuffer();
            this.audioBuffer = await this.chaimu.audioContext.decodeAudioData(data);
        }
        catch (err) {
            throw new Error(`Failed to fetch audio file, because ${err.message}`);
        }
        return this;
    }
    initAudioBooster() {
        if (!this.chaimu.audioContext) {
            return this;
        }
        if (this.gainNode) {
            this.gainNode.disconnect();
        }
        this.gainNode = this.chaimu.audioContext.createGain();
        return this;
    }
    async init() {
        await this.fetchAudio();
        this.initAudioBooster();
        return this;
    }
    lipSync(mode = false) {
        debug.log("[ChaimuPlayer] lipsync video", this.chaimu.video, this);
        if (!this.chaimu.video) {
            return this;
        }
        if (!mode) {
            debug.log("[ChaimuPlayer] lipsync mode isn't set");
            return this;
        }
        debug.log(`[ChaimuPlayer] lipsync mode is ${mode}`);
        switch (mode) {
            case "play":
            case "playing":
            case "ratechange":
            case "seeked": {
                if (!this.chaimu.video.paused) {
                    void this.start();
                }
                return this;
            }
            case "pause":
            case "waiting": {
                void this.pause();
                return this;
            }
            default: {
                return this;
            }
        }
    }
    async reopenCtx() {
        if (!this.chaimu.audioContext) {
            throw new Error("No audio context available");
        }
        try {
            await this.chaimu.audioContext.close();
        }
        catch {
        }
        return this;
    }
    async clear() {
        if (!this.chaimu.audioContext) {
            throw new Error("No audio context available");
        }
        debug.log("clear audio context");
        this.cleanerRunned = true;
        await this.pause();
        if (!this.gainNode) {
            this.cleanerRunned = false;
            return this;
        }
        if (this.sourceNode) {
            this.sourceNode.stop();
            this.sourceNode.disconnect(this.gainNode);
            this.sourceNode = undefined;
        }
        if (this.audioShifter) {
            this.audioShifter._node.disconnect(this.gainNode);
            this.audioShifter = undefined;
        }
        this.gainNode.disconnect();
        const oldVolume = this.volume;
        this.gainNode = undefined;
        await this.reopenCtx();
        this.chaimu.audioContext = initAudioContext();
        this.initAudioBooster();
        this.volume = oldVolume;
        this.cleanerRunned = false;
        return this;
    }
    async start() {
        if (!this.chaimu.audioContext) {
            throw new Error("No audio context available");
        }
        if (!this.audioBuffer) {
            throw new Error("The player isn't initialized");
        }
        if (!this.gainNode ||
            (this.audioShifter && this.audioShifter.duration < this.chaimu.video.currentTime)) {
            debug.log("Skip starting player");
            return this;
        }
        if (this.cleanerRunned) {
            debug.log("The other cleaner is still running, waiting...");
            return this;
        }
        debug.log("starting audio");
        await this.clear();
        await this.play();
        this.audioShifter = new PitchShifter(this.chaimu.audioContext, this.audioBuffer, 1024);
        this.audioShifter.tempo = this.chaimu.video.playbackRate;
        this.audioShifter.percentagePlayed = this.chaimu.video.currentTime / this.audioShifter.duration;
        this.sourceNode = this.chaimu.audioContext.createBufferSource();
        this.sourceNode.buffer = null;
        this.sourceNode.connect(this.gainNode);
        this.audioShifter.connect(this.gainNode);
        this.gainNode.connect(this.chaimu.audioContext.destination);
        this.sourceNode.start(undefined, this.chaimu.video.currentTime);
        return this;
    }
    async pause() {
        if (!this.chaimu.audioContext) {
            throw new Error("No audio context available");
        }
        if (this.chaimu.audioContext.state !== "running") {
            return this;
        }
        await this.chaimu.audioContext.suspend();
        return this;
    }
    async play() {
        if (!this.chaimu.audioContext) {
            throw new Error("No audio context available");
        }
        await this.chaimu.audioContext.resume();
        return this;
    }
    set src(url) {
        this._src = url;
    }
    get src() {
        return this._src;
    }
    get currentSrc() {
        return this._src;
    }
    set volume(value) {
        if (this.gainNode) {
            this.gainNode.gain.value = value;
        }
    }
    get volume() {
        return this.gainNode ? this.gainNode.gain.value : 0;
    }
    set playbackRate(value) {
        if (!this.audioShifter) {
            throw new Error("No audio source available");
        }
        this.audioShifter.pitch = value;
    }
    get playbackRate() {
        return this.audioShifter?._soundtouch?.tempo ?? 0;
    }
    get currentTime() {
        return this.chaimu.video.currentTime;
    }
}
