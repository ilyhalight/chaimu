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
  "ended",
  "timeupdate",
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
  protected _currentSrc?: string;
  fetchOpts?: FetchOpts;

  protected isDestroyed = false;
  protected destructionPromise: Promise<this> | undefined;
  protected storedVolume = 1;
  protected lifecycleGeneration = 0;
  private lifecycleQueue: Promise<void> = Promise.resolve();
  private videoWithEvents: HTMLVideoElement | undefined;

  constructor(chaimu: Chaimu, src?: string) {
    this.chaimu = chaimu;
    this._src = src;
    this.fetch = this.chaimu.fetchFn;
    this.fetchOpts = this.chaimu.fetchOpts;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async init(): Promise<this> {
    return this;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async clear(): Promise<this> {
    return this;
  }

  destroy(): Promise<this> {
    if (this.destructionPromise) {
      return this.destructionPromise;
    }

    this.isDestroyed = true;
    this.removeVideoEvents();
    this.destructionPromise = (async () => {
      await this.clear();
      await this.closeAudioContext();
      return this;
    })();
    return this.destructionPromise;
  }

  protected assertActive() {
    if (this.isDestroyed) {
      throw new Error(`${this.name} has been destroyed`);
    }
  }

  protected async closeAudioContext() {
    const audioContext = this.chaimu.audioContext;
    if (!audioContext) {
      return;
    }

    try {
      if (audioContext.state !== "closed") {
        await audioContext.close();
      }
    } finally {
      if (this.chaimu.audioContext === audioContext) {
        this.chaimu.audioContext = undefined;
      }
    }
  }

  protected unloadMediaElement(mediaElement: HTMLMediaElement | undefined) {
    if (!mediaElement) {
      return;
    }

    mediaElement.pause();
    mediaElement.src = "";
    mediaElement.removeAttribute("src");
    mediaElement.load();
  }

  protected composeFetchSignal(lifecycleSignal?: AbortSignal) {
    const callerSignal = this.fetchOpts?.signal;
    if (!(callerSignal instanceof AbortSignal)) {
      return lifecycleSignal;
    }
    if (!lifecycleSignal || callerSignal === lifecycleSignal) {
      return callerSignal;
    }

    return AbortSignal.any([callerSignal, lifecycleSignal]);
  }

  protected enqueueLifecycle(operation: () => Promise<this>): Promise<this> {
    const result = this.lifecycleQueue.then(operation);
    this.lifecycleQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  protected isVideoPlaying() {
    const video = this.chaimu.video;
    return (
      !video.paused &&
      !video.ended &&
      video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA
    );
  }

  /**
   * Synchronizes the lipsync of the video and audio elements
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  lipSync(_mode: false | string = false) {
    return this;
  }

  handleVideoEvent = (event: Event) => {
    if (this.isDestroyed || event.currentTarget !== this.chaimu.video) {
      return this;
    }

    debug.log(`handle video ${event.type}`);
    if (event.type === "timeupdate") {
      if (this.playbackRate !== this.chaimu.video.playbackRate) {
        this.playbackRate = this.chaimu.video.playbackRate;
      }
      return this;
    }

    this.lipSync(event.type);
    return this;
  };

  audioErrorHandle = (error: unknown) => {
    console.error(`[${this.name}]`, error);
  };

  removeVideoEvents(video = this.videoWithEvents ?? this.chaimu.video) {
    for (const e of videoLipSyncEvents) {
      video.removeEventListener(e, this.handleVideoEvent);
    }
    if (this.videoWithEvents === video) {
      this.videoWithEvents = undefined;
    }

    return this;
  }

  addVideoEvents(video = this.chaimu.video) {
    this.assertActive();
    if (this.videoWithEvents === video) {
      return this;
    }
    if (this.videoWithEvents) {
      this.removeVideoEvents(this.videoWithEvents);
    }
    for (const e of videoLipSyncEvents) {
      video.addEventListener(e, this.handleVideoEvent);
    }
    this.videoWithEvents = video;

    return this;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async play(): Promise<this> {
    return this;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
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

  get currentSrc(): string | undefined {
    return this._currentSrc;
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
    this.gainNode.gain.value = this.storedVolume;
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
    this.lifecycleGeneration += 1;
    this.disconnectAudioNodes();
    this.unloadMediaElement(this.audio);
    this.audio = new Audio(this.src);
    this.audio.crossOrigin = "anonymous";
    this.audio.playbackRate = this.chaimu.video.playbackRate;
    if (!this.chaimu.audioContext) {
      this.audio.volume = this.storedVolume;
    }
    this._currentSrc = this.src;
    return this;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async init(): Promise<this> {
    this.assertActive();
    this.updateAudio();
    this.initAudioBooster();
    return this;
  }

  lipSync(mode: false | string = false) {
    debug.log("[AudioPlayer] lipsync video", this.chaimu.video);
    if (!this.chaimu.video) {
      return this;
    }

    if (this._currentSrc) {
      this.audio.currentTime = this.chaimu.video.currentTime;
      this.audio.playbackRate = this.chaimu.video.playbackRate;
    }
    if (!mode) {
      debug.log("[AudioPlayer] lipsync mode isn't set");
      return this;
    }

    debug.log(`[AudioPlayer] lipsync mode is ${mode}`);
    switch (mode) {
      case "playing": {
        if (!this.chaimu.video.paused && !this.chaimu.video.ended) {
          this.syncPlay();
        }
        return this;
      }
      case "seeked": {
        if (this.isVideoPlaying()) {
          this.syncPlay();
        } else {
          void this.pause().catch(this.audioErrorHandle);
        }
        return this;
      }
      case "pause":
      case "waiting":
      case "ended": {
        void this.pause().catch(this.audioErrorHandle);
        return this;
      }
      default: {
        return this;
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async clear(): Promise<this> {
    this.lifecycleGeneration += 1;
    this.disconnectAudioNodes();
    this.unloadMediaElement(this.audio);
    this._currentSrc = undefined;
    return this;
  }

  syncPlay() {
    debug.log("[AudioPlayer] sync play called");
    void this.play().catch(this.audioErrorHandle);
    return this;
  }

  async play() {
    this.assertActive();
    debug.log("[AudioPlayer] play called");
    if (!this._src) {
      throw new Error("No audio source provided");
    }

    const generation = this.lifecycleGeneration;
    return this.enqueueLifecycle(async () => {
      if (generation !== this.lifecycleGeneration) {
        return this;
      }
      if (this.chaimu.audioContext?.state === "suspended") {
        await this.chaimu.audioContext.resume();
      }
      if (generation !== this.lifecycleGeneration) {
        return this;
      }

      await this.audio.play();
      return this;
    });
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async pause(): Promise<this> {
    this.assertActive();
    debug.log("[AudioPlayer] pause called");
    this.lifecycleGeneration += 1;
    this.audio.pause();
    return this;
  }

  set src(url: string | undefined) {
    this.assertActive();
    this._src = url;
    if (!url) {
      void this.clear();
      return;
    }

    this.updateAudio();
    if (this.chaimu.audioContext) {
      this.initAudioBooster();
    }
  }

  get src() {
    return this._src;
  }

  get currentSrc() {
    return this._currentSrc;
  }

  set volume(value: number) {
    this.storedVolume = value;
    if (this.gainNode) {
      this.gainNode.gain.value = value;
      return;
    }

    this.audio.volume = value;
  }

  get volume() {
    return this.storedVolume;
  }

  get playbackRate() {
    return this.audio.playbackRate;
  }

  set playbackRate(value: number) {
    this.audio.playbackRate = value;
  }

  get currentTime() {
    return this._currentSrc ? this.audio.currentTime : 0;
  }
}

export class ChaimuPlayer extends BasePlayer {
  static name = "ChaimuPlayer";
  audioBuffer: AudioBuffer | undefined;

  audioElement: HTMLAudioElement | undefined;
  mediaElementSource: MediaElementAudioSourceNode | undefined;
  gainNode: GainNode | undefined;
  blobUrl: string | undefined;

  private initializationAbortController: AbortController | undefined;
  private cancelInitialization: (() => void) | undefined;
  private clearingPromise: Promise<this> | undefined;
  private playbackGeneration = 0;
  private sourceGeneration = 0;

  async fetchAudio(signal?: AbortSignal) {
    if (!this._src) {
      throw new Error("No audio source provided");
    }
    if (!this.chaimu.audioContext) {
      throw new Error("No audio context available");
    }

    debug.log(`[ChaimuPlayer] Fetching audio from ${this._src}...`);

    let tempBlobUrl: string | undefined;

    try {
      const fetchSignal = this.composeFetchSignal(signal);
      const res = await this.fetch(this._src, { ...this.fetchOpts, signal: fetchSignal });
      fetchSignal?.throwIfAborted();
      debug.log(`[ChaimuPlayer] Decoding fetched audio...`);
      const data = await res.arrayBuffer();
      fetchSignal?.throwIfAborted();

      // Create a Blob from the ArrayBuffer
      const blob = new Blob([data]);

      // Generate a Blob URL
      tempBlobUrl = URL.createObjectURL(blob);

      // Decode audio data
      const audioBuffer = await this.chaimu.audioContext.decodeAudioData(data);
      fetchSignal?.throwIfAborted();

      if (this.blobUrl) {
        URL.revokeObjectURL(this.blobUrl);
      }
      this.audioBuffer = audioBuffer;
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
    this.gainNode.gain.value = this.storedVolume;
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

  private releaseMediaResources() {
    this.disconnectAudioNodes();
    this.unloadMediaElement(this.audioElement);
    this.audioElement = undefined;
    this.audioBuffer = undefined;

    if (this.blobUrl) {
      URL.revokeObjectURL(this.blobUrl);
      this.blobUrl = undefined;
    }

    this._currentSrc = undefined;
  }

  async init() {
    this.assertActive();
    if (!this._src) {
      return this;
    }
    const generation = this.lifecycleGeneration;

    return this.enqueueLifecycle(async () => {
      if (generation !== this.lifecycleGeneration) {
        return this;
      }

      this.releaseMediaResources();

      const abortController = new AbortController();
      let cancelInitialization: () => void;
      const cancellation = new Promise<"cancelled">((resolve) => {
        cancelInitialization = () => resolve("cancelled");
      });
      this.initializationAbortController = abortController;
      this.cancelInitialization = cancelInitialization!;

      try {
        const initialization = this.fetchAudio(abortController.signal).then(
          () => "initialized" as const,
        );
        const result = await Promise.race([initialization, cancellation]);

        if (result === "cancelled" || generation !== this.lifecycleGeneration) {
          return this;
        }

        this.initAudioBooster();
        this.createAudioElement();
        return this;
      } finally {
        if (this.initializationAbortController === abortController) {
          this.initializationAbortController = undefined;
          this.cancelInitialization = undefined;
        }
      }
    });
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
    audio.playbackRate = this.chaimu.video.playbackRate;

    // Preserve pitch when changing playbackRate
    if ("preservesPitch" in audio) {
      audio.preservesPitch = true;
      if ("mozPreservesPitch" in audio) audio.mozPreservesPitch = true;
      if ("webkitPreservesPitch" in audio) audio.webkitPreservesPitch = true;
    }

    this.audioElement = audio;

    // Create MediaElementAudioSourceNode and connect to gainNode
    this.mediaElementSource = this.chaimu.audioContext.createMediaElementSource(audio);
    this.mediaElementSource.connect(this.gainNode!);
    this.gainNode!.connect(this.chaimu.audioContext.destination);
    this._currentSrc = this._src;
  }

  lipSync(mode: false | string = false) {
    debug.log("[ChaimuPlayer] lipsync video", this.chaimu.video, this);
    if (!this.chaimu.video) {
      return this;
    }

    if (this.audioElement) {
      this.audioElement.currentTime = this.chaimu.video.currentTime;
      this.audioElement.playbackRate = this.chaimu.video.playbackRate;
    }

    if (!mode) {
      debug.log("[ChaimuPlayer] lipsync mode isn't set");
      return this;
    }

    debug.log(`[ChaimuPlayer] lipsync mode is ${mode}`);
    switch (mode) {
      case "playing": {
        if (!this.chaimu.video.paused && !this.chaimu.video.ended) {
          void this.play().catch(this.audioErrorHandle);
        }
        return this;
      }
      case "seeked": {
        if (this.isVideoPlaying()) {
          void this.play().catch(this.audioErrorHandle);
        } else {
          void this.pause().catch(this.audioErrorHandle);
        }
        return this;
      }
      case "pause":
      case "waiting":
      case "ended": {
        void this.pause().catch(this.audioErrorHandle);
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
    if (this.isDestroyed) {
      return (await this.destructionPromise) ?? this;
    }

    this.sourceGeneration += 1;
    this._currentSrc = undefined;

    if (this.clearingPromise) {
      return this.clearingPromise;
    }

    if (!this.chaimu.audioContext) {
      throw new Error("No audio context available");
    }

    debug.log("clear audio context");

    this.lifecycleGeneration += 1;
    this.initializationAbortController?.abort();
    this.cancelInitialization?.();

    const clearingPromise = this.enqueueLifecycle(async () => {
      this.releaseMediaResources();
      await this.reopenCtx();

      return this;
    });
    this.clearingPromise = clearingPromise;

    try {
      return await clearingPromise;
    } finally {
      if (this.clearingPromise === clearingPromise) {
        this.clearingPromise = undefined;
      }
    }
  }

  destroy(): Promise<this> {
    if (this.destructionPromise) {
      return this.destructionPromise;
    }

    this.isDestroyed = true;
    this.removeVideoEvents();
    this._currentSrc = undefined;
    this.sourceGeneration += 1;
    this.lifecycleGeneration += 1;
    this.initializationAbortController?.abort();
    this.cancelInitialization?.();

    this.destructionPromise = this.enqueueLifecycle(async () => {
      this.releaseMediaResources();
      await this.closeAudioContext();
      return this;
    });
    return this.destructionPromise;
  }

  async play() {
    this.assertActive();
    if (!this._src) {
      throw new Error("No audio source provided");
    }
    if (this.clearingPromise) {
      await this.clearingPromise;
    }

    const generation = this.lifecycleGeneration;
    const playbackGeneration = this.playbackGeneration;

    return this.enqueueLifecycle(async () => {
      if (
        generation !== this.lifecycleGeneration ||
        playbackGeneration !== this.playbackGeneration
      ) {
        return this;
      }
      if (!this.chaimu.audioContext) {
        throw new Error("No audio context available");
      }
      if (!this.audioElement) {
        throw new Error("Audio element is missing");
      }

      debug.log("starting audio via HTMLAudioElement");

      if (this.chaimu.audioContext.state === "suspended") {
        await this.chaimu.audioContext.resume();
      }

      if (
        generation !== this.lifecycleGeneration ||
        playbackGeneration !== this.playbackGeneration
      ) {
        return this;
      }

      const audioElement = this.audioElement;
      if (!audioElement) {
        return this;
      }

      if (this.chaimu.video) {
        // Sync currentTime and playbackRate from video
        audioElement.currentTime = this.chaimu.video.currentTime;
        audioElement.playbackRate = this.chaimu.video.playbackRate;
      }

      // Play audio (connected to WebAudio via MediaElementAudioSource)
      await audioElement.play();

      return this;
    });
  }

  start() {
    return this.play();
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async pause(): Promise<this> {
    this.assertActive();
    this.playbackGeneration += 1;
    if (this.audioElement) {
      this.audioElement.pause();
    }
    return this;
  }

  set src(url: string | undefined) {
    this.assertActive();
    this._src = url;

    const clearing = this.clear();
    const sourceGeneration = this.sourceGeneration;

    if (!url) {
      void clearing.catch((err) => debug.log("[ChaimuPlayer] Failed to clear source:", err));
      return;
    }

    void clearing
      .then(() => {
        if (sourceGeneration !== this.sourceGeneration || this._src !== url) {
          return this;
        }

        return this.init();
      })
      .catch((err) => debug.log("[ChaimuPlayer] Failed to replace source:", err));
  }

  get src() {
    return this._src;
  }

  get currentSrc() {
    return this._currentSrc;
  }

  set volume(value: number) {
    this.storedVolume = value;
    if (this.gainNode) {
      this.gainNode.gain.value = value;
    }
  }

  get volume() {
    return this.storedVolume;
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
    return this.audioElement?.currentTime ?? 0;
  }
}
