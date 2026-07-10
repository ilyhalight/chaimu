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

test("AudioPlayer reconnects Web Audio after source replacement", async ({ page }) => {
  test.fail(true, "AudioPlayer discards its source node while reusing the routed media element");

  const connected = await page.evaluate(async () => {
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

    client.player.src = undefined;
    client.player.src = "/audio.wav?replacement";
    const result = Boolean(client.player.audioSource);
    await client.audioContext?.close();
    return result;
  });

  expect(connected).toBe(true);
});

test("ChaimuPlayer.play starts its media element", async ({ page }) => {
  test.fail(true, "ChaimuPlayer.play only resumes AudioContext");

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

test("ChaimuPlayer unloads old media when its source changes", async ({ page }) => {
  test.fail(true, "ChaimuPlayer.src changes metadata without replacing loaded media");

  const hasLoadedElement = await page.evaluate(async () => {
    const video = document.querySelector("video")!;
    const client = new window.chaimuModule.default({ url: "/audio.wav", video });
    await client.init();

    if (!(client.player instanceof window.chaimuModule.ChaimuPlayer)) {
      throw new Error("Expected ChaimuPlayer");
    }

    client.player.src = "/audio.wav?replacement";
    const result = Boolean(client.player.audioElement);
    await client.audioContext?.close();
    return result;
  });

  expect(hasLoadedElement).toBe(false);
});

test("ChaimuPlayer preserves volume while clearing", async ({ page }) => {
  test.fail(true, "clear reads volume after disconnecting its gain node");

  const volume = await page.evaluate(async () => {
    const video = document.querySelector("video")!;
    const client = new window.chaimuModule.default({ url: "/audio.wav", video });
    await client.init();

    if (!(client.player instanceof window.chaimuModule.ChaimuPlayer)) {
      throw new Error("Expected ChaimuPlayer");
    }

    client.player.volume = 0.25;
    await client.player.clear();
    const result = client.player.volume;
    await client.audioContext?.close();
    return result;
  });

  expect(volume).toBe(0.25);
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

test("start requested during clearing is ignored", async ({ page }) => {
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

  expect(statuses).toEqual(["fulfilled", "fulfilled"]);
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
  test.fail(true, "ended is not included in the synchronization events");

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
