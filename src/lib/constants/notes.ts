// Note topic types
export const NOTE_TOPIC_TYPES = [
  'General',
  'Diet Plan',
  'Escalation',
  'Medical',
  'Progress',
  'Consultation',
  'Renewal',
  'Follow-up',
  'Feedback',
  'Other'
] as const;

export type NoteTopic = (typeof NOTE_TOPIC_TYPES)[number];
