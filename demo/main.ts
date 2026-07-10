import Chaimu from "../src/index";

const mediaUrl = "https://s3.toil.cc/vot/translated.mp3";

function select<T extends Element>(selector: string) {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing demo element: ${selector}`);
  }
  return element;
}

const video = select<HTMLVideoElement>("#demo-video");
const videoStage = select<HTMLElement>("#video-stage");
const startLayer = select<HTMLElement>("#start-layer");
const startButton = select<HTMLButtonElement>("#start-button");
const playButton = select<HTMLButtonElement>("#play-button");
const playLabel = select<HTMLElement>("#play-label");
const stateBadge = select<HTMLElement>("#state-badge");
const stateText = select<HTMLElement>("#state-text");
const timeline = select<HTMLInputElement>("#timeline");
const timecode = select<HTMLOutputElement>("#timecode");
const rate = select<HTMLSelectElement>("#rate");
const fullscreenButton = select<HTMLButtonElement>("#fullscreen-button");
const engineValue = select<HTMLElement>("#engine-value");
const videoTimeValue = select<HTMLElement>("#video-time-value");
const driftValue = select<HTMLElement>("#drift-value");
const volume = select<HTMLInputElement>("#volume");
const volumeValue = select<HTMLOutputElement>("#volume-value");

let client: Chaimu | undefined;
let initialization: Promise<Chaimu> | undefined;
let animationFrame: number | undefined;

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds)) {
    return "00:00";
  }

  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function setState(text: string, tone: "idle" | "active" | "error" = "idle") {
  stateText.textContent = text;
  stateBadge.dataset.tone = tone;
}

function setStartLoading(loading: boolean) {
  startButton.disabled = loading;
  startButton.lastChild!.textContent = loading ? " Loading audio" : " Start live demo";
}

function updateTelemetry() {
  animationFrame = undefined;

  const duration = video.duration;
  const progress = Number.isFinite(duration) && duration > 0 ? video.currentTime / duration : 0;
  timeline.value = String(Math.round(progress * 1000));
  timeline.style.setProperty("--progress", `${progress * 100}%`);
  timecode.value = `${formatTime(video.currentTime)} / ${formatTime(duration)}`;
  videoTimeValue.textContent = `${video.currentTime.toFixed(3)} s`;

  if (client?.player.currentSrc) {
    const drift = client.player.currentTime - video.currentTime;
    driftValue.textContent = `${drift >= 0 ? "+" : ""}${(drift * 1000).toFixed(0)} ms`;
  } else {
    driftValue.textContent = client ? "Loading" : "Waiting";
  }

  if (!video.paused && !video.ended) {
    animationFrame = requestAnimationFrame(updateTelemetry);
  }
}

function scheduleTelemetry() {
  animationFrame ??= requestAnimationFrame(updateTelemetry);
}

function updateVolume() {
  const nextVolume = Number(volume.value) / 100;
  volumeValue.value = `${volume.value}%`;
  volume.style.setProperty("--progress", `${volume.value}%`);
  if (client) {
    client.player.volume = nextVolume;
  }
}

function describeError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function ensureClient() {
  if (client) {
    return Promise.resolve(client);
  }
  if (initialization) {
    return initialization;
  }

  setState("Loading audio");
  setStartLoading(true);
  const nextClient = new Chaimu({ debug: true, url: mediaUrl, video });
  nextClient.player.volume = Number(volume.value) / 100;
  client = nextClient;
  engineValue.textContent = nextClient.player.name;

  initialization = nextClient
    .init()
    .then(() => {
      setState(video.paused ? "Ready" : "Playing", video.paused ? "idle" : "active");
      startLayer.classList.add("is-hidden");
      scheduleTelemetry();
      return nextClient;
    })
    .catch(async (error: unknown) => {
      client = undefined;
      engineValue.textContent = "Initialization failed";
      setState("Audio error", "error");
      startButton.lastChild!.textContent = " Try again";
      await nextClient.destroy();
      throw error;
    })
    .finally(() => {
      initialization = undefined;
      setStartLoading(false);
    });

  return initialization;
}

async function togglePlayback() {
  if (!video.paused) {
    video.pause();
    return;
  }

  try {
    const ready = ensureClient();
    await video.play();
    await ready;
  } catch (error) {
    video.pause();
    console.error("Unable to start the Chaimu demo:", error);
    setState(describeError(error), "error");
  }
}

startButton.addEventListener("click", () => void togglePlayback());
playButton.addEventListener("click", () => void togglePlayback());
video.addEventListener("click", () => void togglePlayback());

video.addEventListener("playing", () => {
  playButton.classList.add("is-playing");
  playButton.ariaLabel = "Pause video";
  playLabel.textContent = "Pause";
  setState("Playing", "active");
  scheduleTelemetry();
});

video.addEventListener("pause", () => {
  playButton.classList.remove("is-playing");
  playButton.ariaLabel = "Play video";
  playLabel.textContent = "Play";
  if (!video.ended && client) {
    setState("Paused");
  }
  scheduleTelemetry();
});

video.addEventListener("waiting", () => setState("Buffering"));
video.addEventListener("seeking", () => setState("Seeking"));
video.addEventListener("seeked", () => {
  setState(video.paused ? "Paused" : "Playing", video.paused ? "idle" : "active");
  scheduleTelemetry();
});
video.addEventListener("ended", () => {
  setState("Complete");
  scheduleTelemetry();
});
video.addEventListener("loadedmetadata", scheduleTelemetry);
video.addEventListener("error", () => {
  setState(video.error?.message ?? "Video error", "error");
});

timeline.addEventListener("input", () => {
  if (Number.isFinite(video.duration)) {
    video.currentTime = (Number(timeline.value) / 1000) * video.duration;
  }
});

rate.addEventListener("change", () => {
  video.playbackRate = Number(rate.value);
});

volume.addEventListener("input", updateVolume);
updateVolume();

fullscreenButton.addEventListener("click", () => {
  if (document.fullscreenElement) {
    void document.exitFullscreen();
    return;
  }
  void videoStage.requestFullscreen();
});

window.addEventListener("pagehide", () => {
  if (animationFrame !== undefined) {
    cancelAnimationFrame(animationFrame);
  }
  void client?.destroy();
});
