import config from "./config.js";
import { AudioPlayer, ChaimuPlayer, initAudioContext } from "./player.js";
export default class Chaimu {
    _debug = false;
    audioContext;
    player;
    video;
    constructor({ url, video, debug = false, fetchFn = config.fetchFn, preferAudio = false, }) {
        this._debug = config.debug = debug;
        config.fetchFn = fetchFn;
        this.audioContext = initAudioContext();
        this.player =
            this.audioContext && !preferAudio ? new ChaimuPlayer(this, url) : new AudioPlayer(this, url);
        this.video = video;
    }
    async init() {
        await this.player.init();
        if (this.video && !this.video.paused) {
            this.player.lipSync("play");
        }
        this.player.addVideoEvents();
    }
    set debug(value) {
        this._debug = config.debug = value;
    }
    get debug() {
        return this._debug;
    }
}
