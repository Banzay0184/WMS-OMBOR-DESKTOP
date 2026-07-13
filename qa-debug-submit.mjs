import puppeteer from "puppeteer-core";
const SHOT_DIR = "/private/tmp/claude-501/-Users-shakhzodabidov-Projects-WMS-OMBOR/14eac45d-7bc3-49c7-9590-93893841691b/scratchpad/shots";
const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true, args: ["--window-size=1400,1000"], defaultViewport: { width: 1400, height: 1000 },
});
const page = await browser.newPage();
page.on("console", (msg) => console.log("BROWSER:", msg.type(), msg.text()));
page.on("pageerror", (err) => console.log("PAGEERROR:", err.message));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  await page.goto("http://localhost:1420/login", { waitUntil: "networkidle2", timeout: 20000 });
  await page.waitForSelector("#phone", { timeout: 10000 });
  await page.type("#phone", "998900000099", { delay: 10 });
  await page.type("#password", "QaTest12345!", { delay: 10 });
  await Promise.all([
    page.click('button[type="submit"]'),
    page.waitForNavigation({ waitUntil: "networkidle2", timeout: 20000 }).catch(() => {}),
  ]);
  await sleep(800);
  if (page.url().includes("select-context")) {
    const platformCard = await page.waitForSelector("text/Платформа", { timeout: 5000 }).catch(() => null);
    if (platformCard) { await platformCard.click(); await sleep(800); }
  }
  await page.goto("http://localhost:1420/panel/companies/4", { waitUntil: "networkidle2", timeout: 20000 });
  await sleep(600);
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll("nav button")).find((b) => b.textContent.trim() === "Панель разработчика");
    if (btn) btn.click();
  });
  await sleep(500);
  const inputs = await page.$$('input[type="number"]');
  await inputs[0].type("14", { delay: 5 });
  await page.click('button[type="submit"]');
  await sleep(1000);
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll("button")).find((b) => b.textContent.includes("Добавить данные в счёт-фактуру"));
    if (btn) btn.click();
  });
  await sleep(1500);
  await page.type("#dev-correction-reason", "E2E debug submit", { delay: 3 });

  console.log("activeContext before save:", await page.evaluate(() => localStorage.getItem("activeContext")));
  const saveBtn = await page.$('button[aria-label="Сохранить добавленные данные"]');
  await saveBtn.click();
  await sleep(300);
  console.log("activeContext +300ms:", await page.evaluate(() => localStorage.getItem("activeContext")));
  console.log("URL +300ms:", page.url());
  await sleep(1000);
  console.log("activeContext +1300ms:", await page.evaluate(() => localStorage.getItem("activeContext")));
  console.log("URL +1300ms:", page.url());
  await sleep(2000);
  console.log("activeContext +3300ms:", await page.evaluate(() => localStorage.getItem("activeContext")));
  console.log("URL +3300ms:", page.url());
} catch (err) {
  console.error("ERROR:", err.message);
} finally {
  await browser.close();
}
