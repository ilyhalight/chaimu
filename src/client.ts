import config from "./config";
import { AudioPlayer, ChaimuPlayer, initAudioContext } from "./player";
import { ChaimuOpts, FetchFunction, FetchOpts } from "./types/controller";

export default class Chaimu {
  _debug = false;
  audioContext: AudioContext | undefined;

  private isDestroyed = false;
  private isInitialized = false;
  private destructionPromise: Promise<this> | undefined;
  private lifecycleQueue: Promise<void> | undefined;

  player: AudioPlayer | ChaimuPlayer;
  video: HTMLVideoElement;
  fetchFn: FetchFunction;
  fetchOpts: FetchOpts;

  constructor({
    url,
    video,
    debug = false,
    fetchFn = config.fetchFn,
    fetchOpts = {},
    preferAudio = false,
  }: ChaimuOpts) {
    this._debug = config.debug = debug;
    this.fetchFn = fetchFn;
    this.fetchOpts = fetchOpts;
    this.video = video;
    this.audioContext = initAudioContext();
    this.player =
      this.audioContext && !preferAudio ? new ChaimuPlayer(this, url) : new AudioPlayer(this, url);
  }

  private assertActive() {
    if (this.isDestroyed) {
      throw new Error("Chaimu has been destroyed");
    }
  }

  private isVideoPlaying(video: HTMLVideoElement) {
    return (
      !video.paused &&
      !video.ended &&
      video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA
    );
  }

  private enqueueLifecycle<T>(operation: () => PromiseLike<T> | T): Promise<T> {
    let result: Promise<T>;
    if (this.lifecycleQueue) {
      result = this.lifecycleQueue.then(operation);
    } else {
      try {
        result = Promise.resolve(operation());
      } catch (error) {
        result = Promise.reject(error instanceof Error ? error : new Error(String(error)));
      }
    }

    const lifecycleQueue = result.then(
      () => undefined,
      () => undefined,
    );
    this.lifecycleQueue = lifecycleQueue;
    void lifecycleQueue.then(() => {
      if (this.lifecycleQueue === lifecycleQueue) {
        this.lifecycleQueue = undefined;
      }
    });
    return result;
  }

  async init() {
    this.assertActive();

    return this.enqueueLifecycle(async () => {
      this.assertActive();
      await this.player.init();
      if (this.isDestroyed) {
        return;
      }
      if (this.isVideoPlaying(this.video)) {
        this.player.lipSync("playing");
      }

      this.player.addVideoEvents();
      this.isInitialized = true;
    });
  }

  async replaceVideo(newVideo: HTMLVideoElement): Promise<this> {
    this.assertActive();

    return this.enqueueLifecycle(() => {
      this.assertActive();
      if (newVideo === this.video) {
        return this;
      }

      this.player.removeVideoEvents();
      this.video = newVideo;

      if (this.isInitialized) {
        this.player.addVideoEvents();
      }

      this.player.lipSync(this.isVideoPlaying(newVideo) ? "seeked" : "pause");
      return this;
    });
  }

  destroy(): Promise<this> {
    if (this.destructionPromise) {
      return this.destructionPromise;
    }

    this.isDestroyed = true;
    this.destructionPromise = this.player.destroy().then(() => this);
    return this.destructionPromise;
  }

  get destroyed() {
    return this.isDestroyed;
  }

  set debug(value: boolean) {
    this._debug = config.debug = value;
  }

  get debug() {
    return this._debug;
  }
}
