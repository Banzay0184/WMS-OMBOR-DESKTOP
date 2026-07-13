import puppeteer from "puppeteer-core";

export const SHOT_DIR =
  "/private/tmp/claude-501/-Users-shakhzodabidov-Projects-WMS-OMBOR/14eac45d-7bc3-49c7-9590-93893841691b/scratchpad/shots";

export async function launch() {
  const browser = await puppeteer.launch({
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
    args: ["--window-size=1400,1000"],
    defaultViewport: { width: 1400, height: 1000 },
  });
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));
  return { browser, page, consoleErrors };
}

export async function loginAndOpenProducts(page) {
  await page.goto("http://localhost:1420/login", { waitUntil: "networkidle2", timeout: 20000 });
  await page.waitForSelector("#phone", { timeout: 10000 });
  await page.type("#phone", "998900000001", { delay: 10 });
  await page.type("#password", "QaTest12345!", { delay: 10 });
  const submitBtn = await page.$('button[type="submit"]');
  await Promise.all([
    submitBtn.click(),
    page.waitForNavigation({ waitUntil: "networkidle2", timeout: 20000 }).catch(() => {}),
  ]);
  await new Promise((r) => setTimeout(r, 600));
  const orgCard = await page.waitForSelector("text/QA Products Test Org", { timeout: 10000 }).catch(() => null);
  if (orgCard) {
    await orgCard.click();
    await new Promise((r) => setTimeout(r, 800));
  }
  await page.goto("http://localhost:1420/app/products", { waitUntil: "networkidle2", timeout: 20000 });
  await new Promise((r) => setTimeout(r, 500));
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
