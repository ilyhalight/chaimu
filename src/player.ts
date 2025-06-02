import debug from "./debug";

import Chaimu from "./client";
import { FetchFunction, FetchOpts } from "./types/controller";

export const videoLipSyncEvents = [
  "playing",
  "ratechange",
  "play",
  "waiting",
  "pause",
  "seeked", // for work with video repeat
];

export function initAudioContext() {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  const audioContext = window.AudioContext || (window as any).webkitAudioContext;
  return audioContext ? new audioContext() : undefined;
}

/**
 * Use this class only as a parent for creating other players.
 */
export class BasePlayer {
  // if don't specify it manually, the class name will be deleted during minification
  static name = "BasePlayer";
  chaimu: Chaimu;
  fetch: FetchFunction;

  _src?: string;
  fetchOpts?: FetchOpts;

  constructor(chaimu: Chaimu, src?: string) {
    this.chaimu = chaimu;
    this._src = src;
    this.fetch = this.chaimu.fetchFn;
    this.fetchOpts = this.chaimu.fetchOpts;
  }

  async init(): Promise<this> {
    return this;
  }

  async clear(): Promise<this> {
    return this;
  }

  /**
   * Synchronizes the lipsync of the video and audio elements
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  lipSync(_mode: false | string = false) {
    return this;
  }

  handleVideoEvent = (event: Event) => {
    debug.log(`handle video ${event.type}`);
    this.lipSync(event.type);
    return this;
  };

  removeVideoEvents() {
    for (const e of videoLipSyncEvents) {
      this.chaimu.video?.removeEventListener(e, this.handleVideoEvent);
    }

    return this;
  }

  addVideoEvents() {
    for (const e of videoLipSyncEvents) {
      this.chaimu.video?.addEventListener(e, this.handleVideoEvent);
    }

    return this;
  }

  async play(): Promise<this> {
    return this;
  }

  async pause(): Promise<this> {
    return this;
  }

  get name() {
    return this.constructor.name;
  }

  set src(url: string | undefined) {
    this._src = url;
  }

  get src() {
    return this._src;
  }

  get currentSrc(): unknown {
    return this._src;
  }

  /**
   * set audio volume in range 0.00 - 1.00
   */
  set volume(_value: number) {
    return;
  }

  /**
   * return audio volume in range 0.00 - 1.00
   */
  get volume() {
    return 0;
  }

  get playbackRate() {
    return 0;
  }

  set playbackRate(_value: number) {
    return;
  }

  // eslint-disable-next-line @typescript-eslint/class-literal-property-style
  get currentTime() {
    return 0;
  }
}

export class AudioPlayer extends BasePlayer {
  static name = "AudioPlayer";
  audio!: HTMLAudioElement;
  gainNode: GainNode | undefined;
  audioSource: MediaElementAudioSourceNode | undefined;

  constructor(chaimu: Chaimu, src?: string) {
    super(chaimu, src);
    this.updateAudio();
  }

  initAudioBooster() {
    if (!this.chaimu.audioContext) {
      return this;
    }

    this.disconnectAudioNodes();

    this.gainNode = this.chaimu.audioContext.createGain();
    this.gainNode.connect(this.chaimu.audioContext.destination);
    this.audioSource = this.chaimu.audioContext.createMediaElementSource(this.audio);
    this.audioSource.connect(this.gainNode);
    return this;
  }

  private disconnectAudioNodes() {
    if (this.audioSource) {
      this.audioSource.disconnect();
      this.audioSource = undefined;
    }
    if (this.gainNode) {
      this.gainNode.disconnect();
      this.gainNode = undefined;
    }
  }

  protected updateAudio() {
    this.audio = new Audio(this.src);
    this.audio.crossOrigin = "anonymous";
    return this;
  }

  async init(): Promise<this> {
    this.updateAudio();
    this.initAudioBooster();
    return this;
  }

  audioErrorHandle = (e: DOMException) => {
    console.error("[AudioPlayer]", e);
  };

  lipSync(mode: false | string = false) {
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

  async clear(): Promise<this> {
    this.audio.pause();
    this.audio.src = "";
    this.audio.removeAttribute("src");
    this.disconnectAudioNodes();
    return this;
  }

  syncPlay() {
    debug.log("[AudioPlayer] sync play called");
    if (this.audio) {
      this.audio.play().catch(this.audioErrorHandle);
    }
    return this;
  }

  async play() {
    debug.log("[AudioPlayer] play called");
    if (this.audio) {
      await this.audio.play().catch(this.audioErrorHandle);
    }
    return this;
  }

  async pause(): Promise<this> {
    debug.log("[AudioPlayer] pause called");
    if (this.audio) {
      this.audio.pause();
    }
    return this;
  }

  set src(url: string | undefined) {
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

  set volume(value: number) {
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

  set playbackRate(value: number) {
    this.audio.playbackRate = value;
  }

  get currentTime() {
    return this.audio.currentTime;
  }
}

export class ChaimuPlayer extends BasePlayer {
  static name = "ChaimuPlayer";
  audioBuffer: AudioBuffer | undefined;

  audioElement: HTMLAudioElement | undefined;
  mediaElementSource: MediaElementAudioSourceNode | undefined;
  gainNode: GainNode | undefined;
  blobUrl: string | undefined;

  private isClearing = false;
  private isInitializing = false;
  private clearingPromise: Promise<this> | undefined;

  async fetchAudio() {
    if (!this._src) {
      throw new Error("No audio source provided");
    }
    if (!this.chaimu.audioContext) {
      throw new Error("No audio context available");
    }

    debug.log(`[ChaimuPlayer] Fetching audio from ${this._src}...`);

    let tempBlobUrl: string | undefined;

    try {
      const res = await this.fetch(this._src, this.fetchOpts);
      debug.log(`[ChaimuPlayer] Decoding fetched audio...`);
      const data = await res.arrayBuffer();

      // Create a Blob from the ArrayBuffer
      const blob = new Blob([data]);

      // Generate a Blob URL
      tempBlobUrl = URL.createObjectURL(blob);

      // Decode audio data
      this.audioBuffer = await this.chaimu.audioContext.decodeAudioData(data);

      if (this.blobUrl) {
        URL.revokeObjectURL(this.blobUrl);
      }
      this.blobUrl = tempBlobUrl;
      tempBlobUrl = undefined;
    } catch (err) {
      if (tempBlobUrl) {
        URL.revokeObjectURL(tempBlobUrl);
      }
      throw new Error(`Failed to fetch audio file, because ${(err as Error).message}`);
    }

    return this;
  }

  initAudioBooster() {
    if (!this.chaimu.audioContext) {
      return this;
    }

    this.disconnectAudioNodes();

    this.gainNode = this.chaimu.audioContext.createGain();
    return this;
  }

  private disconnectAudioNodes() {
    if (this.mediaElementSource) {
      this.mediaElementSource.disconnect();
      this.mediaElementSource = undefined;
    }
    if (this.gainNode) {
      this.gainNode.disconnect();
      this.gainNode = undefined;
    }
  }

  async init() {
    if (this.isInitializing) {
      throw new Error("Initialization already in progress");
    }

    this.isInitializing = true;

    try {
      await this.fetchAudio();
      this.initAudioBooster();
      this.createAudioElement();
      return this;
    } finally {
      this.isInitializing = false;
    }
  }

  protected createAudioElement() {
    if (!this.chaimu.audioContext) {
      throw new Error("No audio context available");
    }
    if (!this.blobUrl) {
      throw new Error("No blob URL available.");
    }

    // Create a hidden <audio> from the Blob URL, do not add to DOM
    const audio = new Audio(this.blobUrl);
    audio.crossOrigin = "anonymous";

    // Preserve pitch when changing playbackRate
    if ("preservesPitch" in audio) {
      (audio as any).preservesPitch = true;
      if ("mozPreservesPitch" in audio) (audio as any).mozPreservesPitch = true;
      if ("webkitPreservesPitch" in audio) (audio as any).webkitPreservesPitch = true;
    }

    this.audioElement = audio;

    // Create MediaElementAudioSourceNode and connect to gainNode
    this.mediaElementSource = this.chaimu.audioContext.createMediaElementSource(audio);
    this.mediaElementSource.connect(this.gainNode!);
    this.gainNode!.connect(this.chaimu.audioContext.destination);
  }

  lipSync(mode: false | string = false) {
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
      if (this.chaimu.audioContext.state !== "closed") {
        await this.chaimu.audioContext.close();
      }
    } catch (err) {
      debug.log("[ChaimuPlayer] Failed to close audio context:", err);
    }
    this.chaimu.audioContext = initAudioContext();
    return this;
  }

  async clear() {
    if (this.isClearing && this.clearingPromise) {
      return this.clearingPromise;
    }

    if (!this.chaimu.audioContext) {
      throw new Error("No audio context available");
    }

    debug.log("clear audio context");

    this.isClearing = true;

    this.clearingPromise = (async () => {
      try {
        await this.pause();

        if (this.audioElement) {
          this.audioElement.pause();
          this.audioElement = undefined;
        }

        if (this.blobUrl) {
          URL.revokeObjectURL(this.blobUrl);
          this.blobUrl = undefined;
        }

        this.disconnectAudioNodes();

        const oldVolume = this.gainNode ? this.gainNode.gain.value : 1;
        await this.reopenCtx();
        if (this.chaimu.audioContext) {
          this.initAudioBooster();
          this.volume = oldVolume;
        }

        return this;
      } finally {
        this.isClearing = false;
        this.clearingPromise = undefined;
      }
    })();

    return this.clearingPromise;
  }

  async start() {
    if (!this.chaimu.audioContext) {
      throw new Error("No audio context available");
    }

    if (!this.audioElement) {
      throw new Error("Audio element is missing");
    }

    if (this.isClearing && this.clearingPromise) {
      // fix sound duplication when activating multiple lipsync (play/playing) in a row
      debug.log("The other cleaner is still running, waiting...");
      await this.clearingPromise;
    }

    debug.log("starting audio via HTMLAudioElement");

    // Wait for audioContext to resume if suspended
    await this.play();

    if (this.chaimu.video) {
      // Sync currentTime and playbackRate from video
      this.audioElement.currentTime = this.chaimu.video.currentTime;
      this.audioElement.playbackRate = this.chaimu.video.playbackRate;
    }

    // Play audio (connected to WebAudio via MediaElementAudioSource)
    this.audioElement
      .play()
      .catch((err) => debug.log("[ChaimuPlayer] Play audioElement failed:", err));

    return this;
  }

  async pause() {
    if (!this.chaimu.audioContext) {
      throw new Error("No audio context available");
    }

    if (this.audioElement) {
      this.audioElement.pause();
    }

    if (this.chaimu.audioContext.state === "running") {
      await this.chaimu.audioContext.suspend();
    }

    return this;
  }

  async play() {
    if (!this.chaimu.audioContext) {
      throw new Error("No audio context available");
    }

    await this.chaimu.audioContext.resume();
    return this;
  }

  set src(url: string | undefined) {
    this._src = url;
  }

  get src() {
    return this._src;
  }

  get currentSrc() {
    return this._src;
  }

  set volume(value: number) {
    if (this.gainNode) {
      this.gainNode.gain.value = value;
    }
  }

  get volume() {
    return this.gainNode ? this.gainNode.gain.value : 0;
  }

  set playbackRate(value: number) {
    if (this.audioElement) {
      this.audioElement.playbackRate = value;
    }
  }

  get playbackRate() {
    return this.audioElement
      ? this.audioElement.playbackRate
      : (this.chaimu.video?.playbackRate ?? 1);
  }

  get currentTime() {
    return this.chaimu.video?.currentTime ?? 0;
  }
}
