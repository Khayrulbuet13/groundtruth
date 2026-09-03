import { z } from 'zod';

export const DIFFICULTIES = ['easy', 'medium', 'hard'];

const BANK_ID_RE = /^q_[0-9A-HJKMNP-TV-Z]{12}$/;

const tagsField = z
  .array(z.string().min(1, 'tag cannot be empty'))
  .min(1, 'tags must contain at least one tag');

const questionCore = {
  tags: tagsField,
  difficulty: z.enum(['easy', 'medium', 'hard'], {
    errorMap: () => ({ message: 'difficulty must be easy, medium, or hard' }),
  }),
  stem: z.string().min(10, 'stem must be at least 10 characters'),
  options: z
    .array(z.string().min(1, 'option text cannot be empty'))
    .length(4, 'options must contain exactly 4 items'),
  answer_idx: z
    .number()
    .int('answer_idx must be an integer')
    .min(0, 'answer_idx must be 0-3')
    .max(3, 'answer_idx must be 0-3'),
  explanation: z.string().min(10, 'explanation must be at least 10 characters'),
  source: z.string().min(1, 'source is required'),
  figure_url: z.string().url().nullable().optional(),
};

/** User-uploaded deck questions — no id; client assigns local keys. */
export const uploadQuestionSchema = z.object(questionCore);

/** Curated bank questions — stable id required. */
export const bankQuestionSchema = z.object({
  id: z
    .string()
    .min(1, 'id is required')
    .regex(BANK_ID_RE, 'id must match q_XXXXXXXXXXXX (Crockford base32)'),
  legacy_id: z.string().regex(/^q\d+$/).optional(),
  ...questionCore,
});

export const uploadDeckSchema = z.object({
  schema_version: z.literal(1, {
    errorMap: () => ({ message: 'schema_version must be 1' }),
  }),
  deck_name: z.string().min(1, 'deck_name is required').max(120),
  attribution: z.string().max(500).optional(),
  questions: z.array(uploadQuestionSchema).min(1, 'deck must contain at least one question'),
});

export const bankDeckSchema = z.object({
  schema_version: z.literal(1, {
    errorMap: () => ({ message: 'schema_version must be 1' }),
  }),
  deck_name: z.string().min(1, 'deck_name is required').max(120),
  attribution: z.string().max(500).optional(),
  questions: z.array(bankQuestionSchema).min(1, 'deck must contain at least one question'),
});

/** Default export used by upload UI. */
export const deckSchema = uploadDeckSchema;

export const deckSchemaJson = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'Quiz Deck v1',
  type: 'object',
  required: ['schema_version', 'deck_name', 'questions'],
  properties: {
    schema_version: { const: 1 },
    deck_name: { type: 'string', minLength: 1, maxLength: 120 },
    attribution: { type: 'string', maxLength: 500 },
    questions: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['tags', 'difficulty', 'stem', 'options', 'answer_idx', 'explanation', 'source'],
        properties: {
          tags: { type: 'array', minItems: 1, items: { type: 'string', minLength: 1 } },
          difficulty: { enum: ['easy', 'medium', 'hard'] },
          stem: { type: 'string', minLength: 10 },
          options: {
            type: 'array',
            minItems: 4,
            maxItems: 4,
            items: { type: 'string', minLength: 1 },
          },
          answer_idx: { type: 'integer', minimum: 0, maximum: 3 },
          explanation: { type: 'string', minLength: 10 },
          source: { type: 'string', minLength: 1 },
          figure_url: { type: ['string', 'null'] },
        },
      },
    },
  },
};
