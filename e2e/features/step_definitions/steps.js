const { Given, When, Then } = require('@cucumber/cucumber');
const { By, until } = require('selenium-webdriver');
const assert = require('assert');

const byTestId = (id) => By.css('[data-testid="' + id + '"]');

Given('I open the login page', async function () {
  await this.driver.get(this.baseUrl + '/login.html');
  await this.driver.wait(until.elementLocated(By.id('guestBtn')), 20000);
});

When('I continue as guest', async function () {
  const btn = await this.driver.findElement(By.id('guestBtn'));
  await this.driver.wait(until.elementIsEnabled(btn), 10000);
  await btn.click();
  await this.driver.wait(until.urlContains('home.html'), 30000);
});

Then('I see the library with the book {string}', async function (title) {
  const cardTitle = By.xpath(
    "//article[contains(@class,'explore-card')]//h2[contains(@class,'card-title')]"
  );
  await this.driver.wait(until.elementLocated(cardTitle), 30000);
  const titles = await this.driver.findElements(cardTitle);
  const texts = [];
  for (const t of titles) texts.push((await t.getText()).trim());
  assert.ok(
    texts.some((x) => x.includes(title)),
    'library books were: ' + texts.join(' | ')
  );
  // Visibility, not just DOM presence: a CSS rule once kept the
  // loading row and the empty note on screen after a successful
  // load (the [hidden] attribute lost to component display rules).
  const card = await this.driver.findElement(By.css('.explore-card'));
  assert.ok(await card.isDisplayed(), 'book card is in the DOM but not visible');
  const loading = await this.driver.findElement(By.id('state-loading'));
  assert.ok(!(await loading.isDisplayed()), 'loading row still visible after load');
  const empty = await this.driver.findElement(By.id('library-empty'));
  assert.ok(
    !(await empty.isDisplayed()),
    'empty-library note visible despite books present'
  );
});

When('I start the book {string}', async function (title) {
  const playLink = By.xpath(
    "//article[contains(@class,'explore-card')][.//h2[contains(.,'" +
      title +
      "')]]//a[contains(@class,'explore-card-link')]"
  );
  const link = await this.driver.wait(until.elementLocated(playLink), 20000);
  await link.click();
  // The card may land on the book page (then Join) or straight on play.
  await this.driver.sleep(1500);
  const url = await this.driver.getCurrentUrl();
  if (url.includes('book.html')) {
    const join = await this.driver.wait(until.elementLocated(By.id('join-btn')), 20000);
    await join.click();
  }
  await this.driver.wait(until.urlContains('play.html'), 30000);
});

Then('the play screen shows the opening scene', async function () {
  const prose = await this.driver.wait(until.elementLocated(byTestId('prose')), 30000);
  await this.driver.wait(async () => {
    const text = (await prose.getText()).trim();
    return text.length > 20;
  }, 60000);
});

When('I act {string}', { timeout: 360 * 1000 }, async function (action) {
  const prose = await this.driver.findElement(byTestId('prose'));
  this.proseBefore = await prose.findElements(By.css('p'));
  const input = await this.driver.findElement(byTestId('action-input'));
  await input.clear();
  await input.sendKeys(action);
  // Enter makes a new line now (Nov 5 composer): the send button sends.
  const send = await this.driver.findElement(byTestId("send-btn"));
  await send.click();
});

Then('a new scene appears', { timeout: 360 * 1000 }, async function () {
  const prose = await this.driver.findElement(byTestId('prose'));
  const before = this.proseBefore ? this.proseBefore.length : 0;
  await this.driver.wait(async () => {
    const now = await prose.findElements(By.css('p'));
    if (now.length <= before) return false;
    const input = await this.driver.findElement(byTestId('action-input'));
    return await input.isEnabled();
  }, 330000);
});

Then('the suggestions panel is collapsed', async function () {
  const panel = await this.driver.findElement(By.id('suggest-panel'));
  assert.ok(
    !(await panel.isDisplayed()),
    'suggestions panel should start collapsed'
  );
});

When('I open the suggestions panel', async function () {
  const toggle = await this.driver.findElement(byTestId('suggest-toggle'));
  await toggle.click();
});

Then('the suggestion options are shown', async function () {
  const card = await this.driver.findElement(byTestId('suggestion-1'));
  assert.ok(
    await card.isDisplayed(),
    'suggestion options should be visible when the panel is open'
  );
  const cont = await this.driver.findElement(byTestId('continue-btn'));
  assert.ok(
    await cont.isDisplayed(),
    'Continue should live inside the open panel'
  );
});

When('I open the diary', async function () {
  const btn = await this.driver.findElement(byTestId('diary-btn'));
  await btn.click();
  await this.driver.wait(until.elementLocated(By.id('diary-list')), 20000);
});

Then('the suggestions panel is open with fresh suggestions', async function () {
  const panel = await this.driver.findElement(By.id('suggest-panel'));
  assert.ok(
    await panel.isDisplayed(),
    'suggestions panel should open on its own after a new scene'
  );
  const starters = [
    'I open the door and look at her properly.',
    'I ask who she is, and what happened out there.',
    'I step aside and invite her in, out of the rain.',
  ];
  this.suggestionTexts = [];
  for (const id of ['suggestion-1', 'suggestion-2', 'suggestion-3']) {
    const card = await this.driver.findElement(byTestId(id));
    assert.ok(await card.isDisplayed(), id + ' should be visible');
    const text = (await card.getText()).trim();
    assert.ok(text.length > 0, id + ' should have text');
    assert.ok(
      !starters.includes(text),
      id + ' still shows a starter action, not a generated suggestion: ' + text
    );
    this.suggestionTexts.push(text);
  }
  assert.strictEqual(
    new Set(this.suggestionTexts).size,
    3,
    'the 3 suggestions should all differ'
  );
});

When('I reload the play screen', async function () {
  await this.driver.navigate().refresh();
  const prose = await this.driver.wait(
    until.elementLocated(byTestId('prose')),
    30000
  );
  await this.driver.wait(async () => {
    const text = (await prose.getText()).trim();
    return text.length > 20;
  }, 60000);
});

Then('the same suggestions are shown', async function () {
  const texts = [];
  for (const id of ['suggestion-1', 'suggestion-2', 'suggestion-3']) {
    const card = await this.driver.findElement(byTestId(id));
    texts.push((await card.getAttribute('textContent')).trim());
  }
  assert.deepStrictEqual(
    texts,
    this.suggestionTexts,
    'suggestions after reload should be the persisted set'
  );
});

When('I tap the first suggestion', { timeout: 60 * 1000 }, async function () {
  const prose = await this.driver.findElement(byTestId('prose'));
  this.proseBefore = await prose.findElements(By.css('p'));
  const card = await this.driver.findElement(byTestId('suggestion-1'));
  await card.click();
});

Then('the diary has at least one entry', async function () {
  await this.driver.wait(async () => {
    const items = await this.driver.findElements(By.css('#diary-list > *'));
    return items.length >= 1;
  }, 30000);
});

When('I return in a fresh tab', async function () {
  // Hieu's bug (2026-10-27): the play page kept the run id in
  // sessionStorage, which is scoped to one tab - coming back
  // in a new tab started fresh while the work sat on the
  // server. Dropping the stored id and reloading reproduces
  // the return visit; the page must re-find the run through
  // the list endpoint instead of creating a new one.
  await this.driver.executeScript('sessionStorage.clear();');
  const url = await this.driver.getCurrentUrl();
  await this.driver.get(url);
  const prose = await this.driver.wait(
    until.elementLocated(byTestId('prose')),
    30000
  );
  await this.driver.wait(async () => {
    const text = (await prose.getText()).trim();
    return text.length > 20;
  }, 60000);
});

Then('my earlier scenes are still there', async function () {
  const prose = await this.driver.findElement(byTestId('prose'));
  const blocks = await prose.findElements(By.css('p'));
  assert.ok(
    blocks.length >= 2,
    'expected the opening scene plus the played scene after ' +
      'returning in a fresh tab, found ' + blocks.length
  );
});
