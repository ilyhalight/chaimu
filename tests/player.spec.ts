import { expect, test, type Page } from "@playwright/test";

type ChaimuModule = typeof import("../src/index");

declare global {
  interface Window {
    chaimuModule: ChaimuModule;
  }
}

async function openHarness(page: Page) {
  await page.goto("/");
  await page.locator("html[data-ready='true']").waitFor();
}

test.beforeEach(async ({ page }) => {
  await openHarness(page);
});

test("selects the native and Web Audio player implementations", async ({ page }) => {
  const names = await page.evaluate(async () => {
    const video = document.querySelector("video")!;
    const defaultClient = new window.chaimuModule.default({ url: "/audio.wav", video });
    const audioClient = new window.chaimuModule.default({
      preferAudio: true,
      url: "/audio.wav",
      video,
    });
    const result = {
      defaultPlayer: defaultClient.player.name,
      preferredPlayer: audioClient.player.name,
    };

    await defaultClient.audioContext?.close();
    await audioClient.audioContext?.close();
    return result;
  });

  expect(names).toEqual({
    defaultPlayer: "ChaimuPlayer",
    preferredPlayer: "AudioPlayer",
  });
});

test("both players support source-less initialization", async ({ page }) => {
  const states = await page.evaluate(async () => {
    const video = document.querySelector("video")!;
    Object.defineProperty(video, "currentTime", { configurable: true, value: 1.5 });

    const inspectPlayer = async (preferAudio: boolean) => {
      const client = new window.chaimuModule.default({ preferAudio, video });
      await client.init();

      let playError: string | undefined;
      try {
        await client.player.play();
      } catch (error) {
        playError = error instanceof Error ? error.message : String(error);
      }

      await client.player.pause();
      const result = {
        currentSrc: client.player.currentSrc,
        currentTime: client.player.currentTime,
        name: client.player.name,
        playError,
        src: client.player.src,
      };
      await client.destroy();
      return result;
    };

    return Promise.all([inspectPlayer(false), inspectPlayer(true)]);
  });

  expect(states).toEqual([
    {
      currentSrc: undefined,
      currentTime: 0,
      name: "ChaimuPlayer",
      playError: "No audio source provided",
      src: undefined,
    },
    {
      currentSrc: undefined,
      currentTime: 0,
      name: "AudioPlayer",
      playError: "No audio source provided",
      src: undefined,
    },
  ]);
});

test("both players activate a source assigned after initialization", async ({ page }) => {
  const states = await page.evaluate(async () => {
    const video = document.querySelector("video")!;

    const inspectPlayer = async (preferAudio: boolean) => {
      const client = new window.chaimuModule.default({ preferAudio, video });
      await client.init();
      const source = `/audio.wav?late=${preferAudio}`;
      client.player.src = source;

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Assigned source did not load")), 5_000);
        const check = () => {
          if (client.player.currentSrc === source) {
            clearTimeout(timeout);
            resolve();
            return;
          }
          requestAnimationFrame(check);
        };
        check();
      });

      const result = {
        currentSrc: client.player.currentSrc,
        name: client.player.name,
        src: client.player.src,
      };
      await client.destroy();
      return result;
    };

    return Promise.all([inspectPlayer(false), inspectPlayer(true)]);
  });

  expect(states).toEqual([
    {
      currentSrc: "/audio.wav?late=false",
      name: "ChaimuPlayer",
      src: "/audio.wav?late=false",
    },
    {
      currentSrc: "/audio.wav?late=true",
      name: "AudioPlayer",
      src: "/audio.wav?late=true",
    },
  ]);
});

test("AudioPlayer synchronizes time and rate from real video events", async ({ page }) => {
  const state = await page.evaluate(async () => {
    const video = document.querySelector("video")!;
    const client = new window.chaimuModule.default({
      preferAudio: true,
      url: "/audio.wav",
      video,
    });
    await client.init();

    if (!(client.player instanceof window.chaimuModule.AudioPlayer)) {
      throw new Error("Expected AudioPlayer");
    }

    const player = client.player;
    if (player.audio.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA) {
      await new Promise<void>((resolve, reject) => {
        player.audio.addEventListener("canplaythrough", () => resolve(), { once: true });
        player.audio.addEventListener(
          "error",
          () => reject(new Error(player.audio.error?.message ?? "Audio failed to become seekable")),
          { once: true },
        );
      });
    }

    Object.defineProperties(video, {
      currentTime: { configurable: true, value: 0.25 },
      playbackRate: { configurable: true, value: 1.25 },
    });
    const seeked = new Promise<void>((resolve) => {
      player.audio.addEventListener("seeked", () => resolve(), { once: true });
    });
    video.dispatchEvent(new Event("ratechange"));
    await Promise.race([seeked, new Promise((resolve) => setTimeout(resolve, 500))]);

    const result = {
      currentTime: player.currentTime,
      playbackRate: player.playbackRate,
    };
    player.removeVideoEvents();
    await player.clear();
    await client.audioContext?.close();
    return result;
  });

  expect(state.currentTime).toBeCloseTo(0.25, 1);
  expect(state.playbackRate).toBe(1.25);
});

test("both players pause while video buffers and resume only on playing", async ({ page }) => {
  const states = await page.evaluate(async () => {
    const inspectPlayer = async (preferAudio: boolean) => {
      const video = document.createElement("video");
      Object.defineProperties(video, {
        currentTime: { configurable: true, value: 0.25 },
        paused: { configurable: true, value: false },
        playbackRate: { configurable: true, value: 1.25 },
        readyState: { configurable: true, value: HTMLMediaElement.HAVE_CURRENT_DATA },
      });

      let initializationPlayCalls = 0;
      const mediaPlay = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "play")!;
      HTMLMediaElement.prototype.play = function () {
        if (this instanceof HTMLAudioElement) {
          initializationPlayCalls += 1;
        }
        return Promise.resolve();
      };

      const client = new window.chaimuModule.default({
        preferAudio,
        url: "/audio.wav",
        video,
      });
      try {
        await client.init();
      } finally {
        Object.defineProperty(HTMLMediaElement.prototype, "play", mediaPlay);
      }

      const player = client.player;
      const audio =
        player instanceof window.chaimuModule.AudioPlayer ? player.audio : player.audioElement!;
      let pauseCalls = 0;
      let playCalls = 0;
      audio.pause = () => {
        pauseCalls += 1;
      };
      audio.play = () => {
        playCalls += 1;
        return Promise.resolve();
      };

      video.dispatchEvent(new Event("play"));
      video.dispatchEvent(new Event("ratechange"));
      await new Promise((resolve) => setTimeout(resolve, 0));
      const earlyEventsIgnored = playCalls === 0;

      video.dispatchEvent(new Event("playing"));
      await new Promise((resolve) => setTimeout(resolve, 0));
      const startedOnPlaying = playCalls === 1;

      video.dispatchEvent(new Event("waiting"));
      video.dispatchEvent(new Event("ratechange"));
      await new Promise((resolve) => setTimeout(resolve, 0));
      const pausedWhileBuffering = pauseCalls === 1 && playCalls === 1;

      video.dispatchEvent(new Event("playing"));
      await new Promise((resolve) => setTimeout(resolve, 0));
      const resumedOnPlaying = playCalls === 2;

      await client.destroy();
      return {
        earlyEventsIgnored,
        initializationPlayCalls,
        pausedWhileBuffering,
        resumedOnPlaying,
        startedOnPlaying,
      };
    };

    return Promise.all([inspectPlayer(false), inspectPlayer(true)]);
  });

  expect(states).toEqual([
    {
      earlyEventsIgnored: true,
      initializationPlayCalls: 0,
      pausedWhileBuffering: true,
      resumedOnPlaying: true,
      startedOnPlaying: true,
    },
    {
      earlyEventsIgnored: true,
      initializationPlayCalls: 0,
      pausedWhileBuffering: true,
      resumedOnPlaying: true,
      startedOnPlaying: true,
    },
  ]);
});

test("both players synchronize speed changes from an external script", async ({ page }) => {
  const rates = await page.evaluate(async () => {
    const inspectPlayer = async (preferAudio: boolean) => {
      const video = document.createElement("video");
      video.playbackRate = 1.25;
      video.addEventListener("ratechange", (event) => event.stopImmediatePropagation());
      const client = new window.chaimuModule.default({
        preferAudio,
        url: "/audio.wav",
        video,
      });
      await client.init();

      const player = client.player;
      const initialRate = player.playbackRate;
      const replacementSource = `/audio.wav?speed=${preferAudio}`;
      player.src = replacementSource;
      video.playbackRate = 1.5;
      video.dispatchEvent(
        new CustomEvent("ratechange", {
          bubbles: true,
          composed: true,
          detail: {
            origin: "videoSpeed",
            source: "external",
            speed: "1.50",
          },
        }),
      );
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Replacement source did not load")), 5_000);
        const check = () => {
          if (player.currentSrc === replacementSource) {
            clearTimeout(timeout);
            resolve();
            return;
          }
          requestAnimationFrame(check);
        };
        check();
      });
      const replacementRate = player.playbackRate;

      video.playbackRate = 1.75;
      video.dispatchEvent(
        new CustomEvent("ratechange", {
          bubbles: true,
          composed: true,
          detail: {
            origin: "videoSpeed",
            source: "external",
            speed: "1.75",
          },
        }),
      );
      const blockedRate = player.playbackRate;
      video.dispatchEvent(new Event("timeupdate"));
      const externalRate = player.playbackRate;

      await client.destroy();
      return { blockedRate, externalRate, initialRate, replacementRate };
    };

    return Promise.all([inspectPlayer(false), inspectPlayer(true)]);
  });

  expect(rates).toEqual([
    { blockedRate: 1.5, externalRate: 1.75, initialRate: 1.25, replacementRate: 1.5 },
    { blockedRate: 1.25, externalRate: 1.75, initialRate: 1.25, replacementRate: 1.25 },
  ]);
});

test("ChaimuPlayer initializes a real media graph", async ({ page }) => {
  const state = await page.evaluate(async () => {
    const video = document.querySelector("video")!;
    const client = new window.chaimuModule.default({ url: "/audio.wav", video });
    await client.init();

    if (!(client.player instanceof window.chaimuModule.ChaimuPlayer)) {
      throw new Error("Expected ChaimuPlayer");
    }

    const player = client.player;
    const result = {
      hasAudioElement: player.audioElement instanceof HTMLAudioElement,
      hasGainNode: player.gainNode instanceof GainNode,
      hasMediaSource: player.mediaElementSource instanceof MediaElementAudioSourceNode,
      usesBlobUrl: player.audioElement?.src.startsWith("blob:") ?? false,
    };
    await player.clear();
    await client.audioContext?.close();
    return result;
  });

  expect(state).toEqual({
    hasAudioElement: true,
    hasGainNode: true,
    hasMediaSource: true,
    usesBlobUrl: true,
  });
});

test("ChaimuPlayer clears loaded browser resources", async ({ page }) => {
  const state = await page.evaluate(async () => {
    const video = document.querySelector("video")!;
    const client = new window.chaimuModule.default({ url: "/audio.wav", video });
    await client.init();

    if (!(client.player instanceof window.chaimuModule.ChaimuPlayer)) {
      throw new Error("Expected ChaimuPlayer");
    }

    const player = client.player;
    const oldContext = client.audioContext!;
    await player.clear();
    const result = {
      blobUrl: player.blobUrl,
      contextState: oldContext.state,
      hasAudioElement: Boolean(player.audioElement),
    };
    await client.audioContext?.close();
    return result;
  });

  expect(state).toEqual({
    blobUrl: undefined,
    contextState: "closed",
    hasAudioElement: false,
  });
});

test("destroy removes listeners and closes resources for both players", async ({ page }) => {
  const state = await page.evaluate(async () => {
    const video = document.querySelector("video")!;
    const audioClient = new window.chaimuModule.default({
      preferAudio: true,
      url: "/audio.wav",
      video,
    });
    await audioClient.init();

    if (!(audioClient.player instanceof window.chaimuModule.AudioPlayer)) {
      throw new Error("Expected AudioPlayer");
    }

    const audioPlayer = audioClient.player;
    const audioElement = audioPlayer.audio;
    const audioContext = audioClient.audioContext!;
    await audioClient.destroy();
    await audioClient.destroy();

    video.playbackRate = 1.5;
    video.dispatchEvent(new Event("ratechange"));

    const defaultClient = new window.chaimuModule.default({ url: "/audio.wav", video });
    await defaultClient.init();

    if (!(defaultClient.player instanceof window.chaimuModule.ChaimuPlayer)) {
      throw new Error("Expected ChaimuPlayer");
    }

    const defaultPlayer = defaultClient.player;
    const defaultAudioElement = defaultPlayer.audioElement!;
    const defaultContext = defaultClient.audioContext!;
    await defaultClient.destroy();

    let reinitializationError: string | undefined;
    try {
      await defaultClient.init();
    } catch (error) {
      reinitializationError = error instanceof Error ? error.message : String(error);
    }

    return {
      audio: {
        contextState: audioContext.state,
        clientHasContext: Boolean(audioClient.audioContext),
        destroyed: audioClient.destroyed,
        hasGainNode: Boolean(audioPlayer.gainNode),
        hasSourceNode: Boolean(audioPlayer.audioSource),
        hasSrc: audioElement.hasAttribute("src"),
        listenerRemoved: audioElement.playbackRate === 1,
        paused: audioElement.paused,
      },
      default: {
        blobUrl: defaultPlayer.blobUrl,
        clientHasContext: Boolean(defaultClient.audioContext),
        contextState: defaultContext.state,
        hasAudioElement: Boolean(defaultPlayer.audioElement),
        hasGainNode: Boolean(defaultPlayer.gainNode),
        hasMediaSource: Boolean(defaultPlayer.mediaElementSource),
        mediaPaused: defaultAudioElement.paused,
        mediaHasSrc: defaultAudioElement.hasAttribute("src"),
        reinitializationError,
      },
    };
  });

  expect(state).toEqual({
    audio: {
      contextState: "closed",
      clientHasContext: false,
      destroyed: true,
      hasGainNode: false,
      hasSourceNode: false,
      hasSrc: false,
      listenerRemoved: true,
      paused: true,
    },
    default: {
      blobUrl: undefined,
      clientHasContext: false,
      contextState: "closed",
      hasAudioElement: false,
      hasGainNode: false,
      hasMediaSource: false,
      mediaPaused: true,
      mediaHasSrc: false,
      reinitializationError: "Chaimu has been destroyed",
    },
  });
});

test("preferAudio resumes its suspended AudioContext before playback", async ({ page }) => {
  const state = await page.evaluate(async () => {
    const video = document.querySelector("video")!;
    const client = new window.chaimuModule.default({
      preferAudio: true,
      url: "/audio.wav",
      video,
    });
    await client.init();
    await client.audioContext?.suspend();
    await client.player.play();
    const state = client.audioContext?.state;
    await client.player.clear();
    await client.audioContext?.close();
    return state;
  });

  expect(state).toBe("running");
});

test("AudioPlayer cleanup cancels playback waiting for context resume", async ({ page }) => {
  const state = await page.evaluate(async () => {
    const video = document.querySelector("video")!;
    const client = new window.chaimuModule.default({
      preferAudio: true,
      url: "/audio.wav",
      video,
    });
    await client.init();

    if (!(client.player instanceof window.chaimuModule.AudioPlayer) || !client.audioContext) {
      throw new Error("Expected AudioPlayer with an AudioContext");
    }

    const player = client.player;
    await client.audioContext.suspend();
    let markResumeStarted!: () => void;
    let releaseResume!: () => void;
    const resumeStarted = new Promise<void>((resolve) => {
      markResumeStarted = resolve;
    });
    const resumeGate = new Promise<void>((resolve) => {
      releaseResume = resolve;
    });
    client.audioContext.resume = async () => {
      markResumeStarted();
      await resumeGate;
    };
    let playCalls = 0;
    player.audio.play = () => {
      playCalls += 1;
      return Promise.resolve();
    };

    const playing = player.play();
    await resumeStarted;
    await player.clear();
    releaseResume();
    await playing;
    const result = { hasSrc: player.audio.hasAttribute("src"), playCalls };
    await client.destroy();
    return result;
  });

  expect(state).toEqual({ hasSrc: false, playCalls: 0 });
});

test("AudioPlayer reconnects Web Audio after source replacement", async ({ page }) => {
  const state = await page.evaluate(async () => {
    const video = document.querySelector("video")!;
    const client = new window.chaimuModule.default({
      preferAudio: true,
      url: "/audio.wav",
      video,
    });
    await client.init();

    if (!(client.player instanceof window.chaimuModule.AudioPlayer)) {
      throw new Error("Expected AudioPlayer");
    }

    const player = client.player;
    const oldAudioElement = player.audio;
    player.src = undefined;
    player.src = "/audio.wav?replacement";
    if (player.audio.readyState < HTMLMediaElement.HAVE_METADATA) {
      await new Promise<void>((resolve, reject) => {
        player.audio.addEventListener("loadedmetadata", () => resolve(), { once: true });
        player.audio.addEventListener(
          "error",
          () => reject(new Error(player.audio.error?.message ?? "Audio failed to load")),
          { once: true },
        );
      });
    }
    const result = {
      connected: Boolean(player.audioSource),
      currentSrc: player.currentSrc,
      oldMediaHasSrc: oldAudioElement.hasAttribute("src"),
      replacedMedia: player.audio !== oldAudioElement,
    };
    await player.clear();
    await client.audioContext?.close();
    return result;
  });

  expect(state.connected).toBe(true);
  expect(state.currentSrc).toContain("/audio.wav?replacement");
  expect(state.oldMediaHasSrc).toBe(false);
  expect(state.replacedMedia).toBe(true);
});

test("ChaimuPlayer.play starts its media element", async ({ page }) => {
  await page.evaluate(async () => {
    const video = document.querySelector("video")!;
    const button = document.querySelector("button")!;
    const client = new window.chaimuModule.default({ url: "/audio.wav", video });
    await client.init();

    if (!(client.player instanceof window.chaimuModule.ChaimuPlayer)) {
      throw new Error("Expected ChaimuPlayer");
    }

    const player = client.player;
    button.addEventListener(
      "click",
      () => {
        void player.play().then(async () => {
          button.dataset.result = String(player.audioElement?.paused);
          await client.audioContext?.close();
        });
      },
      { once: true },
    );
  });

  const button = page.locator("button");
  await button.click();
  await expect(button).toHaveAttribute("data-result", /true|false/);
  expect(await button.getAttribute("data-result")).toBe("false");
});

test("both players propagate media playback rejection", async ({ page }) => {
  const errors = await page.evaluate(async () => {
    const video = document.querySelector("video")!;

    const inspectPlayer = async (preferAudio: boolean) => {
      const client = new window.chaimuModule.default({
        preferAudio,
        url: "/audio.wav",
        video,
      });
      await client.init();

      const player = client.player;
      const audio =
        player instanceof window.chaimuModule.AudioPlayer ? player.audio : player.audioElement!;
      audio.play = () => Promise.reject(new DOMException("Playback blocked", "NotAllowedError"));

      try {
        await player.play();
        return undefined;
      } catch (error) {
        return {
          message: error instanceof Error ? error.message : String(error),
          name: error instanceof Error ? error.name : undefined,
          player: player.name,
        };
      } finally {
        await client.destroy();
      }
    };

    return Promise.all([inspectPlayer(false), inspectPlayer(true)]);
  });

  expect(errors).toEqual([
    { message: "Playback blocked", name: "NotAllowedError", player: "ChaimuPlayer" },
    { message: "Playback blocked", name: "NotAllowedError", player: "AudioPlayer" },
  ]);
});

test("both players pause media and report its playback clock", async ({ page }) => {
  const states = await page.evaluate(async () => {
    const video = document.querySelector("video")!;
    Object.defineProperty(video, "currentTime", { configurable: true, value: 1.5 });

    const inspectPlayer = async (preferAudio: boolean) => {
      const client = new window.chaimuModule.default({
        preferAudio,
        url: "/audio.wav",
        video,
      });
      await client.init();

      const player = client.player;
      const audio =
        player instanceof window.chaimuModule.AudioPlayer ? player.audio : player.audioElement!;
      Object.defineProperty(audio, "currentTime", { configurable: true, value: 0.25 });
      let pauseCalls = 0;
      audio.pause = () => {
        pauseCalls += 1;
      };

      await player.pause();
      const result = { currentTime: player.currentTime, pauseCalls, player: player.name };
      await client.destroy();
      return result;
    };

    return Promise.all([inspectPlayer(false), inspectPlayer(true)]);
  });

  expect(states).toEqual([
    { currentTime: 0.25, pauseCalls: 1, player: "ChaimuPlayer" },
    { currentTime: 0.25, pauseCalls: 1, player: "AudioPlayer" },
  ]);
});

test("ChaimuPlayer unloads old media when its source changes", async ({ page }) => {
  const state = await page.evaluate(async () => {
    const video = document.querySelector("video")!;
    const client = new window.chaimuModule.default({ url: "/audio.wav", video });
    await client.init();

    if (!(client.player instanceof window.chaimuModule.ChaimuPlayer)) {
      throw new Error("Expected ChaimuPlayer");
    }

    const player = client.player;
    const oldAudioElement = player.audioElement!;
    player.src = "/audio.wav?replacement";
    const currentSrcWhileLoading = player.currentSrc;
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Replacement source did not load")), 5_000);
      const check = () => {
        if (player.audioElement && player.audioElement !== oldAudioElement) {
          clearTimeout(timeout);
          resolve();
          return;
        }
        requestAnimationFrame(check);
      };
      check();
    });
    const result = {
      currentSrc: player.currentSrc,
      currentSrcWhileLoading,
      oldMediaHasSrc: oldAudioElement.hasAttribute("src"),
      oldAudioPaused: oldAudioElement.paused,
      replacementLoaded: Boolean(player.audioElement),
    };
    await player.clear();
    await client.audioContext?.close();
    return result;
  });

  expect(state).toEqual({
    currentSrc: "/audio.wav?replacement",
    currentSrcWhileLoading: undefined,
    oldMediaHasSrc: false,
    oldAudioPaused: true,
    replacementLoaded: true,
  });
});

test("both players preserve volume across cleanup and replacement", async ({ page }) => {
  const volumes = await page.evaluate(async () => {
    const video = document.querySelector("video")!;

    const inspectPlayer = async (preferAudio: boolean) => {
      const client = new window.chaimuModule.default({
        preferAudio,
        url: "/audio.wav",
        video,
      });
      await client.init();

      client.player.volume = 0.25;
      await client.player.clear();
      const afterClear = client.player.volume;
      client.player.src = "/audio.wav?replacement";
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error("Replacement source did not load")),
          5_000,
        );
        const check = () => {
          if (client.player.currentSrc === "/audio.wav?replacement") {
            clearTimeout(timeout);
            resolve();
            return;
          }
          requestAnimationFrame(check);
        };
        check();
      });

      const result = { afterClear, afterReplacement: client.player.volume };
      await client.destroy();
      return result;
    };

    return Promise.all([inspectPlayer(false), inspectPlayer(true)]);
  });

  expect(volumes).toEqual([
    { afterClear: 0.25, afterReplacement: 0.25 },
    { afterClear: 0.25, afterReplacement: 0.25 },
  ]);
});

test("repeated initialization unloads replaced media for both players", async ({ page }) => {
  const states = await page.evaluate(async () => {
    const video = document.querySelector("video")!;

    const inspectPlayer = async (preferAudio: boolean) => {
      const client = new window.chaimuModule.default({
        preferAudio,
        url: "/audio.wav",
        video,
      });
      await client.init();

      const oldMedia =
        client.player instanceof window.chaimuModule.AudioPlayer
          ? client.player.audio
          : client.player.audioElement!;
      await client.init();
      const currentMedia =
        client.player instanceof window.chaimuModule.AudioPlayer
          ? client.player.audio
          : client.player.audioElement!;
      const result = {
        oldMediaHasSrc: oldMedia.hasAttribute("src"),
        oldMediaPaused: oldMedia.paused,
        replacedMedia: currentMedia !== oldMedia,
      };
      await client.destroy();
      return result;
    };

    return Promise.all([inspectPlayer(false), inspectPlayer(true)]);
  });

  expect(states).toEqual([
    { oldMediaHasSrc: false, oldMediaPaused: true, replacedMedia: true },
    { oldMediaHasSrc: false, oldMediaPaused: true, replacedMedia: true },
  ]);
});

test("lifecycle cancellation is composed with a caller fetch signal", async ({ page }) => {
  const state = await page.evaluate(async () => {
    const callerController = new AbortController();
    let fetchSignal: AbortSignal | undefined;
    let markFetchStarted!: () => void;
    const fetchStarted = new Promise<void>((resolve) => {
      markFetchStarted = resolve;
    });
    const fetchFn = (_input: string | URL | Request, init?: RequestInit) => {
      fetchSignal = init?.signal ?? undefined;
      markFetchStarted();
      return new Promise<Response>((_resolve, reject) => {
        fetchSignal?.addEventListener(
          "abort",
          () => reject(new DOMException("Fetch aborted", "AbortError")),
          { once: true },
        );
      });
    };
    const video = document.querySelector("video")!;
    const client = new window.chaimuModule.default({
      fetchFn,
      fetchOpts: { signal: callerController.signal },
      url: "/audio.wav",
      video,
    });
    const initializing = client.init();
    await fetchStarted;
    const clearing = client.player.clear();
    const results = await Promise.allSettled([initializing, clearing]);
    const result = {
      callerAborted: callerController.signal.aborted,
      fetchAborted: fetchSignal?.aborted,
      statuses: results.map(({ status }) => status),
      usedCallerSignalDirectly: fetchSignal === callerController.signal,
    };
    await client.destroy();
    return result;
  });

  expect(state).toEqual({
    callerAborted: false,
    fetchAborted: true,
    statuses: ["fulfilled", "fulfilled"],
    usedCallerSignalDirectly: false,
  });
});

test("ChaimuPlayer reports unsuccessful HTTP responses", async ({ page }) => {
  test.fail(true, "fetchAudio does not check Response.ok");

  const error = await page.evaluate(async () => {
    const video = document.querySelector("video")!;
    const client = new window.chaimuModule.default({ url: "/missing.wav", video });
    try {
      await client.init();
      return undefined;
    } catch (caught) {
      return caught instanceof Error ? caught.message : String(caught);
    } finally {
      await client.audioContext?.close();
    }
  });

  expect(error).toContain("404");
});

test("initialization cannot resurrect a cleared ChaimuPlayer", async ({ page }) => {
  const state = await page.evaluate(async () => {
    const bytes = await fetch("/audio.wav").then((response) => response.arrayBuffer());
    let resolveFetch!: (response: Response) => void;
    const fetchFn = () =>
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      });
    const video = document.querySelector("video")!;
    const client = new window.chaimuModule.default({ fetchFn, url: "/audio.wav", video });

    if (!(client.player instanceof window.chaimuModule.ChaimuPlayer)) {
      throw new Error("Expected ChaimuPlayer");
    }

    const initializing = client.init();
    await Promise.resolve();
    await client.player.clear();
    resolveFetch(new Response(bytes, { headers: { "Content-Type": "audio/wav" } }));
    await initializing;
    const result = {
      blobUrl: client.player.blobUrl,
      hasAudioElement: Boolean(client.player.audioElement),
    };
    await client.audioContext?.close();
    return result;
  });

  expect(state).toEqual({ blobUrl: undefined, hasAudioElement: false });
});

test("clearing cancels a start waiting to resume", async ({ page }) => {
  const state = await page.evaluate(async () => {
    const video = document.querySelector("video")!;
    const client = new window.chaimuModule.default({ url: "/audio.wav", video });
    await client.init();

    if (!(client.player instanceof window.chaimuModule.ChaimuPlayer)) {
      throw new Error("Expected ChaimuPlayer");
    }

    const player = client.player;
    let playCalls = 0;
    player.audioElement!.play = () => {
      playCalls += 1;
      return Promise.resolve();
    };

    let releaseStart!: () => void;
    let startEntered!: () => void;
    const startGate = new Promise<void>((resolve) => {
      releaseStart = resolve;
    });
    const entered = new Promise<void>((resolve) => {
      startEntered = resolve;
    });
    player.play = async () => {
      startEntered();
      await startGate;
      return player;
    };

    const starting = player.start();
    await entered;
    const clearing = player.clear();
    releaseStart();
    const results = await Promise.allSettled([starting, clearing]);
    const result = {
      hasAudioElement: Boolean(player.audioElement),
      playCalls,
      statuses: results.map(({ status }) => status),
    };
    await client.audioContext?.close();
    return result;
  });

  expect(state).toEqual({
    hasAudioElement: false,
    playCalls: 0,
    statuses: ["fulfilled", "fulfilled"],
  });
});

test("start requested during clearing rejects when no media remains", async ({ page }) => {
  const statuses = await page.evaluate(async () => {
    const video = document.querySelector("video")!;
    const client = new window.chaimuModule.default({ url: "/audio.wav", video });
    await client.init();

    if (!(client.player instanceof window.chaimuModule.ChaimuPlayer)) {
      throw new Error("Expected ChaimuPlayer");
    }

    const player = client.player;
    let releaseClear!: () => void;
    let clearEntered!: () => void;
    const clearGate = new Promise<void>((resolve) => {
      releaseClear = resolve;
    });
    const entered = new Promise<void>((resolve) => {
      clearEntered = resolve;
    });
    player.reopenCtx = async () => {
      clearEntered();
      await clearGate;
      return player;
    };

    const clearing = player.clear();
    await entered;
    const starting = player.start();
    releaseClear();
    const results = await Promise.allSettled([clearing, starting]);
    await client.audioContext?.close();
    return results.map(({ status }) => status);
  });

  expect(statuses).toEqual(["fulfilled", "rejected"]);
});

test("replaceVideo rebinds synchronization without replacing audio resources", async ({ page }) => {
  const states = await page.evaluate(async () => {
    const inspectPlayer = async (preferAudio: boolean) => {
      const oldVideo = document.createElement("video");
      const newVideo = document.createElement("video");
      document.body.append(oldVideo, newVideo);
      Object.defineProperties(newVideo, {
        currentTime: { configurable: true, value: 0.25 },
        playbackRate: { configurable: true, value: 1.25 },
      });

      const client = new window.chaimuModule.default({
        preferAudio,
        url: "/audio.wav",
        video: oldVideo,
      });
      await client.init();

      const player = client.player;
      const audio =
        player instanceof window.chaimuModule.AudioPlayer ? player.audio : player.audioElement!;
      const audioContext = client.audioContext;
      const currentSrc = player.currentSrc;
      let pauseCalls = 0;
      const pause = audio.pause.bind(audio);
      audio.pause = () => {
        pauseCalls += 1;
        pause();
      };

      const replacementResult = await client.replaceVideo(newVideo);
      const synchronizedTime = audio.currentTime;
      const synchronizedRate = audio.playbackRate;
      const pauseCallsAfterReplacement = pauseCalls;
      const sameVideoResult = await client.replaceVideo(newVideo);

      audio.playbackRate = 1;
      Object.defineProperty(oldVideo, "playbackRate", { configurable: true, value: 1.75 });
      oldVideo.dispatchEvent(new Event("ratechange"));
      const oldVideoIgnored = audio.playbackRate === 1;

      Object.defineProperty(newVideo, "playbackRate", { configurable: true, value: 1.5 });
      newVideo.dispatchEvent(new Event("ratechange"));
      const newVideoHandled = audio.playbackRate === 1.5;

      const resourcesPreserved =
        client.audioContext === audioContext && player.currentSrc === currentSrc;
      const mediaPreserved =
        player instanceof window.chaimuModule.AudioPlayer
          ? player.audio === audio
          : player.audioElement === audio;
      const sameVideoWasNoop = sameVideoResult === client && pauseCalls === pauseCallsAfterReplacement;

      await client.destroy();
      audio.playbackRate = 1;
      Object.defineProperty(newVideo, "playbackRate", { configurable: true, value: 1.75 });
      newVideo.dispatchEvent(new Event("ratechange"));

      oldVideo.remove();
      newVideo.remove();
      return {
        destroyedListenerRemoved: audio.playbackRate === 1,
        mediaPreserved,
        newVideoHandled,
        oldVideoIgnored,
        paused: pauseCallsAfterReplacement > 0,
        replacementResult: replacementResult === client,
        resourcesPreserved,
        sameVideoWasNoop,
        synchronizedRate,
        synchronizedTime,
        videoReplaced: client.video === newVideo,
      };
    };

    return Promise.all([inspectPlayer(false), inspectPlayer(true)]);
  });

  for (const state of states) {
    expect(state).toMatchObject({
      destroyedListenerRemoved: true,
      mediaPreserved: true,
      newVideoHandled: true,
      oldVideoIgnored: true,
      paused: true,
      replacementResult: true,
      resourcesPreserved: true,
      sameVideoWasNoop: true,
      synchronizedRate: 1.25,
      videoReplaced: true,
    });
    expect(state.synchronizedTime).toBeCloseTo(0.25, 1);
  }
});

test("replaceVideo keeps the replacement when resumed playback is rejected", async ({ page }) => {
  const states = await page.evaluate(async () => {
    const inspectPlayer = async (preferAudio: boolean) => {
      const oldVideo = document.createElement("video");
      const newVideo = document.createElement("video");
      Object.defineProperties(newVideo, {
        currentTime: { configurable: true, value: 0.25 },
        paused: { configurable: true, value: false },
        playbackRate: { configurable: true, value: 1.25 },
        readyState: { configurable: true, value: HTMLMediaElement.HAVE_FUTURE_DATA },
      });

      const client = new window.chaimuModule.default({
        preferAudio,
        url: "/audio.wav",
        video: oldVideo,
      });
      await client.init();

      const player = client.player;
      const audio =
        player instanceof window.chaimuModule.AudioPlayer ? player.audio : player.audioElement!;
      const currentSrc = player.currentSrc;
      let errorCalls = 0;
      let playCalls = 0;
      player.audioErrorHandle = () => {
        errorCalls += 1;
      };
      audio.play = () => {
        playCalls += 1;
        return Promise.reject(new DOMException("Playback blocked", "NotAllowedError"));
      };

      await client.replaceVideo(newVideo);
      await new Promise((resolve) => setTimeout(resolve, 0));
      const result = {
        errorCalls,
        playCalls,
        sourcePreserved: player.currentSrc === currentSrc,
        videoReplaced: client.video === newVideo,
      };
      await client.destroy();
      return result;
    };

    return Promise.all([inspectPlayer(false), inspectPlayer(true)]);
  });

  expect(states).toEqual([
    { errorCalls: 1, playCalls: 1, sourcePreserved: true, videoReplaced: true },
    { errorCalls: 1, playCalls: 1, sourcePreserved: true, videoReplaced: true },
  ]);
});

test("destroy prevents a replaceVideo queued during initialization", async ({ page }) => {
  const state = await page.evaluate(async () => {
    let markFetchStarted!: () => void;
    const fetchStarted = new Promise<void>((resolve) => {
      markFetchStarted = resolve;
    });
    const fetchFn = (_input: string | URL | Request, init?: RequestInit) => {
      markFetchStarted();
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(new DOMException("Fetch aborted", "AbortError")),
          { once: true },
        );
      });
    };
    const oldVideo = document.createElement("video");
    const newVideo = document.createElement("video");
    const client = new window.chaimuModule.default({ fetchFn, url: "/audio.wav", video: oldVideo });

    const initializing = client.init();
    await fetchStarted;
    const replacing = client.replaceVideo(newVideo);
    const destroying = client.destroy();
    const results = await Promise.allSettled([initializing, replacing, destroying]);

    return {
      destroyed: client.destroyed,
      replacementError:
        results[1].status === "rejected" && results[1].reason instanceof Error
          ? results[1].reason.message
          : undefined,
      statuses: results.map(({ status }) => status),
      videoUnchanged: client.video === oldVideo,
    };
  });

  expect(state).toEqual({
    destroyed: true,
    replacementError: "Chaimu has been destroyed",
    statuses: ["fulfilled", "rejected", "fulfilled"],
    videoUnchanged: true,
  });
});

test("media-element playback does not retain a duplicate decoded buffer", async ({ page }) => {
  test.fail(true, "fetchAudio retains an AudioBuffer that playback never uses");

  const hasBuffer = await page.evaluate(async () => {
    const video = document.querySelector("video")!;
    const client = new window.chaimuModule.default({ url: "/audio.wav", video });
    await client.init();

    if (!(client.player instanceof window.chaimuModule.ChaimuPlayer)) {
      throw new Error("Expected ChaimuPlayer");
    }

    const result = Boolean(client.player.audioBuffer);
    await client.player.clear();
    await client.audioContext?.close();
    return result;
  });

  expect(hasBuffer).toBe(false);
});

test("external audio stops when the video ends", async ({ page }) => {
  await page.evaluate(async () => {
    const video = document.querySelector("video")!;
    const button = document.querySelector("button")!;
    const client = new window.chaimuModule.default({ url: "/audio.wav", video });
    await client.init();

    if (!(client.player instanceof window.chaimuModule.ChaimuPlayer)) {
      throw new Error("Expected ChaimuPlayer");
    }

    const player = client.player;
    button.addEventListener(
      "click",
      () => {
        void player.start().then(async () => {
          video.dispatchEvent(new Event("ended"));
          await new Promise(requestAnimationFrame);
          button.dataset.result = String(player.audioElement?.paused);
          await client.audioContext?.close();
        });
      },
      { once: true },
    );
  });

  const button = page.locator("button");
  await button.click();
  await expect(button).toHaveAttribute("data-result", /true|false/);
  expect(await button.getAttribute("data-result")).toBe("true");
});
