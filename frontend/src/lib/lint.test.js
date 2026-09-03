import { describe, expect, it } from 'vitest';
import { lintQuestions } from '../../../scripts/lint-questions.mjs';

describe('strict question linter', () => {
  it('fails on deliberately over-long correct option', () => {
    const errors = lintQuestions(
      [
        {
          id: 'q999',
          answer_idx: 0,
          stem: 'What is the primary purpose of batch normalization in deep networks?',
          options: [
            'It stabilizes internal covariate shift by normalizing layer inputs across the mini-batch during training',
            'It removes need for activations',
            'It doubles learning rate',
            'It replaces gradients',
          ],
        },
      ],
      'question',
      { strict: true }
    );
    expect(errors.some((e) => e.includes('word-count spread'))).toBe(true);
  });
});
