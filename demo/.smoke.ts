import { chromium } from "@playwright/test";

const server = Bun.spawn(["bun", "run", "demo/server.ts"], {
  stderr: "pipe",
  stdout: "pipe",
});

try {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch("http://127.0.0.1:4174");
      if (response.ok) break;
    } catch {
      // The server can take a moment to bundle the demo.
    }
    await Bun.sleep(250);
  }

  const browser = await chromium.launch({ headless: true });
  const errors: string[] = [];
  const page = await browser.newPage({ viewport: { height: 1000, width: 1440 } });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto("http://127.0.0.1:4174", { waitUntil: "domcontentloaded" });
  await page.locator("#demo-video").waitFor();
  const desktop = await page.evaluate(() => ({
    bodyWidth: document.body.scrollWidth,
    videoTag: document.querySelector("#demo-video")?.tagName,
    viewportWidth: window.innerWidth,
  }));

  await page.getByRole("button", { name: "Start live demo" }).click();
  await page.waitForTimeout(12_000);
  const playback = await page.evaluate(() => ({
    engine: document.querySelector("#engine-value")?.textContent,
    state: document.querySelector("#state-text")?.textContent,
    videoTime: document.querySelector<HTMLVideoElement>("#demo-video")?.currentTime,
  }));

  await page.setViewportSize({ height: 844, width: 390 });
  await page.reload({ waitUntil: "domcontentloaded" });
  const mobile = await page.evaluate(() => ({
    bodyWidth: document.body.scrollWidth,
    viewportWidth: window.innerWidth,
  }));

  await browser.close();
  console.log(JSON.stringify({ desktop, errors, mobile, playback }, null, 2));

  if (
    desktop.bodyWidth > desktop.viewportWidth ||
    mobile.bodyWidth > mobile.viewportWidth ||
    errors.length > 0 ||
    playback.state === "Audio error"
  ) {
    process.exitCode = 1;
  }
} finally {
  server.kill();
  await server.exited;
}
