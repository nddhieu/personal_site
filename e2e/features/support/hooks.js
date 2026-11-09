const { Before, After, Status, setDefaultTimeout } = require('@cucumber/cucumber');
const { Builder } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const fs = require('fs');
const path = require('path');

setDefaultTimeout(60 * 1000);

Before(async function () {
  const options = new chrome.Options();
  options.addArguments(
    '--headless=new',
    '--window-size=1280,900',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-dev-shm-usage'
  );
  this.driver = await new Builder()
    .forBrowser('chrome')
    .setChromeOptions(options)
    .build();
  this.baseUrl = process.env.E2E_BASE_URL || 'http://100.66.24.109:4000/writer';
});

After(async function (scenario) {
  if (!this.driver) return;
  try {
    if (scenario.result && scenario.result.status === Status.FAILED) {
      const png = await this.driver.takeScreenshot();
      const dir = path.join(__dirname, '..', '..', 'reports');
      fs.mkdirSync(dir, { recursive: true });
      const name = scenario.pickle.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
      fs.writeFileSync(path.join(dir, name + '.png'), png, 'base64');
    }
  } catch (_) {
    /* screenshot is best-effort */
  }
  await this.driver.quit();
});
