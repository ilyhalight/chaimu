import config from "./config";

export default {
  log: (...text: unknown[]) => {
    if (!config.debug) {
      return;
    }

    return console.log(
      `%c✦ chaimu.js v${config.version} ✦`,
      "background: #000; color: #fff; padding: 0 8px",
      ...text,
    );
  },
};
