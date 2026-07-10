import config from "./config";
import { AudioPlayer, ChaimuPlayer, initAudioContext } from "./player";
import { ChaimuOpts, FetchFunction, FetchOpts } from "./types/controller";

export default class Chaimu {
  _debug = false;
  audioContext: AudioContext | undefined;

  private isDestroyed = false;
  private destructionPromise: Promise<this> | undefined;

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
    this.audioContext = initAudioContext();
    this.player =
      this.audioContext && !preferAudio ? new ChaimuPlayer(this, url) : new AudioPlayer(this, url);
    this.video = video;
  }

  async init() {
    if (this.isDestroyed) {
      throw new Error("Chaimu has been destroyed");
    }

    await this.player.init();
    if (this.video && !this.video.paused) {
      this.player.lipSync("play");
    }

    this.player.addVideoEvents();
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
