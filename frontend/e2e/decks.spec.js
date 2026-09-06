import { expect, test } from '@playwright/test';

/**
 * "Bring your own deck works on anyone" — an imported deck has to be practisable even when
 * none of its tags exist in the built-in bank. Both halves of this were broken:
 *   - the picker only ever listed bank tags, so a deck tagged "chemistry" had no checkbox
 *     and could never be drawn;
 *   - the bank title-cases difficulty ("Easy") but uploads keep the lowercase the schema
 *     demands, so any non-Mixed difficulty silently dropped every imported question.
 */

const deck = (name, difficulty) => ({
  schema_version: 1,
  deck_name: name,
  questions: Array.from({ length: 8 }, (_, i) => ({
    tags: ['chemistry', 'ml'],
    difficulty,
    stem: `Science question number ${i + 1} about reaction rates?`,
    options: ['alpha', 'beta', 'gamma', 'delta'],
    answer_idx: i % 4,
    explanation: 'Because the activation energy determines the rate constant.',
    source: 'test source',
    figure_url: null,
  })),
});

async function importDeck(page, d) {
  await page.goto('/decks');
  await page.locator('textarea').fill(JSON.stringify(d));
  await page.getByRole('button', { name: /Validate & import/ }).click();
  await expect(page.getByText(new RegExp(`Imported "${d.deck_name}"`))).toBeVisible();
}

test('an imported deck can be practised straight from the deck list', async ({ page }) => {
  await importDeck(page, deck('Mixed Sciences', 'medium'));

  await page.getByRole('button', { name: 'Practice' }).click();
  await page.waitForURL(/\/quiz/);
  await expect(page.locator('main h2')).toContainText('Science question');

  // and it is a real run, not a dead end
  await page.locator('main button[data-option]').first().click();
  await page.getByRole('button', { name: 'Check answer' }).click();
  await expect(page.getByText(/^(Correct|Incorrect)$/)).toBeVisible();
});

test('deck tags outside the bank vocabulary are selectable on the home screen', async ({ page }) => {
  await importDeck(page, deck('Mixed Sciences', 'medium'));

  await page.goto('/');
  await expect(page.getByText('Mixed Sciences')).toBeVisible();

  await page.getByRole('button', { name: /Mixed Sciences/ }).click();
  const tags = page.locator('[role="checkbox"]').filter({ hasText: /chemistry|ml/ });
  expect(await tags.count(), 'the deck\'s own tags have no checkbox').toBeGreaterThanOrEqual(2);
});

for (const level of ['Easy', 'Medium', 'Hard']) {
  test(`a ${level.toLowerCase()} deck is still found when ${level} is selected`, async ({ page }) => {
    await importDeck(page, deck(`${level} Sciences`, level.toLowerCase()));

    await page.goto('/');
    await page.getByRole('button', { name: new RegExp(`${level} Sciences`) }).click();
    await page.getByRole('button', { name: /^Select all$/ }).last().click();
    await page.getByRole('button', { name: level, exact: true }).click();
    await page.waitForTimeout(300);

    const start = page.getByRole('button', { name: 'Start quiz' });
    await expect(start, `${level} deck questions were filtered out`).toBeEnabled();
    await start.click();
    await page.waitForURL(/\/quiz/);
    await expect(page.locator('main h2')).toContainText('Science question');
  });
}
