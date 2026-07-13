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
  await inputs[0].type(String(INVOICE_ID), { delay: 5 });
  await page.click('button[type="submit"]');
  await sleep(1000);
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll("button")).find((b) => b.textContent.includes("Добавить данные в счёт-фактуру"));
    if (btn) btn.click();
  });
  await sleep(1500);
  console.log("1. Перешли в форму разработчика:", page.url().includes("dev=1"));

  // Причина
  await page.type("#dev-correction-reason", "E2E: полный сценарий добавления", { delay: 3 });

  // 2. Новая позиция
  const addBtn = await page.$('button[aria-label="Добавить позицию в счёт‑фактуру"]');
  await addBtn.click();
  await sleep(300);
  const nameInputs = await page.$$('input[id^="item-name-"]');
  await nameInputs[nameInputs.length - 1].type("E2E Новая позиция WR", { delay: 3 });

  // Цена новой строки — второе поле "Цена за ед." (DecimalField, не <input type=number>)
  const priceLabels = await page.$$("label");
  const priceInputHandles = await page.evaluateHandle(() => {
    const labels = Array.from(document.querySelectorAll("label"));
    const priceLabel = labels.filter((l) => l.textContent.trim() === "Цена за ед.");
    return priceLabel.map((l) => {
      const cell = l.closest("div").nextElementSibling || l.parentElement.nextElementSibling;
      return null;
    });
  });
  // Проще: цена за ед. это второй input в группе "Ед.изм/Кол-во/Цена за ед./Цена продажи/Сумма" для НОВОЙ строки (последней)
  const allRows = await page.$$('div:has(> label[for^="item-qty-"])');
  console.log("Найдено строк с полем Кол-во:", allRows.length);

  // Найдём все поля "Цена за ед." по соседству с последним "Кол-во"
  const priceOk = await page.evaluate(() => {
    const qtyLabels = Array.from(document.querySelectorAll('label')).filter(l => l.textContent.trim() === 'Цена за ед.');
    const last = qtyLabels[qtyLabels.length - 1];
    if (!last) return false;
    const input = last.parentElement.querySelector('input');
    if (!input) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, '150');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.blur();
    return true;
  });
  console.log("2. Цена новой строки установлена:", priceOk);
  await sleep(300);

  await page.screenshot({ path: `${SHOT_DIR}/wrdf-00-new-row-filled.png`, fullPage: true });

  // 3. Увеличить количество существующей строки (row 1) с 1 до 2 -> откроет новый слот маркировки
  const qtyOk = await page.evaluate(() => {
    const qtyLabels = Array.from(document.querySelectorAll('label')).filter(l => l.textContent.trim() === 'Кол-во');
    const first = qtyLabels[0];
    if (!first) return false;
    const input = first.parentElement.querySelector('input');
    if (!input) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, '2');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.blur();
    return true;
  });
  console.log("3. Количество первой (существующей) строки увеличено до 2:", qtyOk);
  await sleep(500);
  await page.screenshot({ path: `${SHOT_DIR}/wrdf-01-qty-increased.png`, fullPage: true });

  // 4. Заполнить новый слот маркировки (индекс 1, второй код) для существующей строки
  const markingFilled = await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input[placeholder="Код маркировки"]'));
    if (inputs.length < 2) return { ok: false, count: inputs.length };
    const target = inputs[1];
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(target, 'E2E-DEV-WR-MARK-1');
    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.blur();
    return { ok: true, count: inputs.length };
  });
  console.log("4. Код маркировки заполнен во втором слоте:", JSON.stringify(markingFilled));
  await sleep(300);

  // 5. Заполнить UPC существующей строки
  const upcFilled = await page.evaluate(() => {
    const input = document.querySelector('input[id^="item-upc-"]');
    if (!input || input.disabled) return { ok: false, disabled: input?.disabled };
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, '012345678905');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.blur();
    return { ok: true };
  });
  console.log("5. UPC существующей строки заполнен:", JSON.stringify(upcFilled));
  await sleep(300);
  await page.screenshot({ path: `${SHOT_DIR}/wrdf-02-before-submit.png`, fullPage: true });

  // 6. Сохранить
  const saveBtn = await page.$('button[aria-label="Сохранить добавленные данные"]');
  if (!saveBtn) throw new Error("Кнопка сохранения не найдена");
  await saveBtn.click();
  await sleep(2000);
  console.log("6. URL после сохранения:", page.url());
  await page.screenshot({ path: `${SHOT_DIR}/wrdf-03-after-submit.png`, fullPage: true });

  const bodyText = await page.evaluate(() => document.body.innerText);
  console.log("7. Вернулись на вкладку разработчика компании:", page.url().includes("/panel/companies/4"));
  console.log("8. Видна ошибка сохранения:", bodyText.includes("Не удалось") || bodyText.includes("Ошибка"));
} catch (err) {
  console.error("TEST ERROR:", err.message);
} finally {
  console.log("CONSOLE_ERRORS:", JSON.stringify(consoleErrors, null, 2));
  await browser.close();
}
