// A capture step: one flow, a few real states, each saved with the boxes a beat will point at.
// Run with run.cjs (headless) or hand it to driver.cjs (visible, signed-in window).
// @timeout 300
module.exports = async (page, h) => {
  await h.go(page, '/models', 3500);
  await h.shot(page, '20-models', { add: page.getByRole('button', { name: 'Add model' }).first() });

  await h.step('open-dialog', async () => {
    await page.getByRole('button', { name: 'Add model' }).first().click();
    await page.getByRole('dialog').waitFor();
  });
  await h.step('fill', async () => {
    await page.locator('#model-name').fill('acme-fast');   // fictional sample data, never a customer's
    await page.locator('#provider').click();
    await page.getByRole('option', { name: /gemini/i }).first().click();
  });
  await h.shot(page, '21-add-model', { dialog: page.getByRole('dialog'), submit: page.getByRole('dialog').getByRole('button', { name: 'Add model' }) });

  await h.step('submit', async () => {
    await page.getByRole('dialog').getByRole('button', { name: 'Add model' }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden', timeout: 10000 });
  });
  await h.shot(page, '22-model-added', { row: page.getByRole('row', { name: /acme-fast/ }) });

  // Return what you need to check the result without a screenshot.
  return { rows: await page.getByRole('row').count(), log: h.log };
};
