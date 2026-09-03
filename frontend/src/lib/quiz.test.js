import { describe, expect, it } from 'vitest';
import { validateDeck } from '@schema/validate.js';
import { buildQuiz, shuffle, accuracy, weakTags } from './quiz.js';

const sampleQuestions = [
  {
    id: 'q_test1',
    tags: ['conv', 'cnn'],
    difficulty: 'Easy',
    options: ['a', 'b', 'c', 'd'],
    answer: 0,
  },
  {
    id: 'q_test2',
    tags: ['conv'],
    difficulty: 'Hard',
    options: ['w', 'x', 'y', 'z'],
    answer: 2,
  },
];

describe('shuffle determinism', () => {
  it('same seed yields same order', () => {
    const a = shuffle([1, 2, 3, 4, 5], 42);
    const b = shuffle([1, 2, 3, 4, 5], 42);
    expect(a).toEqual(b);
  });
});

describe('buildQuiz', () => {
  it('remaps answer after option shuffle', () => {
    const quiz = buildQuiz(sampleQuestions, {
      tagIds: ['conv'],
      difficulty: 'Mixed',
      count: 2,
      seed: 123,
    });
    quiz.forEach((q) => {
      expect(q.options[q.answer]).toBeDefined();
    });
  });

  it('dedupes by id when tags overlap', () => {
    const quiz = buildQuiz(sampleQuestions, {
      tagIds: ['conv', 'cnn'],
      difficulty: 'Mixed',
      count: 10,
      seed: 1,
    });
    const ids = new Set(quiz.map((q) => q.id));
    expect(ids.size).toBe(quiz.length);
  });
});

describe('scoring helpers', () => {
  it('computes accuracy', () => {
    expect(accuracy([{ correct: true }, { correct: false }])).toBe(50);
  });

  it('finds weak tags', () => {
    const weak = weakTags([
      { tags: ['conv'], correct: false },
      { tags: ['conv'], correct: false },
      { tags: ['pool'], correct: true },
    ]);
    expect(weak).toContain('conv');
  });
});

describe('deck validator', () => {
  it('rejects invalid answer_idx with field-level error', () => {
    const result = validateDeck({
      schema_version: 1,
      deck_name: 'Bad',
      questions: [
        {
          tags: ['cnn', 'conv'],
          difficulty: 'easy',
          stem: 'A long enough stem here?',
          options: ['a', 'b', 'c', 'd'],
          answer_idx: 4,
          explanation: 'Because reasons stated here',
          source: 'Test',
        },
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/question 1.*answer_idx/i);
  });

  it('accepts upload deck without question ids', () => {
    const result = validateDeck({
      schema_version: 1,
      deck_name: 'Good',
      questions: [
        {
          tags: ['cnn'],
          difficulty: 'easy',
          stem: 'What is a convolution?',
          options: ['a', 'b', 'c', 'd'],
          answer_idx: 0,
          explanation: 'Conv applies learned filters.',
          source: 'Test',
        },
      ],
    });
    expect(result.ok).toBe(true);
  });
});
