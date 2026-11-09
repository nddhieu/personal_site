const { When, Then } = require('@cucumber/cucumber');
const { By } = require('selenium-webdriver');
const assert = require('assert');

// F3 T3 diary jump: tapping a diary entry closes the panel, scrolls to
// that entry's scene, and briefly highlights it. The first entry's turn
// comes from its data-testid (diary-entry-<turn>), so the step works for
// any run, not just a hardcoded turn. The highlight is asserted in its
// own wait first: it is added synchronously at click and removed after
// ~2s, so it must be caught before the (slower) smooth scroll settles.
When('I tap the first diary entry', async function () {
  const entries = await this.driver.findElements(
    By.css('[data-testid^="diary-entry-"]')
  );
  assert.ok(entries.length >= 1, 'no diary-entry buttons found');
  const testid = await entries[0].getAttribute('data-testid');
  this.diaryJumpTurn = testid.replace('diary-entry-', '');
  await entries[0].click();
});

Then('the diary panel closes and its scene is highlighted', async function () {
  const turn = this.diaryJumpTurn;
  const sceneId = 'scene-' + turn;
  await this.driver.wait(async () => {
    return this.driver.executeScript(
      "const s = document.getElementById(arguments[0]);" +
      "return !!(s && s.classList.contains('scene-jump-highlight'));",
      sceneId
    );
  }, 5000);
  await this.driver.wait(async () => {
    return this.driver.executeScript(
      "const s = document.getElementById(arguments[0]);" +
      "if (!s) return false;" +
      "const r = s.getBoundingClientRect();" +
      "return r.top >= -10 && r.top < window.innerHeight;",
      sceneId
    );
  }, 15000);
  const panelHidden = await this.driver.executeScript(
    "return document.getElementById('diary-panel').hidden;"
  );
  assert.ok(panelHidden, 'diary panel should close when an entry is tapped');
});
