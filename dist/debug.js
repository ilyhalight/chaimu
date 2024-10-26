import config from "./config.js";
export default {
    log: (...text) => {
        if (!config.debug) {
            return;
        }
        return console.log(`%c✦ chaimu.js v${config.version} ✦`, "background: #000; color: #fff; padding: 0 8px", ...text);
    },
};
