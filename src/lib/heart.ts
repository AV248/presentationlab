/**
 * The parts of Presentation Buddy that are not engineering.
 * Small pieces of writing that make the room feel less like software.
 */

export function greetingFor(date: Date): string {
  const hour = date.getHours();
  if (hour < 5) return 'Still up?';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  if (hour < 22) return 'Good evening';
  return 'Good evening — one more, then bed';
}

/** Opening lines to steal when the page is blank. */
export const FIRST_LINES = [
  'There is a version of this story where nothing changes. Let me tell you about the other one.',
  'I want to start with the thing nobody says out loud in rooms like this.',
  'Three years ago I got this badly wrong. Here is exactly what happened.',
  'Promise me one small thing before I start: disagree with me out loud if you need to.',
  'Look at the person on your left. Now the person on your right. One of you will need this today.',
  'I am not going to tell you the answer. I am going to tell you what changed my mind.',
  'Everything I am about to say fits on an index card. I brought the index card.',
  'The honest version is shorter than the one I rehearsed. I will try to give you the honest one.',
  'Someone in this room is about to make a decision that affects the next ten years.',
  'I have been nervous about this talk for eleven days. That turns out to be a good sign.',
];

/** Prompts for the letter you write to yourself after a rehearsal. */
export const LETTER_PROMPTS = [
  'What are you most afraid of, written down where you can read it back?',
  'Who is this speech actually for? Name them.',
  'What is the one sentence you must not forget, even if you forget everything else?',
  'What would you like to be told five minutes before you walk on?',
  'What is the smallest thing that would make tomorrow’s version better?',
  'What are you proud of finishing today, however small?',
];

/** Encouragements shown at the end of a rehearsal. */
export const AFTER_PRACTICE = [
  'That was a real run. Most people never do the first one.',
  'You said the hard sentence out loud. That is the whole job.',
  'Breathe. The room is going to be kinder than this rehearsal was.',
  'Notice what felt easy — that part is ready.',
  'You are allowed to change one line. Just one.',
  'Again tomorrow, once, and it will feel like yours.',
];

/** The colophon, printed at the foot of the About page. */
export const COLOPHON = {
  type: 'Set in Fraunces and Newsreader, with Caveat for the notes people leave in the margins.',
  made: 'Made for anyone who has ever stood at the back of a room, waiting to be introduced.',
  promise: 'No trackers, no dark patterns, no numbers that mean nothing.',
};

export interface Milestone {
  id: string;
  title: string;
  line: string;
}

export const MILESTONES: Milestone[] = [
  {
    id: 'first-draft',
    title: 'First draft',
    line: 'You wrote something that did not exist this morning. Most people talk about doing that.',
  },
  {
    id: 'first-rehearsal',
    title: 'First rehearsal',
    line: 'You said it out loud with the clock running. That is where a talk stops being an idea.',
  },
  {
    id: 'first-publish',
    title: 'First speech shared',
    line: 'Someone you will never meet can now read your words before a room of their own.',
  },
  {
    id: 'first-line',
    title: 'First line kept',
    line: 'A sentence stopped you. You kept it. That is how a voice gets built.',
  },
  {
    id: 'first-margin',
    title: 'First margin note',
    line: 'You argued with a page. That is reading properly.',
  },
  {
    id: 'first-post',
    title: 'First open-mic note',
    line: 'You put a thought where other speakers could find it.',
  },
];

/** A slow, honest breathing pattern for the minutes before you speak. */
export const BREATH = { inMs: 4000, holdMs: 4000, outMs: 6000, holdOutMs: 2000 };

export function breathPhase(elapsedMs: number): { label: string; remaining: number; total: number } {
  const cycle = BREATH.inMs + BREATH.holdMs + BREATH.outMs + BREATH.holdOutMs;
  const position = elapsedMs % cycle;
  if (position < BREATH.inMs) return { label: 'Breathe in', remaining: BREATH.inMs - position, total: BREATH.inMs };
  if (position < BREATH.inMs + BREATH.holdMs)
    return { label: 'Hold', remaining: BREATH.inMs + BREATH.holdMs - position, total: BREATH.holdMs };
  if (position < BREATH.inMs + BREATH.holdMs + BREATH.outMs)
    return {
      label: 'Breathe out',
      remaining: BREATH.inMs + BREATH.holdMs + BREATH.outMs - position,
      total: BREATH.outMs,
    };
  return { label: 'Rest', remaining: cycle - position, total: BREATH.holdOutMs };
}

/** Pick something from a list without repeating back-to-back. */
export function pick<T>(list: T[], avoid?: T): T {
  if (list.length < 2) return list[0];
  let choice = list[Math.floor(Math.random() * list.length)];
  let guard = 0;
  while (choice === avoid && guard < 8) {
    choice = list[Math.floor(Math.random() * list.length)];
    guard += 1;
  }
  return choice;
}
