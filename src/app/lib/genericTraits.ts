/**
 * Shared blocklist of generic soft-skill traits that should be filtered
 * from ATS recommendations, missing keywords, and gap analysis displays.
 * Used by both CvEditorScreen and FeedbackTab.
 */
export const GENERIC_TRAITS = new Set([
  'attention to detail', 'attention to details',
  'positive attitude', 'can do attitude', 'can-do attitude',
  'team player', 'team work', 'teamwork', 'team worker',
  'self motivated', 'self-motivated', 'self starter', 'self-starter',
  'solutions focused', 'solutions-focused', 'solution focused',
  'results driven', 'results-driven', 'target driven',
  'hard working', 'hardworking', 'hard worker',
  'good communicator', 'excellent communicator',
  'communication skills', 'interpersonal skills',
  'problem solving', 'problem-solving', 'analytical skills',
  'time management', 'organisational skills', 'organizational skills',
  'multitasking', 'multi-tasking', 'adaptable', 'adaptability',
  'proactive', 'flexible', 'enthusiastic', 'motivated',
  'reliable', 'responsible', 'dedicated', 'committed',
  'detail oriented', 'detail-oriented', 'fast learner',
  'quick learner', 'willing to learn', 'eager to learn',
  'passionate', 'driven', 'ambitious', 'dynamic',
  'strong work ethic', 'work ethic',
]);
