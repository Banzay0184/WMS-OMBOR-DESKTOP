import { launch, SHOT_DIR, sleep } from "./qa-helpers.mjs";

const { browser, page, consoleErrors } = await launch();
const INVOICE_ID = 14;

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
    if (platformCard) {
      await platformCard.click();
      await sleep(800);
    }
  }

  await page.goto("http://localhost:1420/panel/companies/4", { waitUntil: "networkidle2", timeout: 20000 });
  await sleep(600);
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll("nav button")).find((b) => b.textContent.trim() === "Панель разработчика");
    if (btn) btn.click();
  });
  await sleep(500);
  const inputs = await page.$$('input[type="number"]');
  await inputs[0].type(String(INVOICE_ID), { delay: 5 });
  await page.click('button[type="submit"]');
  await sleep(1000);
  await page.screenshot({ path: `${SHOT_DIR}/wrd-00-found-in-tab.png` });

  const devBtn = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll("button")).find((b) => b.textContent.includes("Добавить данные в счёт-фактуру"));
    if (btn) { btn.click(); return true; }
    return false;
  });
  console.log("1. Кнопка перехода в форму найдена и нажата:", devBtn);
  await sleep(1200);
  console.log("2. URL перешёл на WarehouseReceipt с dev=1:", page.url().includes("/receipt") && page.url().includes("dev=1"));
  await page.screenshot({ path: `${SHOT_DIR}/wrd-01-receipt-devmode.png`, fullPage: true });

  let bodyText = await page.evaluate(() => document.body.innerText);
  console.log("3. Заголовок 'Режим разработчика' виден:", bodyText.includes("Режим разработчика"));
  console.log("4. Существующий товар виден:", bodyText.includes("QA WR DevCorr"));

  // Проверка блокировки существующей строки: поле "Наше наименование" должно быть disabled
  const nameDisabled = await page.evaluate(() => {
    const input = document.querySelector('input[id^="item-name-"]');
    return input ? input.disabled : null;
  });
  console.log("5. Поле наименования существующей строки заблокировано:", nameDisabled === true);

  // Заполнить причину
  const reasonInput = await page.$("#dev-correction-reason");
  await reasonInput.type("E2E: WarehouseReceipt dev mode test", { delay: 3 });

  // Добавить новую строку через "+ Позиция"
  const addBtn = await page.$('button[aria-label="Добавить позицию в счёт‑фактуру"]');
  await addBtn.click();
  await sleep(300);
  const nameInputs = await page.$$('input[id^="item-name-"]');
  const newRowNameInput = nameInputs[nameInputs.length - 1];
  await newRowNameInput.type("E2E Новая позиция разработчика", { delay: 3 });

  // Заполнить цену новой строки (MoneyField использует DecimalField — ищем по позиции)
  const priceInputs = await page.$$('input[id^="item-price-"], input[id^="item-unit-price-"]');
  console.log("Найдено полей цены:", priceInputs.length);
  await page.screenshot({ path: `${SHOT_DIR}/wrd-02-new-row-added.png`, fullPage: true });

  await page.screenshot({ path: `${SHOT_DIR}/wrd-03-before-submit.png`, fullPage: true });
} catch (err) {
  console.error("TEST ERROR:", err.message);
} finally {
  console.log("CONSOLE_ERRORS:", JSON.stringify(consoleErrors, null, 2));
  await browser.close();
}
