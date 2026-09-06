import { expect, test } from '@playwright/test';

/**
 * Cross-viewport UI consistency. Every check here is a rule that was broken at least once
 * and is cheap to break again — they run at 320/390/820/1440 via the config's projects.
 */

const TOUCH_MIN = 44;

/** Home -> pick the first topic's tags -> start. Leaves the page on /quiz. */
async function startQuiz(page) {
  await page.goto('/');
  await page.getByRole('button', { name: /^Select all$/ }).first().click();
  await page.getByRole('button', { name: 'Start quiz' }).click();
  await page.waitForURL(/\/quiz/);
  await expect(page.getByText(/Question 1 of/)).toBeVisible();
}

async function optionBoxes(page) {
  const cards = page.locator('main button[data-option]');
  const n = await cards.count();
  const boxes = [];
  for (let i = 0; i < n; i++) boxes.push(await cards.nth(i).boundingBox());
  return boxes.filter(Boolean);
}

/**
 * Widest minus narrowest. `auto-rows-fr` splits leftover space into fractional pixels, so
 * four genuinely-identical cards can still measure 79/79/78/79 — allow a 1px spread rather
 * than demanding exact equality.
 */
const spread = (ns) => Math.max(...ns) - Math.min(...ns);

test.describe('answer options', () => {
  test('all four cards are the same size, before and after reveal', async ({ page }) => {
    await startQuiz(page);

    const before = await optionBoxes(page);
    expect(before).toHaveLength(4);
    const w0 = before.map((b) => b.width);
    const h0 = before.map((b) => b.height);
    expect(spread(w0), `option widths differ: ${w0.map(Math.round)}`).toBeLessThanOrEqual(1);
    expect(spread(h0), `option heights differ: ${h0.map(Math.round)}`).toBeLessThanOrEqual(1);

    // Revealing must not resize the cards — the verdict column is reserved, not inserted.
    await page.locator('main button[data-option="A"]').click();
    await page.getByRole('button', { name: 'Check answer' }).click();
    await expect(page.getByText(/^(Correct|Incorrect)$/)).toBeVisible();

    const after = await optionBoxes(page);
    expect(spread(after.map((b) => b.width))).toBeLessThanOrEqual(1);
    expect(spread(after.map((b) => b.height))).toBeLessThanOrEqual(1);
    expect(
      Math.abs(after[0].width - before[0].width),
      'revealing the answer resized the cards'
    ).toBeLessThanOrEqual(1);
  });

  test('cards fill the content column', async ({ page }) => {
    await startQuiz(page);
    const [card] = await optionBoxes(page);
    const stem = await page.locator('main h2').boundingBox();
    expect(Math.abs(card.x - stem.x)).toBeLessThanOrEqual(1);
    expect(card.width).toBeGreaterThanOrEqual(stem.width - 1);
  });
});

test.describe('layout', () => {
  for (const [name, path] of [['home', '/'], ['progress', '/progress'], ['decks', '/decks']]) {
    test(`${name} has no horizontal overflow`, async ({ page }) => {
      await page.goto(path);
      await page.waitForTimeout(400);
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(scrollWidth, `${name} scrolls sideways`).toBeLessThanOrEqual(clientWidth + 1);
    });
  }

  // The quiz header is the crowded one — wordmark + Save & exit + theme + Log in — and it
  // is the one route the static overflow checks above cannot reach.
  test('the quiz screen has no horizontal overflow', async ({ page }) => {
    await startQuiz(page);
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });

  test('the header never wraps to a second row', async ({ page }) => {
    for (const path of ['/', '/progress', '/decks']) {
      await page.goto(path);
      await page.waitForTimeout(300);
      const tops = await page.evaluate(() =>
        [...document.querySelector('header > div').children].map((c) =>
          Math.round(c.getBoundingClientRect().top)
        )
      );
      expect(new Set(tops).size, `header wrapped on ${path}`).toBe(1);
    }
    // and on the quiz route, which carries an extra action
    await startQuiz(page);
    const tops = await page.evaluate(() =>
      [...document.querySelector('header > div').children].map((c) =>
        Math.round(c.getBoundingClientRect().top)
      )
    );
    expect(new Set(tops).size, 'header wrapped on /quiz').toBe(1);
  });

  test('header column lines up with the page column', async ({ page }) => {
    await page.goto('/');
    const header = await page.locator('header > div').boundingBox();
    const content = await page.locator('main h1').boundingBox();
    // The h1 sits inside the shell's horizontal padding; both must share one column.
    const wordmark = await page.getByRole('button', { name: 'Home' }).first().boundingBox();
    expect(Math.abs(wordmark.x - content.x), 'wordmark and page content start at different x').toBeLessThanOrEqual(1);
    expect(header.width).toBeGreaterThanOrEqual(content.width);
  });

  test('page content never gets narrower as the window gets wider', async ({ page }) => {
    const widths = [];
    for (const w of [820, 1024, 1440, 1920]) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.goto('/');
      await page.waitForTimeout(250);
      const b = await page.locator('main h1').boundingBox();
      widths.push(Math.round(b.width));
    }
    for (let i = 1; i < widths.length; i++) {
      expect(widths[i], `content shrank from ${widths[i - 1]} to ${widths[i]}`).toBeGreaterThanOrEqual(widths[i - 1]);
    }
  });
});

test.describe('controls', () => {
  test('every visible button is a usable touch target', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'the 44px floor is a touch-input rule');
    for (const path of ['/', '/decks', '/progress']) {
      await page.goto(path);
      await page.waitForTimeout(400);
      const small = await page.evaluate((min) =>
        [...document.querySelectorAll('button, [role="switch"], [role="checkbox"]')]
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && r.height < min;
          })
          .map((el) => `${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30)} = ${Math.round(el.getBoundingClientRect().height)}px`),
        TOUCH_MIN
      );
      expect(small, `${path} has controls under ${TOUCH_MIN}px`).toEqual([]);
    }
  });

  test('buttons sharing a row share a height', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /^Select all$/ }).first().click();
    await page.getByRole('button', { name: 'Start quiz' }).click();
    await page.waitForURL(/\/quiz/);

    // Walk to the end so the results screen's mixed Primary/Ghost/Text row is on screen.
    for (let i = 0; i < 60; i++) {
      const next = page.getByRole('button', { name: /Next question|See results/ });
      if (await next.count()) {
        const last = (await next.first().innerText()).includes('results');
        await next.first().click();
        if (last) break;
        continue;
      }
      await page.locator('main button[data-option]').first().click();
      await page.getByRole('button', { name: 'Check answer' }).click();
    }
    await page.waitForURL(/\/results/);
    // The route transition plays an exit animation first, so <main> is briefly empty.
    await expect(page.getByText(/Session complete/i)).toBeVisible();

    const row = page.locator('main').getByRole('button', { name: /Retry weak topics|New quiz|Review all/ });
    const heights = [];
    for (let i = 0; i < (await row.count()); i++) {
      heights.push(Math.round((await row.nth(i).boundingBox()).height));
    }
    expect(heights.length).toBeGreaterThanOrEqual(3);
    expect(new Set(heights).size, `results actions have mixed heights: ${heights}`).toBe(1);
  });

  // Signed-in-only UI is easy to miss: the deck consent checkbox rendered as a raw 13px
  // native control and no signed-out test could ever see it.
  test('signed-in screens use the same controls as signed-out ones', async ({ page, isMobile }) => {
    await page.route('**/api/v1/me', (r) =>
      r.fulfill({ json: { authenticated: true, display_name: 'Test User', email: 't@e.st', provider: 'google' } })
    );
    await page.route('**/api/v1/sync**', (r) => r.fulfill({ json: { runs: [] } }));

    await page.goto('/decks');
    await expect(page.getByText(/Your deck stays in your browser/)).toBeVisible();

    // No unstyled native checkboxes — the app has its own.
    const native = await page.evaluate(() =>
      [...document.querySelectorAll('input[type="checkbox"]')]
        .filter((el) => getComputedStyle(el).appearance !== 'none' && !el.className.includes('sr-only')).length
    );
    expect(native, 'a raw native checkbox is visible').toBe(0);

    if (isMobile) {
      const small = await page.evaluate(() =>
        [...document.querySelectorAll('button, summary, label')]
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && r.height < 44 && el.tagName !== 'LABEL';
          })
          .map((el) => `${el.textContent.trim().slice(0, 24)} = ${Math.round(el.getBoundingClientRect().height)}px`)
      );
      expect(small).toEqual([]);
    }
  });

  test('text fields share one skin', async ({ page }) => {
    const skin = async (locator) =>
      locator.evaluate((el) => {
        const cs = getComputedStyle(el);
        return `${cs.paddingTop}|${cs.paddingLeft}|${cs.borderTopWidth}|${cs.borderRadius}`;
      });

    await page.goto('/decks');
    const deckArea = await skin(page.locator('textarea'));

    await startQuiz(page);
    await page.getByRole('button', { name: 'More options' }).click();
    await page.getByRole('menuitem', { name: 'Report issue' }).click();
    const dialogArea = await skin(page.locator('[role="dialog"] textarea'));

    expect(dialogArea, 'the two textareas are styled differently').toBe(deckArea);
  });

  test('the report dialog is inset from the screen edges', async ({ page }) => {
    await startQuiz(page);
    await page.getByRole('button', { name: 'More options' }).click();
    await page.getByRole('menuitem', { name: 'Report issue' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    const vw = page.viewportSize().width;
    expect(box.x, 'dialog touches the left edge').toBeGreaterThan(0);
    expect(box.x + box.width, 'dialog touches the right edge').toBeLessThan(vw);
  });
});

test('a full run works end to end', async ({ page }) => {
  await startQuiz(page);

  for (let i = 0; i < 60; i++) {
    const next = page.getByRole('button', { name: /Next question|See results/ });
    if (await next.count()) {
      const last = (await next.first().innerText()).includes('results');
      await next.first().click();
      if (last) break;
      continue;
    }
    await page.locator('main button[data-option]').first().click();
    await page.getByRole('button', { name: 'Check answer' }).click();
  }

  await page.waitForURL(/\/results/);
  await expect(page.getByText(/Session complete/i)).toBeVisible();
  await expect(page.getByText(/Breakdown by tag/i)).toBeVisible();

  await page.goto('/progress');
  await expect(page.getByText(/Your progress/i)).toBeVisible();
  await expect(page.getByText(/completed quizzes/i)).toBeVisible();
});

test('no unhandled console errors on any screen', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  for (const path of ['/', '/progress', '/decks']) {
    await page.goto(path);
    await page.waitForTimeout(500);
  }
  // The auth probe 404/500s without a backend; that is expected and must stay silent.
  expect(errors.filter((e) => !/Failed to load resource|api\/v1/.test(e))).toEqual([]);
});
