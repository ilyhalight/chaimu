import { AudioPlayer, ChaimuPlayer } from "./player.js";
import { ChaimuOpts } from "./types/controller.js";
export default class Chaimu {
    _debug: boolean;
    audioContext: AudioContext | undefined;
    player: AudioPlayer | ChaimuPlayer;
    video: HTMLVideoElement;
    constructor({ url, video, debug, fetchFn, preferAudio, }: ChaimuOpts);
    init(): Promise<void>;
    set debug(value: boolean);
    get debug(): boolean;
}
//# sourceMappingURL=client.d.ts.map