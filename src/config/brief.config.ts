/**
 * The brief: every question on /contact, in the order they are asked.
 *
 * All the wording lives here, so a question, an option or a budget band only
 * ever changes in this file. `label` is what the visitor taps and what arrives
 * in the email; `phrase` is how that answer reads in the running sentence on
 * the page ("We need {need} {detail}. {stage}, and we'd like to launch
 * {timeline}. Budget: {budget}.").
 *
 * `when` shows a question only after that answer to the first one. An answer
 * with no matching follow-up (Not sure yet) goes straight on.
 */
export interface BriefOption {
  label: string;
  phrase: string;
  /** Set on the first question: which follow-up this answer leads to. */
  value?: string;
}

export interface BriefChoice {
  /** The step's id, and the name of the field it sets. */
  id: 'need' | 'stage' | 'timeline' | 'budget' | `detail-${string}`;
  name: 'need' | 'detail' | 'stage' | 'timeline' | 'budget';
  question: string;
  note?: string;
  when?: string;
  options: BriefOption[];
}

export const need: BriefChoice = {
  id: 'need',
  name: 'need',
  question: 'What brings you here?',
  options: [
    { value: 'website', label: 'A new website', phrase: 'a new website' },
    { value: 'product', label: 'An app or product', phrase: 'an app or product built' },
    { value: 'brand', label: 'A brand', phrase: 'a brand' },
    { value: 'rescue', label: 'Fixing something that exists', phrase: 'something fixed' },
    { value: 'unsure', label: 'Not sure yet', phrase: 'help working out what comes next' },
  ],
};

export const details: BriefChoice[] = [
  {
    id: 'detail-website',
    name: 'detail',
    when: 'website',
    question: 'Is there a site today?',
    options: [
      { label: 'Yes, and it’s holding us back', phrase: 'to replace one that’s holding us back' },
      { label: 'Yes, but it’s out of date', phrase: 'to replace one that’s out of date' },
      { label: 'Nothing yet', phrase: 'starting from nothing' },
    ],
  },
  {
    id: 'detail-product',
    name: 'detail',
    when: 'product',
    question: 'Is anything built yet?',
    options: [
      { label: 'Just the idea', phrase: 'starting from the idea' },
      { label: 'A prototype or MVP', phrase: 'taking a prototype further' },
      { label: 'It’s live and needs work', phrase: 'on top of something already live' },
    ],
  },
  {
    id: 'detail-brand',
    name: 'detail',
    when: 'brand',
    question: 'How much of it exists?',
    options: [
      { label: 'Nothing yet', phrase: 'starting from zero' },
      { label: 'A logo, not much else', phrase: 'built out from a logo' },
      { label: 'It’s all there, but needs a rethink', phrase: 'rethought from what we have' },
    ],
  },
  {
    id: 'detail-rescue',
    name: 'detail',
    when: 'rescue',
    question: 'What’s wrong with it?',
    options: [
      { label: 'It’s slow or broken', phrase: 'that’s slow or broken' },
      { label: 'It isn’t bringing in work', phrase: 'that isn’t bringing in work' },
      { label: 'Nobody’s looking after it', phrase: 'that nobody’s looking after' },
    ],
  },
];

export const later: BriefChoice[] = [
  {
    id: 'stage',
    name: 'stage',
    question: 'Where are you today?',
    options: [
      { label: 'Just an idea', phrase: 'We’re at the idea stage' },
      { label: 'Getting going', phrase: 'We’re just getting going' },
      { label: 'Established', phrase: 'We’re established' },
      { label: 'An agency, with a client', phrase: 'We’re an agency with a client' },
    ],
  },
  {
    id: 'timeline',
    name: 'timeline',
    question: 'When do you want it live?',
    options: [
      { label: 'As soon as possible', phrase: 'as soon as we can' },
      { label: 'In the next 3 months', phrase: 'in the next three months' },
      { label: 'In 3 to 6 months', phrase: 'in three to six months' },
      { label: 'No fixed date', phrase: 'when it’s right' },
    ],
  },
  {
    id: 'budget',
    name: 'budget',
    question: 'What’s the budget?',
    note: 'A rough range is fine. It helps me point you the right way.',
    options: [
      { label: 'Under $10k', phrase: 'under $10k' },
      { label: '$10k to $25k', phrase: '$10k to $25k' },
      { label: '$25k to $50k', phrase: '$25k to $50k' },
      { label: '$50k or more', phrase: '$50k or more' },
      { label: 'Not sure yet', phrase: 'not set yet' },
    ],
  },
];

export const blocker = {
  question: 'What’s in the way?',
  note: 'Optional, but it’s usually the most useful part.',
  placeholder: 'The thing you’d fix first, if you could…',
};

export const you = {
  question: 'Who am I talking to?',
};

export const review = {
  question: 'Here’s what I heard.',
  note: 'Tap anything in the brief to change it.',
  send: 'Send it to Michael',
};
