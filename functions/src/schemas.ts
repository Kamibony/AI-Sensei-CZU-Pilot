import { z } from 'zod';

// Schema for a single slide in a presentation
const slideSchema = z.object({
  title: z.string().min(1, "Slide title cannot be empty."),
  points: z.array(z.string().min(1, "Bullet point cannot be empty.")).min(1, "Each slide must have at least one point."),
});

// Schema for a presentation
export const presentationSchema = z.object({
  slides: z.array(slideSchema).min(1, "A presentation must have at least one slide."),
});

// Schema for a single question in a quiz or test
const questionSchema = z.object({
  question_text: z.string().min(1, "Question text cannot be empty."),
  options: z.array(z.string().min(1, "Option text cannot be empty.")).min(2, "Each question must have at least two options."),
  correct_option_index: z.number().int().min(0, "Correct option index must be a non-negative integer."),
  type: z.enum(['multiple_choice', 'true_false']).optional(), // Optional for quiz, required for test
});

// Schema for a quiz
export const quizSchema = z.object({
  questions: z.array(questionSchema).min(1, "A quiz must have at least one question."),
});

// Schema for a test (extends quiz with stricter question validation)
export const testSchema = z.object({
    questions: z.array(
        questionSchema.extend({
            // The 'type' field is made required for tests by overriding it
            // from the base questionSchema and removing the `.optional()` modifier.
            // The invalid `required_error` parameter has been removed to fix the build.
            type: z.enum(['multiple_choice', 'true_false']),
        })
    ).min(1, "A test must have at least one question."),
});


// Schema for a single podcast episode
const episodeSchema = z.object({
  title: z.string().min(1, "Episode title cannot be empty."),
  script: z.string().min(1, "Episode script cannot be empty."),
});

// Schema for a podcast series (used for the 'post' content type)
export const postSchema = z.object({
  episodes: z.array(episodeSchema).min(1, "A podcast series must have at least one episode."),
});

// A map to easily access schemas by content type
export const schemas = {
  presentation: presentationSchema,
  quiz: quizSchema,
  test: testSchema,
  post: postSchema,
};

// A type to represent the valid content types that have a schema
export type JsonContentType = keyof typeof schemas;