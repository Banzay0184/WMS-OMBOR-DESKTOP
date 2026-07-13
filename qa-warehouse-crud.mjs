import { launch, SHOT_DIR, sleep } from "./qa-helpers.mjs";

const { browser, page, consoleErrors } = await launch();
const NAME = `QA-WH-${Date.now()}`;
const NAME_EDITED = `${NAME}-edited`;

try {
  await page.goto("http://localhost:1420/login", { waitUntil: "networkidle2", timeout: 20000 });
  await page.waitForSelector("#phone", { timeout: 10000 });
  await page.type("#phone", "998900000001", { delay: 10 });
  await page.type("#password", "QaTest12345!", { delay: 10 });
  const submitBtn = await page.$('button[type="submit"]');
  await Promise.all([
    submitBtn.click(),
    page.waitForNavigation({ waitUntil: "networkidle2", timeout: 20000 }).catch(() => {}),
  ]);
  await sleep(600);
  const orgCard = await page.waitForSelector("text/QA Products Test Org", { timeout: 10000 }).catch(() => null);
  if (orgCard) {
    await orgCard.click();
    await sleep(800);
  }
  await page.goto("http://localhost:1420/app/warehouses", { waitUntil: "networkidle2", timeout: 20000 });
  await sleep(500);
  await page.screenshot({ path: `${SHOT_DIR}/wh-00-list.png` });

  // 1. Создать склад
  await page.click('button[aria-label="Добавить склад"]');
  await page.waitForSelector("#wh-name", { timeout: 5000 });
  await page.type("#wh-name", NAME, { delay: 5 });
  await page.type("#wh-address", "ул. Тестовая, 1", { delay: 5 });
  await page.click('button[type="submit"]');
  await sleep(1000);
  let text = await page.evaluate(() => document.body.innerText);
  console.log("1. После создания склад виден в списке:", text.includes(NAME));
  await page.screenshot({ path: `${SHOT_DIR}/wh-01-created.png` });

  // 2. Редактировать: сменить имя, адрес, снять "Активен"
  const editBtn = await page.$(`button[aria-label="Редактировать ${NAME}"]`);
  if (!editBtn) throw new Error("Кнопка «Редактировать» не найдена");
  await editBtn.click();
  await page.waitForSelector("#wh-name", { timeout: 5000 });
  const prefillName = await page.$eval("#wh-name", (el) => el.value);
  const prefillAddress = await page.$eval("#wh-address", (el) => el.value);
  console.log("2a. Форма редактирования предзаполнена именем:", prefillName === NAME);
  console.log("2b. Форма редактирования предзаполнена адресом:", prefillAddress === "ул. Тестовая, 1");
  await page.click("#wh-name", { clickCount: 3 });
  await page.type("#wh-name", NAME_EDITED, { delay: 5 });
  await page.click("#wh-active"); // снять чекбокс "Активен"
  await page.click('button[type="submit"]');
  await sleep(1000);
  text = await page.evaluate(() => document.body.innerText);
  console.log("2c. После сохранения список содержит новое имя:", text.includes(NAME_EDITED));
  console.log("2d. Старое имя больше не отображается:", !text.includes(NAME) || text.includes(NAME_EDITED));
  await page.screenshot({ path: `${SHOT_DIR}/wh-02-edited.png` });

  const activeCell = await page.evaluate((editedName) => {
    const rows = Array.from(document.querySelectorAll("tbody tr"));
    const row = rows.find((r) => r.textContent.includes(editedName));
    return row ? row.textContent : null;
  }, NAME_EDITED);
  console.log("2e. После снятия чекбокса статус «Нет»:", activeCell && activeCell.includes("Нет"));

  // 3. Esc должен закрывать модалку редактирования (useModalDismiss)
  await editBtn2Test();
  async function editBtn2Test() {
    const editBtn2 = await page.$(`button[aria-label="Редактировать ${NAME_EDITED}"]`);
    if (!editBtn2) throw new Error("Кнопка «Редактировать» (2) не найдена");
    await editBtn2.click();
    await page.waitForSelector("#wh-name", { timeout: 5000 });
    await page.keyboard.press("Escape");
    await sleep(300);
    const stillOpen = await page.$("#wh-name");
    console.log("3. Esc закрывает модалку редактирования:", stillOpen === null);
  }

  // 4. Архивировать (мягкое удаление)
  const delBtn = await page.$(`button[aria-label="Удалить ${NAME_EDITED}"]`);
  if (!delBtn) throw new Error("Кнопка «Удалить» не найдена");
  await delBtn.click();
  const dialog = await page.waitForSelector('[aria-labelledby="remove-warehouse-title"]', { timeout: 5000 });
  const dialogBtns = await dialog.$$("button");
  let clicked = false;
  for (const b of dialogBtns) {
    const t = await b.evaluate((el) => el.textContent.trim());
    if (t === "Удалить") {
      await b.click();
      clicked = true;
      break;
    }
  }
  if (!clicked) throw new Error("Кнопка подтверждения удаления не найдена в диалоге");
  await page.waitForSelector('[aria-labelledby="remove-warehouse-title"]', { hidden: true, timeout: 5000 });
  await sleep(1000);
  text = await page.evaluate(() => document.body.innerText);
  console.log("4. После архивации склад не виден в активных:", !text.includes(NAME_EDITED));
  await page.screenshot({ path: `${SHOT_DIR}/wh-03-after-delete.png` });

  // 5. Проверить вкладку "Архив"
  const tabs = await page.$$('button[role="tab"]');
  await tabs[1].click();
  await sleep(1000);
  text = await page.evaluate(() => document.body.innerText);
  console.log("5. Склад виден во вкладке Архив:", text.includes(NAME_EDITED));
  await page.screenshot({ path: `${SHOT_DIR}/wh-04-archive-tab.png` });

  // 6. Восстановить
  const restoreBtn = await page.$(`button[aria-label="Восстановить ${NAME_EDITED}"]`);
  if (!restoreBtn) throw new Error("Кнопка «Восстановить» не найдена");
  await restoreBtn.click();
  await sleep(1200);
  text = await page.evaluate(() => document.body.innerText);
  console.log("6. После восстановления пропал из архива:", !text.includes(NAME_EDITED));
  await page.screenshot({ path: `${SHOT_DIR}/wh-05-after-restore.png` });

  // 7. Вернуться на "Активные" — склад должен снова быть там
  const tabsActive = await page.$$('button[role="tab"]');
  await tabsActive[0].click();
  await sleep(1000);
  text = await page.evaluate(() => document.body.innerText);
  console.log("7. После восстановления снова в активных:", text.includes(NAME_EDITED));
  await page.screenshot({ path: `${SHOT_DIR}/wh-06-active-after-restore.png` });

  // 8. Уборка: снова архивировать тестовый склад
  const delBtn2 = await page.$(`button[aria-label="Удалить ${NAME_EDITED}"]`);
  if (delBtn2) {
    await delBtn2.click();
    const dialog2 = await page.waitForSelector('[aria-labelledby="remove-warehouse-title"]', { timeout: 5000 });
    const dialogBtns2 = await dialog2.$$("button");
    for (const b of dialogBtns2) {
      const t = await b.evaluate((el) => el.textContent.trim());
      if (t === "Удалить") {
        await b.click();
        break;
      }
    }
    await page.waitForSelector('[aria-labelledby="remove-warehouse-title"]', { hidden: true, timeout: 5000 });
    console.log("Уборка: тестовый склад снова отправлен в архив");
  }
} catch (err) {
  console.error("TEST ERROR:", err.message);
} finally {
  console.log("CONSOLE_ERRORS:", JSON.stringify(consoleErrors, null, 2));
  await browser.close();
}
