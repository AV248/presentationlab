import { LIBRARY, type Speech } from './speeches';

/**
 * Topic hubs — editorial landing pages that group the library by the way
 * people actually search ("wedding speech", "keynote", "how to write a
 * speech"). Each hub carries an original guide, a checklist, and deep links
 * into the matching speeches and templates, and is prerendered with its own
 * title, description and structured data at build time.
 */

export interface Topic {
  slug: string;
  title: string;
  /** One-line standfirst shown under the title. */
  tagline: string;
  /** Meta description for search snippets (~150 chars). */
  description: string;
  /** Guide body, markdown-lite paragraphs (## for subheads). */
  guide: string;
  /** Short actionable checklist. */
  tips: string[];
  /** Library ids that belong to this hub, in display order. */
  speechIds: string[];
}

export const TOPICS: Topic[] = [
  {
    slug: 'public-speaking',
    title: 'The Public Speaking Guide',
    tagline: 'From first draft to final applause — a complete path for people who have to stand up and say something.',
    description:
      'A practical public speaking guide: how to plan a talk, open strong, hold a room and land an ending — with real example speeches you can read for free.',
    guide: `Public speaking is not a talent, it is a sequence. Most talks fail long before anyone reaches the stage — they fail at the planning table, where the speaker decides to cover everything instead of promising one thing. This guide walks the whole sequence: deciding what your talk is for, building a structure that survives your nerves, and rehearsing the parts that actually break under pressure.

## Start with the promise

Before you open a blank page, finish this sentence out loud: "Because of what I am about to say, you will be able to ___." If you cannot finish it, you have a topic, not a talk. A topic is a subject; a talk is a promise. The speeches below were all written this way — read a few and notice how quickly each one tells you what you will get.

## Structure beats confidence

Nervous speakers lean on slides; confident speakers lean on structure. Give your talk a spine — a hook, a promise, three moves and a landing — and practise the handoffs between those moves until they are muscle memory. Sentences can wobble under nerves; architecture cannot.`,
    tips: [
      'Write the last line first — know where you are landing before you take off.',
      'Rehearse the seams (the transitions), not the sentences.',
      'Cut anything you would skip if you were in the audience.',
      'Slow down at the exact moment you most want to speed up.',
      'Record one rehearsal out loud; fix only the two worst moments.',
    ],
    speechIds: ['five-minutes', 'quiet-ones', 'good-meeting', 'lead-without-the-title', 'template-qa-recovery'],
  },
  {
    slug: 'speech-writing',
    title: 'How to Write a Speech',
    tagline: 'A working method for turning a blank page into something worth saying out loud.',
    description:
      'How to write a speech step by step: find the promise, pick a structure, write for the ear not the eye, and edit like a director — with templates and examples.',
    guide: `Speeches are written for the ear, not the eye, and that single fact explains most bad ones. A reader can re-read a sentence; a listener gets one pass. So the craft of speech writing is the craft of being unmistakable the first time: short sentences, signposted turns, ideas that arrive one at a time.

## A four-pass method

First pass: write the promise in one sentence and the landing in one sentence. Second pass: list your moves — story, proof, or ask — everything between those two sentences is one of these three. Third pass: draft at speaking speed, out loud, badly. Fourth pass: the director's cut, where you delete every line that does not serve someone in the back row.

## Steal structure, not sentences

The linked templates are the same skeletons professional speechwriters reuse: And/But/Therefore for narrative, Problem → Proof → Ask for persuasion. Structure is not formula — it is the load-bearing wall that lets your own voice move freely around it.`,
    tips: [
      'Write "you" and "we"; delete "one" and "people in general".',
      'One idea per sentence, one sentence per breath.',
      'Read every draft aloud — the ear catches what the eye forgives.',
      'Put the strongest line last in every section, not first.',
      'If a paragraph needs a slide to survive, rewrite the paragraph.',
    ],
    speechIds: ['five-minutes', 'template-story-structure', 'template-problem-solution', 'explain-to-a-nine-year-old', 'live-theatre'],
  },
  {
    slug: 'presentation-skills',
    title: 'Presentation Skills',
    tagline: 'Slides, pacing, posture and the art of not reading the screen aloud.',
    description:
      'Core presentation skills — structure, slide discipline, vocal pacing and handling questions — taught through worked examples and rehearsal tools.',
    guide: `A presentation is two performances at once: what you say and what the screen says. When they compete, the audience reads the screen — it is faster than you are. When they cooperate, the screen carries the evidence and you carry the meaning.

## Slide discipline

Give each slide one job. If it is evidence, it needs a headline that states the conclusion, not the topic ("Costs fell 18%", not "Cost overview"). If it is a story beat, it needs almost no text at all. And the hardest slide discipline of all: the moment the slide appears, let it sit. You are not its narrator.

## Your voice is the pacing layer

Audiences forgive imperfect slides; they never forgive being rushed. Practise with a timer and a target words-per-minute, mark your natural accelerations, and put deliberate pauses where you tend to gallop. Presentation Buddy's rehearsal mode exists for exactly this — teleprompter, pacing timer and breathing cues, free and offline.`,
    tips: [
      'One slide, one job; the headline states the conclusion.',
      'Never read a slide aloud — add what the slide cannot say.',
      'Pause after numbers; audiences need two seconds to feel them.',
      'Plant your feet before your first sentence, not your third.',
      'End on your line, not on "any questions?".',
    ],
    speechIds: ['shipping-is-a-habit', 'new-standard', 'numbers-our-story', 'template-data-story', 'good-meeting'],
  },
  {
    slug: 'keynote-speeches',
    title: 'Keynote Speeches',
    tagline: 'Twenty minutes to move a whole room — how keynotes are actually built.',
    description:
      'What makes a keynote speech work: the promise, the through-line, stories over slides, and a landing people repeat in the hallway. Read real keynote examples free.',
    guide: `A keynote is not a long talk; it is a short talk with the confidence to repeat itself. The best keynotes say one thing, three ways, at rising stakes — and they trust the audience to assemble the meaning. Read any great conference talk and you will find the same skeleton: a personal opening, a promise made explicit, and a closing image simple enough to tweet.

## The through-line

Every element in a keynote either serves the through-line or dilutes it. Before adding a story, a stat or a slide, ask which sentence of your talk it strengthens. If the answer is "none in particular", it is a second talk trying to sneak into the first.

## Examples to study

The keynote examples in this library were written to be read and raided: a product launch that sells a habit rather than a feature, a public lecture that turns a failed Mars lander into a lesson about honesty. Steal their moves — the openings, the transitions, the landings — not their sentences.`,
    tips: [
      'One message, three stories, rising stakes.',
      'Open with a person in a moment, not a thesis.',
      'Promise early — "by the end you will be able to…" works.',
      'Design the hallway quote: one sentence said at the exit doors.',
      'Finish three minutes before they want you to.',
    ],
    speechIds: ['five-minutes', 'new-standard', 'shipping-is-a-habit', 'next-ten-years', 'beautiful-failure'],
  },
  {
    slug: 'wedding-speeches',
    title: 'Wedding & Ceremony Speeches',
    tagline: 'Toasts, farewells, eulogies and acceptances — the talks that matter most, written with care.',
    description:
      'Wedding toasts, farewell speeches, eulogies and acceptance speeches: how to be warm, brief and specific — with complete example speeches you can adapt.',
    guide: `Ceremony speeches are the highest-stakes writing most people will ever do, and they come with an unkind rule: the more the moment matters, the less anyone wants a long speech. A wedding toast is ninety seconds of specificity. A farewell is one story and one thank-you. A eulogy is the person, made present — not their CV, narrated.

## Specific is the whole job

"She was kind" is a placeholder. "She kept a spare key under the third flowerpot for four different neighbours" is a speech. Gather two or three concrete, checkable, slightly surprising details — the ceremony examples below are built from them, and you can feel the difference in the first paragraph.

## The shape that always works

Hook with a small true scene. Say what the person or the moment taught you. Thank the room by name where it counts. Then stop — sincerely, and thirty seconds before they expect. Every ceremony speech in this library follows that arc, and all of them are free to read and adapt.`,
    tips: [
      'Two minutes is a feature, not a failure. Aim short, land early.',
      'Replace every adjective with a specific moment that proves it.',
      'Name real people; vague gratitude sounds like reading a receipt.',
      'Practise the one paragraph that will make you emotional.',
      'End facing the person the speech is about, glass raised or not.',
    ],
    speechIds: ['toast-i-practised', 'saying-goodbye-well', 'thank-you-yes-i-cried', 'remembering-amma'],
  },
  {
    slug: 'graduation-speeches',
    title: 'Graduation & Commencement Speeches',
    tagline: 'What to say when nobody in the audience remembers being told anything last year either.',
    description:
      'How to write a graduation or commencement speech people actually listen to — honesty over advice, one story over ten lessons. Free examples inside.',
    guide: `Every commencement speech fights the same headwind: the audience has already heard every piece of advice you are about to give. "Follow your passion" arrived years ago and meant nothing then. What graduates have not heard is your specific, slightly embarrassing, true account of what it cost you to learn one real thing.

## Honesty is the differentiator

The commencement address in this library works because it confesses: the speaker had no original thoughts alone in a room, only collisions with the wrong books at the right shelves. That is a claim a graduate can test in their own life — worth more than ten lessons recited from a lectern.

## One story, then the door

Pick the single moment that changed how you work, tell it at eye level, and draw one line from it to the people in the seats. Then give them the party back. The best graduation speech is ten minutes of truth and a quick exit.`,
    tips: [
      'Replace advice with evidence: what it cost you to learn it.',
      'Address the nervous majority, not the decorated front row.',
      'One story told well beats five lessons told adequately.',
      'Quote the students, not the poets — they are the event.',
      'Under twelve minutes is a gift to everyone in the sun.',
    ],
    speechIds: ['library-and-the-internet', 'learning-out-loud', 'explain-to-a-nine-year-old', 'quiet-ones'],
  },
  {
    slug: 'persuasive-speeches',
    title: 'Persuasive & Advocacy Speeches',
    tagline: 'Asks, rallies, budget requests and public apologies — persuasion with its sleeves rolled up.',
    description:
      'Persuasive speech examples and structure: how to make an ask, defend a budget, apologise in public and move a meeting to action. Free templates included.',
    guide: `Persuasion is not pressure; it is alignment. The audience agrees to act when they understand what you want, why now, and what it costs them — in that order. Every advocacy talk, budget ask and campaign rally that works contains those three beats. Every one that fails is missing at least one.

## The Problem → Proof → Ask spine

State the problem in the audience's language, not yours. Offer proof you can defend under hostile questioning — one number, honestly framed, beats five rounded ones. Then make the ask so concrete a stranger could repeat it: how much, by when, from whom. The linked template lays this spine out line by line.

## When you are the problem

Crisis talks are persuasion too, persuasion for a second chance. The apology example in this library follows the only sequence that holds: what happened, what it means for you, what we have already done, what happens next. Hedging costs more credibility than the mistake did.`,
    tips: [
      'Problem, proof, ask — in that order, every single time.',
      'Frame numbers honestly; discovery of spin ends the matter.',
      'Make the ask repeatable: amount, deadline, who acts next.',
      'Answer the objection in the room before it is raised.',
      'In an apology, accuracy is the only sincerity that lands.',
    ],
    speechIds: ['quiet-ones', 'the-budget-ask', 'apologise-in-public', 'river-remembers', 'template-problem-solution'],
  },
  {
    slug: 'business-presentations',
    title: 'Business Presentations & Pitches',
    tagline: 'Investor pitches, annual reviews and all-hands talks that respect the room.',
    description:
      'Business presentation examples: investor pitches, annual reviews and company all-hands. Learn the honest-pitch structure and data storytelling that lands.',
    guide: `Business audiences are the cheapest audience in the world and the most expensive to bore. They will give you generous attention if you do one thing: tell them what the numbers mean for the decisions they actually have to make. Everything else — the mission recap, the agenda slide, the org chart — is throat-clearing.

## The honest pitch

Investors have heard every projection; what they have not heard is a founder who says which assumptions keep them up at night. The pitch example in this library shows the structure: the market in one line, the product in one demo sentence, the traction with its caveats attached, and the ask tied to a milestone a sceptic can verify.

## Make data say a sentence

A data slide should read like a headline, not a spreadsheet. The annual-review example takes one number per pass — what it is, why it moved, what we do about it — and is deliberately repetitive about it. Repetition of structure is what lets a room relax into the content.`,
    tips: [
      'Lead with the decision this presentation supports.',
      'One number per slide; the headline states its meaning.',
      'Name your weakest assumption before someone else does.',
      'Tie every ask to a milestone a sceptic can check.',
      'End early. Credibility rises as overrun falls.',
    ],
    speechIds: ['honest-pitch', 'numbers-our-story', 'next-ten-years', 'template-data-story'],
  },
  {
    slug: 'leadership-talks',
    title: 'Leadership Talks',
    tagline: 'First team meetings, offsites and the talks that set the weather.',
    description:
      'Leadership speech examples: first team meetings, offsites and culture talks. How to set direction without the title doing the talking. Free to read.',
    guide: `A leadership talk is weather-making. Whatever you model in your first ten minutes — candour or theatre, questions or certainty — becomes the climate the team works in for a season. That is why the prepared, honest, slightly unpolished talk beats the slick one: teams calibrate to what feels real.

## Authority without the title

The leadership examples here take two shapes. The first-ninety-days talk sets direction while openly saying what is not yet known — specificity about uncertainty is itself a form of authority. The lead-without-the-title talk is for influence from the middle: fewer pronouncements, more offer of cover. "I will take the risk on this one" is the most persuasive sentence a non-manager can say.

## Set the meeting culture early

If your first team meeting runs long, tolerates interruption and ends without owners, every meeting after it will too. Use your first talks to install the rituals you want repeated: context sent ahead, decisions named out loud, dissent invited early.`,
    tips: [
      'Say what you do not know yet — precisely. It builds authority.',
      'Offer cover: "the risk on this decision is mine".',
      'Name the decision and its owner before anyone leaves.',
      'Model the meeting culture you want in your first ten minutes.',
      'Repeat the direction kindly; new teams need the chorus twice.',
    ],
    speechIds: ['lead-without-the-title', 'first-ninety-days', 'welcome-to-the-team', 'rest-is-part-of-the-work'],
  },
  {
    slug: 'tech-talks',
    title: 'Tech & Science Talks',
    tagline: 'Launch keynotes, public lectures and research you can explain to a nine-year-old.',
    description:
      'Tech talk and science communication examples: launch keynotes, public lectures, and how to explain research to non-specialists — with free example talks.',
    guide: `Technical talks fail in a predictable way: the speaker reports the work instead of translating it. The audience did not come to witness your process; they came for the moment the work becomes theirs — the demo that makes them reach for it, the analogy that makes a paper applicable to their own field.

## Abstraction ladders

Great science communicators climb up and down the abstraction ladder on purpose: the concrete story, the principle it illustrates, the second concrete case that proves the principle travels. The research-talk example in this library was built for a nine-year-old audience on purpose — if your explanation survives a classroom, a boardroom is easy.

## Demo honesty

Nothing sells a launch like showing the real thing, including its seams. The Mars lander lecture in this collection is the masterclass: a public talk about a failure, told with the telemetry on the screen, that left the room trusting the team more than a success story would have.`,
    tips: [
      'Translate, do not report: the audience wants the meaning.',
      'Alternate concrete story → principle → travelling example.',
      'Show the real product, seams and all — demos beat renderings.',
      'Explain it to a nine-year-old first; the adult version follows.',
      'Failures told precisely build more trust than victories.',
    ],
    speechIds: ['shipping-is-a-habit', 'new-standard', 'beautiful-failure', 'explain-to-a-nine-year-old'],
  },
  {
    slug: 'speech-templates',
    title: 'Speech Templates & Frameworks',
    tagline: 'Six working skeletons — narrative, persuasive, intros, data, hard conversations and Q&A.',
    description:
      'Free speech templates and frameworks: And/But/Therefore narrative, Problem → Proof → Ask, 90-second introductions, data stories, hard conversations and Q&A recovery.',
    guide: `Templates get a bad reputation from people who use them as scripts. Used properly, a template is scaffolding: it carries the load while your own material goes in, and it comes down when the building stands. These six frameworks exist because the same six situations keep recurring, and each has a shape that reliably works.

## The six, in one line each

And/But/Therefore keeps a story moving because every beat changes direction. Problem → Proof → Ask persuades without pressure. The 90-second introduction trades your biography for one useful fact about you. One Number, Three Passes makes data memorable. The Hard Conversation sequence keeps feedback specific and kind. Handling Any Question turns Q&A from an ambush into a format you control.

## How to use them

Pick the skeleton that matches your situation, fill every bracket with your own concrete detail, then read it aloud twice and cut a third. The template holds the shape; only you can hold the specifics.`,
    tips: [
      'Choose the framework by situation, not by preference.',
      'Fill every bracket with checkable, yours-only detail.',
      'Cut a third after the first read-aloud. Always a third.',
      'Keep the skeleton invisible; let the specifics carry it.',
      'Rehearse the shape until you can improvise inside it.',
    ],
    speechIds: [
      'template-story-structure',
      'template-problem-solution',
      'template-90-second-intro',
      'template-data-story',
      'template-difficult-conversation',
      'template-qa-recovery',
    ],
  },
  {
    slug: 'motivational-speeches',
    title: 'Motivational & Team Speeches',
    tagline: 'Locker rooms, kick-offs and hard seasons — pep talks that do not insult anyone.',
    description:
      'Motivational speech examples that respect the audience: locker-room talks, team kick-offs and hard-season speeches. Free examples you can adapt today.',
    guide: `The motivational speech has a credibility problem it created itself: too many speakers promised transformation and delivered slogans. Real motivation is quieter — it names the difficulty honestly, reminds the room of evidence they already own, and asks for the next concrete action. Anything bigger is theatre.

## Evidence over adrenaline

The locker-room talk in this library spends most of its two minutes on moments the team already lived: the comeback in October, the drill nobody skips anymore. That is the pattern that works — the speaker's job is not to inject belief but to retrieve it from where the team left it.

## Match the speech to the season

A kick-off needs direction and appetite. Mid-season, after losses, it needs honesty about the table and a smaller mountain to climb first. The kick-off and hard-season examples here show both registers; notice the hard-season one is shorter. Exhausted teams do not need more words.`,
    tips: [
      'Retrieve belief from the team’s own history, not your adjectives.',
      'Name the difficulty before you promise the outcome.',
      'Ask for the next concrete action, not a new personality.',
      'Shorter when the season is harder. Always.',
      'End on a shared ritual the room can actually do together.',
    ],
    speechIds: ['rest-is-part-of-the-work', 'last-two-minutes', 'welcome-to-the-team', 'our-street'],
  },
  {
    slug: 'storytelling-for-speakers',
    title: 'Storytelling for Speakers',
    tagline: 'Why rooms lean in for stories and check out for slides — and how to tell one properly.',
    description:
      'Storytelling techniques for public speakers: the And/But/Therefore engine, scene-by-scene structure, and where to place stories in a talk. Free framework.',
    guide: `A story is not decoration you add to a talk; it is the delivery mechanism the whole talk rides on. Audiences forget frameworks within days but retell stories for years, carrying your point inside them. The question is never whether to use stories — it is whether yours are engineered or merely recounted.

## And, But, Therefore

Stories die from "and then" chains: this happened, and then this, and then this. The fix is a three-word engine. "And" adds context. "But" breaks expectation and creates tension. "Therefore" pays tension off with consequence. Map any gripping narrative — film, novel, keynote — and you will find those joints wherever the audience leans in.

## Placement is strategy

Open with a story small enough to finish in ninety seconds. Put your longest story at the two-thirds mark, where attention naturally dips. Close the talk by returning to the opening scene with new meaning — the callback is the cheapest standing ovation in public speaking, and you will see it at work throughout this library.`,
    tips: [
      'Chain beats with But and Therefore, never with And Then.',
      'Open with a scene: a person, a place, a problem in motion.',
      'Detail one sense per scene — what it sounded like is enough.',
      'Plant your longest story where attention dips: two-thirds in.',
      'Return to the opening scene for the close. Callbacks land.',
    ],
    speechIds: ['template-story-structure', 'live-theatre', 'remembering-amma', 'five-minutes'],
  },
  {
    slug: 'speaking-confidence',
    title: 'Nerves, Confidence & Stage Fright',
    tagline: 'For the shaking hands and the racing heart — practical calm for people who dread the microphone.',
    description:
      'How to handle public speaking nerves: breathing, rehearsal that works, what to do in the first 30 seconds, and gentle example speeches for the quiet ones.',
    guide: `Stage fright is not a character flaw; it is a body misreading the room as a predator. The adrenaline is real, and the goal is not to eliminate it — speakers who feel nothing are usually worse — but to give it a job. Every technique that actually works converts fear energy into preparation energy.

## Adrenaline has a schedule

Nerves peak in the minutes before you begin and fall steadily once you are moving. So do your hardest work before the room: arrive early enough that the space is familiar, take three slow breaths with long exhales, and know your first three sentences so cold that no amount of shaking can dislodge them. Confidence is often just the first thirty seconds going well.

## Built for the quiet ones

The example speech "A Case for the Quiet Ones" was written for exactly this audience — people whose best thinking happens in preparation, not performance. Read it, then steal its permission slip: you do not have to become loud to become excellent at this.`,
    tips: [
      'Know your first three sentences word-perfect; nerves peak at the start.',
      'Exhale longer than you inhale, three times, before you stand.',
      'Arrive early and own the room before the audience does.',
      'Name it once if it shows: "as you can tell, this matters to me".',
      'Rehearse in the outfit and the posture, not just the chair.',
    ],
    speechIds: ['quiet-ones', 'toast-i-practised', 'template-90-second-intro', 'template-qa-recovery'],
  },
];

export const topicBySlug = (slug: string | undefined) =>
  TOPICS.find((topic) => topic.slug === slug);

/** Speeches that belong to a hub, in curated order. */
export function speechesForTopic(topic: Topic): Speech[] {
  return topic.speechIds
    .map((id) => LIBRARY.find((speech) => speech.id === id))
    .filter((speech): speech is Speech => Boolean(speech));
}
