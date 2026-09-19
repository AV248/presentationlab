export type SpeechKind = 'speech' | 'template';
export type SpeechLevel = 'Warm-up' | 'Standard' | 'Keynote';

export interface Speech {
  id: string;
  kind: SpeechKind;
  title: string;
  author: string;
  category: string;
  occasion: string;
  level: SpeechLevel;
  tags: string[];
  preview: string;
  content: string;
  createdAt: string;
}

/**
 * The built-in collection. Everything here is original writing, shipped with
 * the app so Presentation Buddy is genuinely useful the second it loads —
 * with or without an internet connection.
 */
export const LIBRARY: Speech[] = [
  {
    id: 'five-minutes',
    kind: 'speech',
    title: 'The Five Minutes That Change Everything',
    author: 'Nadia Bhattarai',
    category: 'Career',
    occasion: 'Conference keynote',
    level: 'Keynote',
    tags: ['preparation', 'craft', 'confidence'],
    preview:
      'Nobody remembers your forty-third slide. They remember the moment you stopped performing and started talking to them.',
    createdAt: '2026-01-12',
    content: `## The room is not the point

I used to think a great talk was built out of great slides. So I made more of them. Forty-three slides for a twelve minute slot. I practised the transitions. I memorised the punchlines. And when I stood up, I watched the room slowly tilt away from me — laptops opening, shoulders dropping, the tiny, devastating choreography of people deciding you are not worth their attention.

What I understand now is that a room does not lean in because your deck is clever. A room leans in because, somewhere in the first ninety seconds, you said one true thing that belonged to them.

## Find the one true thing

Here is the exercise I give every speaker I coach. Before you touch a slide, finish this sentence out loud, in plain language, with no jargon allowed:

> Because of what I am about to say, you will be able to ___.

If you cannot finish it, you do not have a talk yet. You have a topic. A topic is a subject. A talk is a promise.

The best promise I ever heard was from a structural engineer who opened with: "By the time I finish, you will be able to walk past any bridge in this city and know whether it was built for the last century or the next one." Twenty minutes later, every person in that room was looking at bridges differently. That is the whole job.

## Practise the seams, not the sentences

Most people rehearse by reading their script until it feels smooth. That is rehearsing the wrong thing. Sentences are easy — you improvise sentences all day. What actually breaks under pressure are the seams: the handoff from the story to the data, the moment the slide changes, the beat where you ask for something.

So mark your seams. Put a star in the margin where your talk changes direction. Rehearse only those five or six transitions, over and over, until they are muscle memory. When the nerves arrive — and they will arrive — your sentences can wobble and nobody will care, because the architecture is holding.

## Leave them one thing

A talk is not a download of everything you know. It is a single, well-made object you hand to someone on their way out the door.

So: one promise, kept. One story, told honestly. One thing they can do on Monday morning. If you do that in five minutes, you have done more than most people manage in an hour.`,
  },
  {
    id: 'thank-you-yes-i-cried',
    kind: 'speech',
    title: 'Thank You, and Yes, I Cried',
    author: 'Marcus Oyelaran',
    category: 'Ceremony',
    occasion: 'Award acceptance',
    level: 'Warm-up',
    tags: ['gratitude', 'humility', 'short'],
    preview:
      'An acceptance speech that stays under two minutes, names real people, and resists the urge to summarise a career.',
    createdAt: '2026-01-08',
    content: `Thank you. And yes — I cried. I want to acknowledge that up front so we can all move on.

## The honest version

I have rehearsed a gracious version of this in my head for about a decade, and now that I am standing here, none of it feels true. So let me say the honest version instead.

The honest version is that nothing I have made was made alone. There is a version of this award where one person's name is on it, and that version is a lie.

## Three names

The first is my mother, who worked night shifts for eleven years and never once let me believe that was unusual. Every hour I have ever spent on my own work was bought with one of hers.

The second is Priya Raman, who read the worst draft of my first project, told me the truth about it, and then stayed up with me until 3am fixing it. Talent is common. People who will tell you the truth about your worst draft are not.

The third is everyone in this room who has ever sent a stranger's work to someone else and said: read this one. That is the invisible economy our whole field runs on, and it is the only reason any of us are here.

## What I am taking home

I am taking home one thing, which is that this is not a finish line, it is a louder starting line. The microphone is briefly bigger. So I will try to use it the way Priya used hers — to point at work that deserves more attention than it is getting.

Thank you for the enormous honour. Thank you for the eleven years of nights. And thank you for letting me cry in front of you; I will be normal again by the reception.`,
  },
  {
    id: 'library-and-the-internet',
    kind: 'speech',
    title: 'What the Library Taught Me About the Internet',
    author: 'Dr. Elena Vasquez',
    category: 'Education',
    occasion: 'Commencement address',
    level: 'Keynote',
    tags: ['commencement', 'attention', 'wisdom'],
    preview:
      'A commencement address about attention, borrowed books, and why the slowest sources are often the most reliable.',
    createdAt: '2026-02-02',
    content: `## A confession about my education

I want to confess something on the day you graduate. In four years of university, I did not have a single original thought sitting alone in my room. Every idea I am proud of arrived because I was standing near a shelf I had not planned to visit.

That is not a romantic way of describing research. It is a structural fact about how thinking works. You cannot look up what you do not know exists. You can only bump into it.

## The gift of the wrong book

The library's great gift is not the book you came for. It is the three books next to it. The one with the cracked spine that somebody else abandoned on the table. The one whose title you would never have typed into a box, because you had no reason to believe you wanted it.

The internet is extraordinary at giving you the book you came for. It is almost perfectly useless at giving you the wrong one.

This matters more than it sounds. Most of the mistakes in my life were not made from ignorance; they were made from a very efficient search that never once surprised me.

## You are now the curator of your own attention

After today, nobody will assign you a reading list again. That is the real graduation. And the dangerous thing about freedom is that it is invisible — you don't notice you have stopped reading widely, you only notice, years later, that all of your opinions have started to sound like each other.

So here is my ask, and it is small and boring and it works: once a month, read something you cannot use. Not for work, not for a class, not to be interesting at dinner. Read it because the shelf you did not plan to visit is where your next decade is hiding.

## The last thing

Graduates, you are about to become very good at finding answers. Please stay good at finding questions. The answers are searchable now. The questions are still, and maybe always, something you have to walk into a quiet room and bump into.`,
  },
  {
    id: 'shipping-is-a-habit',
    kind: 'speech',
    title: 'Shipping Is a Habit, Not an Event',
    author: 'Tomás Iglesias',
    category: 'Technology',
    occasion: 'Product launch',
    level: 'Standard',
    tags: ['product', 'momentum', 'teams'],
    preview:
      'The launch is not the finish line — it is the day your habits become visible to everyone watching.',
    createdAt: '2026-01-28',
    content: `## Everyone loves a launch day

Launch day is the most photographed day in the life of a product. There are screenshots, a countdown, someone has made a cake. It is the day the work becomes visible.

It is also, and I say this with love, the least important day.

Because by launch day, every decision that mattered has already been made. The launch is a photograph of your habits. If your team ships in small, honest increments, launch day is calm. If your team hides work for six weeks and hopes, launch day is a hostage situation with better catering.

## What we changed

Eighteen months ago we made one rule. Every Friday, something ships. Not something big. Something real. A fix, a copy change, a deleted feature.

The first month was humiliating. We shipped things so small they were almost embarrassing, and you could feel the team thinking: is this what we have been reduced to?

But a rhythm is a strange thing. By month three, the embarrassing small things had quietly removed every excuse for the big things. You cannot say a change is "too risky to ship this week" when you shipped six changes last week.

## Three things the habit bought us

First: we stopped being afraid of our own codebase, because we visited it constantly.

Second: our estimates got honest. When you ship weekly, you find out in seven days whether you understood the problem, not in seven months.

Third — and this is the one nobody predicts — arguing got cheaper. When the cost of trying something is one week instead of one quarter, disagreements stop being ideological. You just try it.

## The invitation

So here is what I would like you to take from today. Do not copy our product. Copy the Friday.

Pick a day. Pick something small and real. Ship it. Then do it again next week, even when it feels undignified, especially then. The version of your team that exists after a year of Fridays is unrecognisable, in the best way, to the version standing here today.`,
  },
  {
    id: 'beautiful-failure',
    kind: 'speech',
    title: 'The Beautiful Failure of the Mars Lander',
    author: 'Dr. Anjali Koirala',
    category: 'Science',
    occasion: 'Public lecture',
    level: 'Standard',
    tags: ['science', 'failure', 'curiosity'],
    preview:
      'On the value of a hypothesis that dies cleanly, and why engineers should grieve their instruments out loud.',
    createdAt: '2026-02-14',
    content: `## It failed at 2,340 metres

Our lander died 2,340 metres above the surface. It did not crash in a fireball. It did something much sadder: it worked perfectly right up until the moment one number, calculated on one afternoon by one tired person, disagreed with another number by a factor of two.

A factor of two. That is the entire distance between a historic landing and a very expensive hole in a very distant planet.

## The temptation to hide

There is a strong temptation, when something fails publicly, to make the story about the tragedy. To let the failure be weather — something that happened to us.

I want to refuse that framing, because what actually happened is far more interesting. What happened is that a hypothesis died cleanly.

## What a clean death gives you

In science, most ideas are wrong. That is not a crisis, it is the operating condition. The precious thing is not being right often — it is being wrong in a way that leaves you knowing more than you did before.

Our failure was clean. It told us, precisely, which link in the chain was weak, on which day, under which conditions. That information is now in the hands of every team designing the next descent. In a very real sense, the lander succeeded at its most important job: it eliminated a wrong answer, permanently, for everyone.

## Let people grieve the instrument

One more thing, and it is the part nobody puts in press releases.

We built that machine for six years. People skipped birthdays for it. Someone learned to weld for it. When it stopped transmitting, the room went completely silent for eleven seconds — I timed it.

We let that silence happen. We did not immediately start the retro. And I think that mattered, because teams that are not allowed to grieve a failure start hiding the small ones, and the small hidden ones are how the big ones get built.

## The ask

So: when something of yours fails, ask two questions. What did this eliminate? And who needs to be allowed to feel bad about it for a few quiet seconds before we get back to work?`,
  },
  {
    id: 'our-street',
    kind: 'speech',
    title: 'Our Street, Ourselves',
    author: 'Grace Adeyemi',
    category: 'Community',
    occasion: 'Neighbourhood meeting',
    level: 'Warm-up',
    tags: ['community', 'belonging', 'local'],
    preview:
      'A short, practical case for the three-block radius — and why knowing four neighbours changes everything.',
    createdAt: '2026-01-19',
    content: `## A question I could not answer

Two years ago a social worker asked me a simple question: how many people on your street could you call at 2am?

I said four. I was wrong. The honest answer was one, and she lived two streets away and was a light sleeper.

That number has stuck with me, because it turns out to be one of the most predictive numbers in a person's life. Not your income, not your job title — how many doors within a three-block radius would open for you at 2am.

## Why the number collapsed

Nobody took it from us. We traded it away, slowly, for things that seemed reasonable at the time. We traded the front step for the back garden. We traded the corner shop for the delivery app. We traded a slightly longer commute for a street where we knew nobody, and the arithmetic felt fine because we only counted money.

## What we did about it

So five of us on this street started something embarrassingly simple. Once a month, on the same Tuesday, at the same time, somebody puts out a folding table and a thermos. No agenda. No committee. No email thread with thirty-seven replies.

You would not believe what has come out of a folding table.

We found out that Mr. Adeyemi — no relation, but I have adopted him — was a mechanic for thirty years and now fixes three neighbours' cars for the price of a cup of tea. We found out that the family at number 12 has been eating dinner at 4pm for a year because of a shift pattern nobody had ever asked about. We found out that the teenager who looks like he is scowling at his phone is actually running a small business delivering groceries to four elderly neighbours, and is incredibly good at it.

## The invitation is boring on purpose

I am not going to ask you to join a committee. Committees are how good intentions go to die.

I am going to ask you to do one thing this week: learn one name. One. The person whose bins go out on the wrong day, the person with the dog, the person who is always in the garden. Learn their name and use it out loud.

Then next month, come to the table. Bring nothing. Stay eleven minutes if that is all you have.

The 2am number on this street is now nineteen. It took two years, one thermos, and no committee whatsoever.`,
  },
  {
    id: 'lead-without-the-title',
    kind: 'speech',
    title: 'Lead Without the Title',
    author: 'Priya Raman',
    category: 'Leadership',
    occasion: 'Team offsite',
    level: 'Standard',
    tags: ['leadership', 'initiative', 'career'],
    preview:
      'Authority is granted. Leadership is taken — and the taking is learnable, specific, and available today.',
    createdAt: '2026-02-21',
    content: `## Nobody is coming to promote you into leadership

There is a story we tell about leadership that goes like this: work hard, be noticed, get given a title, then start leading. The title arrives like a permission slip, and only then are you allowed to have opinions about where the group should go.

I have watched that story waste a lot of good people.

The truth is almost the reverse. Leadership is not granted and then practised. It is practised, clumsily and in small ways, until the title becomes a description of what you were already doing.

## Three things you can do on Monday

**One: name the thing nobody has named.** Every project has a problem that everyone can feel and nobody has said out loud. The deadline that will not hold. The meeting that should be an email. Saying it plainly, without blame, is the single cheapest act of leadership available to you. It costs ninety seconds.

**Two: write the summary nobody asked for.** After any meeting of more than four people, send ten lines: what we decided, what we did not, who owns what, when we look again. This is not admin. This is how a group discovers it has a memory, and the person who builds that memory becomes, without asking, load-bearing.

**Three: take the worst job once.** Not forever. Once. The task nobody wants — the migration, the complaint, the cleanup — is usually the place where you can learn the system end to end faster than any onboarding document. And people never forget who showed up for the bad one.

## The part about being wrong

You will do these things and sometimes be wrong. You will name a thing that turns out not to be a problem. You will write a summary that misses the real decision.

This is fine. Leadership is not being right in advance; it is being willing to be visibly wrong in service of the group, and then updating quickly and without ego. The opposite of leadership is not error. The opposite is silence.

## What I am actually asking

Your title describes your accountabilities. It does not describe your contribution. Those are different, and only one of them is yours to decide.

So decide something this week. Name the thing. Write the summary. Take the bad job once. Then watch how fast the room starts turning toward you when a hard question is asked.`,
  },
  {
    id: 'honest-pitch',
    kind: 'speech',
    title: 'The Honest Pitch',
    author: 'Daniel Osei',
    category: 'Sales',
    occasion: 'Investor pitch',
    level: 'Standard',
    tags: ['pitch', 'trust', 'clarity'],
    preview:
      'Name your own weakness before they find it. It is the fastest way to be believed about your strengths.',
    createdAt: '2026-01-24',
    content: `## I am going to tell you what is wrong with this

Most pitches open with a strength. I am going to open with our worst number, because I have sat on your side of this table and I know exactly what you are doing while someone talks at you. You are not listening for reasons to invest. You are listening for the thing they are hiding.

So let me save us both twenty minutes.

## The weakness

Our retention at month six is 61%. The category average is 74%. That is our worst number and it is the number I want to talk about, because it is the whole company in a single figure.

Here is what is actually happening. Customers love the product for eleven weeks. In week twelve, the person who championed it internally moves teams, and nothing in our product survives that. We built for the individual and we are being paid by the organisation.

That is a real problem. It is not a marketing problem. It is an architecture problem, and it has a name: we have no team-level object.

## The plan and the cost

Fixing it takes two quarters and most of our engineering capacity. It will slow our feature velocity to roughly a third of what it is now, and I am telling you that because you will see it in the numbers next quarter and I would rather you heard it from me first.

What we get for that trade is a product that survives the org chart. Our estimate — and it is an estimate, with the assumptions on page nine — is month-six retention above 80% within three quarters of shipping.

## Why I am telling you this

Because if I hide the 61%, you will spend the rest of this meeting hunting, and you will find it, and then every other number I have given you becomes suspect. Trust does not decay linearly. It collapses in a single moment and takes the whole deck with it.

If I hand you the 61% myself, we get to spend this meeting on the only question that matters: is the fix worth the two quarters?

## The ask

We are raising to fund exactly this. If you believe the diagnosis, we should talk. If you think the diagnosis is wrong, tell me now — I would rather be corrected by someone who has read page nine than funded by someone who has not.`,
  },
  {
    id: 'rest-is-part-of-the-work',
    kind: 'speech',
    title: 'Rest Is Part of the Work',
    author: 'Dr. Mei-Ling Chen',
    category: 'Wellness',
    occasion: 'Team talk',
    level: 'Warm-up',
    tags: ['wellbeing', 'sustainability', 'boundaries'],
    preview:
      'A short talk that reframes rest as a phase of production rather than the absence of it.',
    createdAt: '2026-02-09',
    content: `## The line I believed for twelve years

For twelve years I believed that rest was what happened when the work was finished. The work was never finished. So, mathematically, I never rested, and I treated that as a character strength.

Then I spent a year looking at my own output data, because I am the kind of person who has output data, and the pattern was almost insultingly clear.

## What the numbers said

My best work — the work that other people still cite — was produced in the first four hours of the day, in the first three days after a real break, and almost never after 9pm. My worst work, the work I ended up deleting, was produced in exactly the hours I had been most proud of working: the late ones, the weekend ones, the heroic ones.

I had been treating my most productive hours as a starting budget and my least productive hours as evidence of virtue.

## Reframe it as a phase

Here is the reframe that changed how I operate. Rest is not the absence of work. Rest is a phase of work.

Your brain consolidates during sleep. It makes remote associations while you walk. Solutions to problems you have been grinding on arrive in the shower, in a queue, on a bus — not because you stopped thinking, but because a different part of the process finally got the conditions it needed.

You cannot schedule insight. You can only build the conditions where it is possible, and then stop blocking the door.

## Three things that are actually in your control

Protect the first four hours. Not with willpower — with calendar blocks and a door.

Take the full break. A holiday where you check email daily is not a break. It is a change of office with worse coffee.

And leave one thing unfinished at the end of each day. This is the old writer's trick and it works: stopping mid-thought gives tomorrow's brain a doorway to walk straight through, instead of a blank page and a cold start.

## The honest ending

I am not going to tell you to work less because it is good for you, although it is. I am telling you because the version of your work that survives a decade is not the version produced by the person who never stopped.

The marathon runner does not win by refusing to walk. She wins by recovering better than everyone else, for forty kilometres, and then again next season.`,
  },
  {
    id: 'river-remembers',
    kind: 'speech',
    title: 'The River Remembers',
    author: 'Sunita Gurung',
    category: 'Environment',
    occasion: 'Rally / public meeting',
    level: 'Standard',
    tags: ['environment', 'activism', 'local'],
    preview:
      'A rally speech about a single river, told through the people who measured it, not the statistics about it.',
    createdAt: '2026-02-26',
    content: `## My grandfather measured this river with a stick

My grandfather measured the Bagmati with a bamboo stick and a notch he had cut by hand. Every monsoon, for forty-one years, he wrote one number in one notebook: the high-water mark at the third bend.

He was not a scientist. He was a farmer who needed to know whether to plant the low field.

That notebook is the longest continuous hydrological record in this valley, and it is the reason we are standing here today.

## What the stick says

The stick says this. In the 1970s, the river peaked in late July and receded by late September. Predictable enough to plant by. Through the 1990s, the peak moved earlier and got angrier. In the last fifteen years, it has stopped having a season at all — the high water arrives whenever it wants, and it arrives higher.

Farmers describe the same change differently. They say: the river has stopped keeping its promises.

## Why the numbers were not enough

We have had the satellite data for twenty years. We have had the reports. And for twenty years, nothing happened — because a graph of annual precipitation does not make anyone do anything. You can look at a rising line and go home and sleep fine.

What changed things was the notebook. When people held a book with one man's handwriting in it, forty-one years of one man's handwriting, something different happened. It stopped being climate and became a neighbour.

## What we are asking for

Three things, and they are specific.

One: a real-time monitoring station at the third bend, named for the man who measured it with a stick.

Two: a binding watershed plan with a date on it, not a strategy document with a vision on it.

Three: that the people who farm the low fields get a seat at the table where the plan is written, because they hold data no satellite has.

## The last thing

A river is not a resource. It is a relationship, and it has a memory. It remembers every upstream decision we made, and it delivers the bill downstream, on time, every time.

My grandfather's notebook ends in 1998. Somebody needs to pick up the stick. I would like that somebody to be us, together, starting with a monitoring station at the third bend.`,
  },
  {
    id: 'live-theatre',
    kind: 'speech',
    title: 'Why We Still Need Live Theatre',
    author: 'Rosalind Achebe',
    category: 'Arts',
    occasion: 'Opening night',
    level: 'Standard',
    tags: ['arts', 'community', 'presence'],
    preview:
      'An opening-night curtain speech about the one thing a screen cannot do: fail in front of you, on purpose, together.',
    createdAt: '2026-01-31',
    content: `## Welcome, and thank you for leaving the house

Thank you for coming out tonight. I mean that more literally than usual. There is an extraordinary amount of the world's best storytelling available on the device in your pocket, for free, and you chose instead to drive here, park, and sit in a room with three hundred strangers.

I want to tell you what I think you came for, because it is not the story. You can get better stories at home.

## What happens in this room

Here is the thing a screen cannot do. A screen is perfect every time. It is the same performance in Kathmandu as it is in Kansas. It never fluffs a line, never catches a breath wrong, never has an off night.

Tonight, eight people on this stage are going to do something genuinely dangerous. They are going to attempt something difficult, in real time, with no edit, in front of people who can see their faces. They might fail. Not tonight, hopefully — but the possibility is real, and you can feel it, and that feeling is the product.

## Witnessing is not passive

When something goes wrong in a film, the illusion breaks. When something goes wrong on stage and the actor recovers — a stumble turned into a gesture, a dropped prop made into a joke — the illusion gets *stronger*, because you watched a human being think on their feet and you were part of it.

That is why a live audience laughs at things that are not funny on the page. You are not consuming a joke. You are participating in a moment that will never exist again. This performance is a one-off. By tomorrow it will be a memory held by three hundred people who were in the same room, and it cannot be streamed.

## What we owe you

In exchange for your evening, we owe you two things.

First, we owe you effort. Not polish — effort. A clean, safe, forgettable production is a worse gift to you than a messy one that reached for something.

Second, we owe you the truth about the play. We did not make this to be comfortable. There is a scene in the second act that I hope makes at least a few of you genuinely angry. Please stay for it. There is a bar, and it will still be there afterwards.

## Enjoy it

Turn your phones off. Not down — off. The person next to you is about to do something difficult and they deserve the same attention you would give a friend.

Thank you for being here. Let's begin.`,
  },
  {
    id: 'last-two-minutes',
    kind: 'speech',
    title: 'The Last Two Minutes',
    author: 'Coach Harris Whitfield',
    category: 'Sports',
    occasion: 'Team talk / locker room',
    level: 'Warm-up',
    tags: ['sport', 'teamwork', 'resilience'],
    preview:
      'A locker-room talk built on a single, concrete instruction for the last two minutes of a tied game.',
    createdAt: '2026-02-05',
    content: `## Sit down. Listen.

We have been here four times this season. Tied, two minutes, and we have lost three of them. I am not going to talk about heart, because you have heart, and heart is not what lost us those three games.

Here is what lost us those three games. In the last two minutes, every single one of you tried to win it by yourself.

## What the tape says

I watched all three. In the final two minutes across those games, we took eleven shots and made nine of them — but we threw the ball away four times and did not get a single second-chance rebound.

Nine out of eleven is a great night. Four turnovers and zero offensive boards is how you lose a great night.

The reason is not greed. The reason is that when the clock gets loud, everybody's field of vision narrows. You stop seeing the weak-side man. You stop seeing the help. You see the rim, and the rim is the one thing on the court that is always covered.

## One instruction

So here is the whole plan, and it is one instruction, and I want you to say it back to me.

**When the clock is under two minutes, the ball touches two pairs of hands before it goes up.**

That's it. That's the entire adjustment. Two pairs of hands.

Why? Because passing it once buys you two seconds and forces the defence to rotate, and the rotation is where the open man lives. Because a shot created by a pass is a shot someone else helped make, and helped shots go in more often. And because the second pair of hands is usually the person who is standing wide open and has been screaming for eleven seconds.

## Two more things

Defensively: no gambling. Under two minutes, a steal is worth one possession and a gamble costs one possession, but a gamble costs it *for sure*. Stay in front. Make them take a hard two.

And the rebound: whoever shoots, two bodies go to the glass. Not one. Two.

## The last thing

They have won eleven straight. That is not my problem. My problem is eleven straight possessions where two pairs of hands touch the ball.

You already know how to play. You have played forty-two games. Just do not let the clock make you smaller than you are.

Two pairs of hands. Say it back to me.`,
  },
  {
    id: 'quiet-ones',
    kind: 'speech',
    title: 'A Case for the Quiet Ones',
    author: 'Ingrid Sørensen',
    category: 'Advocacy',
    occasion: 'Panel / conference',
    level: 'Standard',
    tags: ['introversion', 'inclusion', 'meetings'],
    preview:
      'A defence of quiet contributors, and three structural changes that let the best idea in the room survive the room.',
    createdAt: '2026-02-18',
    content: `## The best idea in most rooms never gets said

Here is a claim I will defend: in most meetings, the best idea in the room is never spoken out loud. It is held by someone who needs ninety seconds to formulate it, and the room gives them seven.

I am not making an argument about personality types. I am making an argument about information loss. If your process only captures the ideas that arrive fast and loud, you are not running a meritocracy of ideas. You are running a filter for confidence.

## What actually happens

Watch what happens in a typical brainstorm. Someone proposes. The room reacts. Within four seconds, an anchor is set and every subsequent idea is positioned relative to it. The person who needed ninety seconds is now not proposing an idea — they are responding to someone else's.

That is not a thinking style problem. It is a sequencing problem, and sequencing is something you control.

## Three structural fixes

**One: write before you talk.** Six minutes of silent individual writing at the start of every brainstorm. Not optional, not skipped when it feels slow. When everybody arrives with a written idea, the first voice loses its veto, and the data on this is unambiguous — you get more ideas and better ones.

**Two: round-robin before open floor.** One sentence each, in order, no interruptions, no building on others yet. It feels bureaucratic for ninety seconds and it permanently changes who gets to speak.

**Three: separate idea-generation from idea-evaluation.** These are opposite mental motions. Generating needs permission; evaluating needs scepticism. If you do both at once, the sceptics — who are fast and articulate — will accidentally destroy raw ideas before they are finished being built. Run them in two passes.

## The objection I always get

Someone will say: but in a crisis there is no time for silence.

Correct. In a crisis, you want a decision-maker, not a brainstorm. The fix for crisis is clarity about who decides. The fix for everything else — strategy, design, hiring, product — is room for the slow thought.

## What I want you to take away

Quiet people do not need to be fixed. Loud people do not need to be quieter. The room needs to be rebuilt so that a good idea can survive the first eight seconds.

Six silent minutes. One round. Two passes. That is the whole intervention, and it costs less than the meeting you are already having.`,
  },
  {
    id: 'welcome-to-the-team',
    kind: 'speech',
    title: 'Welcome to the Team',
    author: 'Jordan Blake',
    category: 'Career',
    occasion: 'Onboarding',
    level: 'Warm-up',
    tags: ['onboarding', 'culture', 'belonging'],
    preview:
      'What new colleagues are never told: what we actually argue about, how decisions get made, and who to ask.',
    createdAt: '2026-01-15',
    content: `## Welcome. Here is the tour nobody gives you.

Welcome. You have already had the official tour — the values on the wall, the password manager, the fire exit. I want to give you the other tour, the one that actually determines whether you are happy here in six months.

## What we argue about

Every healthy team has one recurring argument. Ours is this: do we fix the thing properly now, or ship the workaround and fix it later?

Neither side is right and the argument never ends, and that is fine — it is load-bearing. The person who says "properly now" is usually thinking about the next two years. The person who says "ship the workaround" is usually thinking about the customer who is waiting today. We need both voices in the room every single time.

If you have an opinion about this — and you will, by week three — say it in the room. That argument is not conflict. It is the sound of the team thinking.

## How decisions actually get made

The official process is in the handbook. The real process is: whoever writes the one-page summary wins.

Not the loudest person. Not the most senior. The person who takes the messy discussion and turns it into ten clear lines — what we decided, what we did not decide, who owns what, when we look again. Write that page and your view becomes the default, because everybody is tired and grateful somebody made it legible.

## Three names to know

Ask Priya anything about how our systems fit together. Ask Marcus before you send anything to a customer — he has an uncanny nose for a sentence that will be misread. Ask Nadia when you are stuck; she asks one question and you suddenly see the problem properly.

## What we will not ask of you

We will not ask you to be available at 11pm. We will not ask you to pretend a deadline is fine when it is not. And we will not ask you to be confident about something you have never done before — that is what the rest of us are for.

## One thing

In your first month, your only job is to ask questions that feel slightly too basic. Everyone here is holding a piece of context that made sense to them once and has never been written down. You are the only person who can find those gaps. So find them, while you still can still see them.`,
  },
  {
    id: 'saying-goodbye-well',
    kind: 'speech',
    title: 'Saying Goodbye Well',
    author: 'Margaret Oyelowo',
    category: 'Ceremony',
    occasion: 'Farewell / retirement',
    level: 'Warm-up',
    tags: ['farewell', 'gratitude', 'legacy'],
    preview:
      'A leaving speech that hands the work forward instead of summarising a career nobody can remember in full.',
    createdAt: '2026-02-12',
    content: `## Twenty-three years, three things

I have been here twenty-three years. Nobody can remember twenty-three years — not even me — so I am going to give you three things instead of a summary.

## The first thing: what I got wrong

In my second year I ran a project that failed publicly and expensively, and I spent about a month quietly deciding that I was not cut out for this work.

A colleague named Frank sat me down and said something I have stolen for the rest of my career: "You are not allowed to conclude anything about yourself from one outcome. One data point is weather."

I have repeated that sentence to maybe forty people since. It is the most useful thing I learned here, and I learned it from failing.

## The second thing: the work is the people

I cannot remember a single deliverable from 2009. Not one. I remember the night four of us ordered terrible pizza and rewrote a proposal, and I remember laughing until we could not type.

That is not nostalgia talking; it is the actual ledger. The documents go into a folder that nobody opens. The nights go into you. Twenty-three years from now, you will not remember this project either. You will remember who was in the room.

So my advice, which nobody asked for: choose the rooms. Choose the people you would stay late with, and then stay late with them, on purpose, while you still can.

## The third thing: a small handover

I am not going to give you a vision for the next decade. You do not need one from somebody whose badge stops working on Friday.

What I will do is hand over the three questions I ask at the start of every project. They have never once failed me.

One: what would we do if we only had a week?

Two: who is going to be quietly annoyed by this, and have we talked to them yet?

Three: in five years, what will we wish we had written down?

Write them on a card. Put them somewhere you will see them. They are better than a strategy document, and they fit in your pocket.

## Thank you

Thank you for twenty-three years, for the terrible pizza, and for Frank, who is here tonight and who still does not know that he changed everything.

I am going to miss this more than I can say in a room without crying, and I have decided that is fine.`,
  },
  {
    id: 'toast-i-practised',
    kind: 'speech',
    title: 'The Toast I Practised in the Shower',
    author: 'Best Man, anonymised',
    category: 'Ceremony',
    occasion: 'Wedding toast',
    level: 'Warm-up',
    tags: ['wedding', 'humour', 'love'],
    preview:
      'A wedding toast that is funny without being cruel, short, and lands on the couple rather than the speaker.',
    createdAt: '2026-01-21',
    content: `## For those who don't know me

For those who don't know me, I'm Dev, and I have known the groom since we were eleven, which means I am legally required to tell you one embarrassing story. I have chosen the least dangerous one, and his mother is here, so please appreciate my restraint.

## The story

When we were fourteen, Aman decided he was going to learn the guitar. He borrowed one, watched four videos, and announced he would be ready to perform in a week.

He was not ready in a week. He was ready in about nine months, and here is the part that matters: for nine months, he played the same three chords, badly, in a garage, every single day, to an audience of one increasingly bored friend.

Years later I asked him why he kept going when he was so obviously terrible. He said, and I am quoting: "I wasn't practising chords. I was practising being someone who finishes things."

## Why I told you that

I told you that because it is the exact quality that makes him a safe person to marry.

He does not do grand romantic gestures. He does the unglamorous version, consistently, for a very long time. He is the person who will still be doing the hard thing on the nine-month Tuesday when nobody is watching and it is not fun.

## To Anjali

Anjali, you did something remarkable. He told me once that he had never met anyone who made him feel like he was allowed to be slow at something. You gave a man who practises three chords for nine months permission to not be finished yet. That is a rarer gift than it sounds.

## The toast

So here is my toast, and then I am going to sit down, because there is cake and I have been told there are exactly two speeches before it.

To Aman and Anjali: may you both always have something you are willing to be bad at for a long time, in front of each other, without flinching.

Ladies and gentlemen, please raise your glasses. To the couple.`,
  },
  {
    id: 'explain-to-a-nine-year-old',
    kind: 'speech',
    title: 'How to Explain Your Research to a Nine-Year-Old',
    author: 'Dr. Samuel Adeyemi',
    category: 'Education',
    occasion: 'Science communication workshop',
    level: 'Standard',
    tags: ['communication', 'clarity', 'science'],
    preview:
      'A practical method for translating specialist work without flattening it — three passes and one test.',
    createdAt: '2026-02-24',
    content: `## The question that exposes everything

Find a nine-year-old and tell them what you do. If they say "cool", you have failed — they are being polite. If they ask a question you did not expect, you have succeeded, because a real question means a real model formed in their head.

Most of us fail this test. Not because the work is too hard. Because we explain it in the order we did it, and nobody experiences anything in the order it was discovered.

## Three passes

**Pass one: the sentence.** One sentence, under fifteen words, with no field-specific nouns. Not "I study protein misfolding in neurodegenerative disease." Try: "I study why brain cells forget how to clean themselves."

Notice the second version has a verb you can picture. That is not dumbing down; it is choosing a better verb.

**Pass two: the picture.** One concrete image that survives being retold. For my work, it is a recycling plant where the sorting machine has broken, so the bins fill up and the workers cannot get to the machines. Every nine-year-old understands a bin that did not get emptied. Almost no nine-year-old understands "proteostasis".

**Pass three: the stakes, in a person.** Not "this could inform therapeutic strategies." Try: "My uncle forgot my name before he forgot my face. I would like the next person to keep their name longer."

That last pass is the one people skip, and it is the only one anyone remembers. Data is forgettable. A person is not.

## The one test

Before you give a talk, hand your explanation to someone outside your field and ask them to explain it back to you. Do not correct them while they do it. What comes back is not their failure to understand — it is a precise map of where your explanation was never actually built.

I have done this with taxi drivers, my dentist, and a very patient group of eleven-year-olds. It has improved my papers more than any reviewer.

## The objection

Someone always says: but if I simplify, I lose the nuance.

You do not lose nuance by being clear. You lose nuance by being vague. Every time I have translated my work for a nine-year-old, I have discovered a place where I did not understand it as well as I thought — and that is the real gift of this exercise. The nine-year-old is not the student. You are.`,
  },
  {
    id: 'numbers-our-story',
    kind: 'speech',
    title: 'Our Numbers, Our Story',
    author: 'Finance lead, anonymised',
    category: 'Business',
    occasion: 'Annual review',
    level: 'Standard',
    tags: ['business', 'data', 'narrative'],
    preview:
      'An annual review that reads the numbers as a story about behaviour, not a scoreboard about performance.',
    createdAt: '2026-01-30',
    content: `## Numbers are not the point

I am going to show you twelve numbers in fifteen minutes. Before I do, I want to say something that sounds strange coming from a finance lead: the numbers are not the point.

The numbers are evidence. They are the footprints. The thing that made the footprints is a set of decisions that people in this room made, and the decisions are what we should be talking about.

## Three numbers that matter

**Revenue: up 22%.** The interesting part is where. 71% of the growth came from customers we already had in 2023. That means we did not win a year of new business; we won a year of not losing people. That is a completely different skill, and it belongs to the support and product teams, not sales.

**Churn: down from 14% to 9%.** This is the number I am proudest of and it is the least glamorous. It came from a thousand unexciting fixes. It also has a warning inside it: our remaining churn is concentrated in month two, and it is concentrated in one onboarding step. That is next year's whole story.

**Gross margin: 68%, down 4 points.** This one is deliberate. We spent the four points on infrastructure that will not pay back until 2027. I want to say that plainly, in advance, so that when the margin looks flat again next year nobody panics and cuts it.

## One number I want to argue about

Our average deal size is up 31%. I am going to argue that this number is partly bad news.

It is up because we stopped serving small customers well. We did not fire them; we simply built everything for the large ones and let the small ones drift. Short term, the average goes up and the chart looks great. Long term, small customers are how large customers find you, and we have quietly closed the front door.

I would like us to ring-fence one team for the small end next year, and I expect it to make this number worse. I am recommending it anyway.

## The ask

Read the appendix. Not now — this week. And when you do, ask of each number: what decision made this footprint?

If we can get in the habit of reading our own numbers as a record of our behaviour, not a verdict on our worth, we will make better decisions with them. That is the entire goal of this meeting.`,
  },
  {
    id: 'the-budget-ask',
    kind: 'speech',
    title: 'The Budget Ask',
    author: 'Programme director, anonymised',
    category: 'Advocacy',
    occasion: 'Funding request',
    level: 'Standard',
    tags: ['funding', 'advocacy', 'clarity'],
    preview:
      'A funding request built on cost-of-inaction arithmetic and a named, dated, measurable commitment.',
    createdAt: '2026-02-07',
    content: `## One number before I start

The programme costs 4.2 million over three years. The cost of not running it is 31 million over the same three years, and I am going to show you exactly where that figure comes from, because I would not believe it either.

## Where the 31 million comes from

Eleven million is emergency response we already pay for. Last year, 4,100 people came through the emergency door for a condition this programme prevents. At an average cost per presentation of 2,680, that is eleven million, and it is the least efficient possible way to deliver care.

Fourteen million is lost productivity, calculated conservatively at the national average wage and capped at six weeks per person, which understates it.

Six million is the downstream cost that never appears in a health budget: school absence, informal care provided by family members who then leave work, and the long tail of a condition that becomes chronic because it was caught late.

Add them, subtract the programme cost, and the saving is 26.8 million. I have rounded down in every single line, and the assumptions are on page four for you to attack.

## What you are actually buying

You are not buying a programme. You are buying 340 people per year who do not become a case file.

Let me make one of them concrete. A 54-year-old named Rajesh, self-employed, no sick pay. He ignored a symptom for five months because the clinic is a half-day round trip and he cannot lose a half-day. By the time he came in, it was a nine-month problem instead of a three-week one.

This programme puts the screening in his workplace. That is the entire intervention. It is not glamorous and it is not new, and it has a 26.8 million argument behind it.

## The commitment

If you fund this, here is what I will report every quarter, publicly, whether it flatters us or not: number screened, number of early detections, cost per detection, and — the one nobody offers — the estimated cost avoided, with the method shown so you can check it.

If, at month eighteen, cost per detection is above 14,000, I will come back to this committee myself and recommend you stop.

## The ask

4.2 million over three years, released against the milestones on page nine.

You are not being asked to take a risk on an idea. You are being asked to move 4.2 million from the column where it is spent badly into the column where it is spent well, and I have shown you the arithmetic.`,
  },
  {
    id: 'remembering-amma',
    kind: 'speech',
    title: 'Remembering Amma',
    author: 'Family, anonymised',
    category: 'Ceremony',
    occasion: 'Eulogy',
    level: 'Warm-up',
    tags: ['eulogy', 'family', 'memory'],
    preview:
      'A eulogy built from three specific memories rather than a list of virtues — and an invitation to add a fourth.',
    createdAt: '2026-01-17',
    content: `## She would have hated this

She would have hated this. Not the occasion — she loved an occasion — but the fuss. If she were here she would already be telling me to sit down and stop making it about me, so I will be brief, which is the last thing she ever successfully asked of anyone.

## Three memories

The first: she kept a jar of coins by the door labelled "for people who need it more". Every few months it would be empty and she would start again. When I was about nine I asked her who it was for, and she said: "whoever tells me." She never once asked anyone to justify it.

The second: she made the same phone call every Sunday for thirty-one years. Same time, same question — "have you eaten?" — to the same person, who had, every single week, eaten. She knew he had eaten. The question was never about food.

The third, and the one I think about most: when I failed my first year of university, she did not say it would be fine. She sat with me in the kitchen for a long time and let it not be fine. Then she made tea and said: "so, what is the next thing?" She never wasted a single moment pretending something hard was easy, and she never once let hard mean over.

## What she actually taught

People will say she was kind. She was. But kindness is not what I am taking from her, because kindness sounds like a soft thing and hers was not soft at all.

What she had was an unshakeable belief that a person's circumstances were not a verdict on them. She applied it to the man at the door with the jar, to the cousin on the Sunday call, to me in the kitchen, and to every single person she met. It was the most stubborn thing about her.

## An invitation

I have three memories and there are four hundred people in this room, which means there are about a thousand more that belong to you.

So please: after this, tell somebody one. Say it out loud, in the car park, over tea. Tell the one about the coins or the phone call or a Tuesday I know nothing about.

That is how she stays. Not in a speech about how kind she was — in a thousand small stories told badly by people who loved her, to people who will then tell them slightly wrong, forever.

Thank you, Amma, for the jar, for the Sunday call, and for the kitchen. We will keep asking what the next thing is.`,
  },
  {
    id: 'new-standard',
    kind: 'speech',
    title: 'Introducing the New Standard',
    author: 'Keynote, anonymised',
    category: 'Technology',
    occasion: 'Launch keynote',
    level: 'Keynote',
    tags: ['launch', 'product', 'future'],
    preview:
      'A launch keynote structured as problem, proof, and promise — with the constraint stated before the demo.',
    createdAt: '2026-02-19',
    content: `## Start with the problem, not the product

Every launch starts with a product. I want to start with a number that made us angry.

The average knowledge worker spends 4.1 hours a week looking for documents they themselves wrote. Not reading them. Looking for them. Four point one hours, per person, per week, and the number has not moved in nine years.

We have made the writing faster and the finding slower, and then we congratulated ourselves on the writing.

## The constraint we set ourselves

Two years ago we wrote one constraint on a whiteboard and did not erase it: **no new interface.**

Not "a better interface". No new interface. Because the reason search fails is not that the search box is bad. It is that you have to leave what you are doing to go and ask a question. Every retrieval system we have built for forty years requires you to stop, formulate a query, and go somewhere else.

So the constraint was: the thing you need has to arrive inside the work, without being asked, and it has to be right often enough that you trust it. Not always right — trusted enough.

## What we built

Three pieces.

A live model of what you are working on, held entirely on your device. Not a copy of your documents — a model of your intent, which is a much smaller and much more private thing.

A retrieval layer that reads that model and pulls from everything you have ever touched, ranked by what you are doing right now rather than what you typed last.

And a confidence gate. This is the part I am proudest of. The system does not show you anything unless it is at least 80% sure the suggestion is useful. Below that threshold, it stays silent. A system that is occasionally brilliant and often noisy is worse than no system, because it trains you to stop looking.

## The proof

We have had this running internally for eleven months. The 4.1 hours is now 1.3. Ninety-one percent of people who try it for three weeks are still using it at week twelve, which is the only retention number that has ever mattered to me.

And the number I did not expect: people report finding documents they had forgotten writing, and 22% of what the system surfaces is something the person did not know they had. That is the part that made me think we are onto something bigger than search.

## The promise

Available today, on the four platforms you asked about most, with the on-device model as the default and the cloud version opt-in and off by default.

No new interface. Four hours back in your week. And a system with the good manners to stay quiet when it is not sure.`,
  },
  {
    id: 'first-ninety-days',
    kind: 'speech',
    title: 'The First Ninety Days',
    author: 'New manager, anonymised',
    category: 'Leadership',
    occasion: 'First team meeting',
    level: 'Standard',
    tags: ['management', 'onboarding', 'trust'],
    preview:
      'What a new manager promises in their first ninety days — and the three things they deliberately will not do.',
    createdAt: '2026-02-03',
    content: `## What I am not going to do

I have been in this job for six days, so let me start with what I am not going to do.

I am not going to reorganise anything in the first ninety days. I know there are things you would reorganise, and you probably have strong opinions about them, and I want to hear all of it — but I am not going to act on it until I have watched the system run for a full quarter. A reorganisation designed by someone who has not seen a full cycle is just a guess withauthority behind it.

I am not going to pretend I understand the work better than you do. I have managed teams; I have not done your work. If I say something that reveals I don't know how it actually happens, please tell me immediately and without ceremony. I would rather be corrected in week one than discover it in month six.

## What I will do

Three things.

**One: I will remove blockers, and I will measure myself on it.** Starting this week, there is a standing item in our one-to-ones: what is in your way? My job is not to have good ideas about your work. My job is to make it possible for you to have them.

**Two: I will tell you what I know, including the uncomfortable parts.** I will share what I can about budget, headcount and the company's thinking as soon as I am allowed to. Where I cannot share, I will say "I can't share that yet, and here is when I expect to be able to" — instead of the usual silence, which everyone correctly reads as bad news.

**Three: I will protect the focus blocks.** I have seen what happens to a team whose calendar is shredded by meetings. If you need a standing half-day with no meetings in it, it is approved as of now, and I will defend it against anyone who asks.

## What I need from you

Tell me what is broken. Not in the town hall in week eight — in a one-to-one, next week, plainly.

And tell me what is working that I might accidentally break. New managers break things by optimising the wrong variable, and the only defence is the people who were here before.

## The one promise

In ninety days I will come back to this room and tell you what I got wrong. I will have a list, because everyone has a list, and I would rather own mine publicly than have you compile it privately.

Thank you for having me. Now — what is in your way?`,
  },
  {
    id: 'apologise-in-public',
    kind: 'speech',
    title: 'How to Apologise in Public',
    author: 'Communications lead, anonymised',
    category: 'Advocacy',
    occasion: 'Crisis communication / press',
    level: 'Standard',
    tags: ['crisis', 'trust', 'accountability'],
    preview:
      'The anatomy of an apology that works: name it, own it, fix it, and stop talking about yourself.',
    createdAt: '2026-02-16',
    content: `## What happened

On Tuesday, an update we shipped exposed the email addresses of 41,000 people to other users of the same workspace. It was live for six hours and eleven minutes. We detected it, we fixed it, and we have notified every affected person.

That is the factual summary. Now let me do the part that press statements usually get wrong.

## The four sentences that matter

A public apology has four sentences, and almost everyone writes them in the wrong order.

**Sentence one: what happened, in plain words, with numbers.** No passive voice. Not "an issue was identified". An update we wrote, on Tuesday, exposed 41,000 email addresses. Say it until it sounds bad, because it is bad.

**Sentence two: who was affected.** Not "some users". 41,000 named people, in eleven countries, and here is how to find out if you are one of them.

**Sentence three: what we have already done.** Fixed at this time. Notified at this time. And — this is the part companies skip — what we have done about the *class* of bug, not this instance. We did not ship a bad update. We shipped a bad update because our review process had no test for permission boundaries, and that gap is now closed, with a named owner and a date.

**Sentence four: what happens next, with a date.** Not "we are committed to learning from this." On the 14th, we publish the full technical post-mortem, including the parts that make us look incompetent.

## What never to say

Never say "we apologise if anyone was inconvenienced". The word "if" converts an apology into a hypothetical.

Never say "this is not who we are". If it happened in your system, it is exactly who you are right now. Say what you are changing instead.

And never, ever put the apology in the third paragraph, after two paragraphs about how much you care about trust. If you care about trust, lead with the number.

## Why this works

Trust is not rebuilt by sincerity. It is rebuilt by accuracy under pressure. Every time a company tells the truth about something that makes it look bad, it deposits a little credibility; every time it hedges, it withdraws a lot.

We made a serious mistake this week. We are going to describe it in enough detail that you can check our work. That is the entire strategy, and it is the only one that has ever worked.`,
  },
  {
    id: 'good-meeting',
    kind: 'speech',
    title: 'The Art of the Good Meeting',
    author: 'Operations lead, anonymised',
    category: 'Career',
    occasion: 'Team workshop',
    level: 'Warm-up',
    tags: ['meetings', 'culture', 'productivity'],
    preview:
      'A short, actionable talk on the four conditions that decide whether a meeting was worth the hours it cost.',
    createdAt: '2026-01-26',
    content: `## The arithmetic nobody does

Six people, one hour. That is not one hour. That is six hours of human life, and it happens every week, and almost nobody treats it as a real cost.

If a meeting has six people in it, it needs to produce more than six hours of value or it was a net loss. That sounds harsh. It is just arithmetic.

## Four conditions

**One: a decision, not a topic.** "Discuss the roadmap" is a topic. "Decide whether we ship the export feature in March or April" is a decision. If you cannot write the decision in the title, you probably want a document, not a meeting.

**Two: an owner and a prepared room.** The person who called the meeting sends the context at least four hours ahead. If people arrive without having read it, you have converted a decision meeting into a very expensive reading session.

**Three: the right six people.** Every extra person costs an hour and dilutes the decision. Invite the people who will be affected and the people who know something. If you are inviting someone "so they are aware", send them the notes instead. They will be delighted.

**Four: an ending with names in it.** Every meeting ends with the last five minutes spent out loud on: what we decided, what we explicitly did not decide, who owns what, and by when. Not in someone's head — out loud, in the room, so that three people can correct it before it becomes a misunderstanding.

## The one habit that fixes most of it

Start on time. Every time. Not "once everyone is here".

This sounds like a small disciplinary thing, but it is the highest-leverage habit in meeting culture. When a meeting reliably starts on time, people arrive on time, and when people arrive on time the meeting gets shorter, and when it gets shorter the agenda gets sharper, because you cannot fit vagueness into twenty-five minutes.

Late starts are not a punctuality problem. They are a tax on everyone who respected the calendar.

## The challenge

For one month: if a meeting has no written decision in the title, decline it and ask for the decision. If you are organising, cut the invite list by a third.

I predict two things. Fewer meetings, and a strange new problem where people complain that decisions are happening without them — at which point we fix it by sending better notes, which was the answer all along.`,
  },
  {
    id: 'learning-out-loud',
    kind: 'speech',
    title: 'Learning Out Loud',
    author: 'A self-taught developer',
    category: 'Education',
    occasion: 'Community meetup',
    level: 'Standard',
    tags: ['learning', 'vulnerability', 'growth'],
    preview:
      'On publishing your ignorance in public, and why the beginner’s notes are more useful than the expert’s summary.',
    createdAt: '2026-02-28',
    content: `## The expert's summary is useless to beginners

When I learned to code, I read a lot of expert explanations. They were clean, correct, and completely useless to me, because the expert had forgotten the confusing part.

Here is the thing about expertise: once you understand something, you cannot remember what it was like not to. The confusing part is invisible to you now. So you write an explanation that skips the exact step where everyone gets lost, and you do it with total confidence.

This is called the curse of knowledge, and the only known cure is proximity to someone who is still confused.

## What I started doing

Three years ago I started writing down what confused me, in public, the same day it confused me. Not a polished tutorial. Just: here is the thing I did not understand, here is what I tried, here is what finally made it click.

I expected nobody to read it. Two things happened instead.

First, people read it a lot — because a note written on the day you were confused is a perfect map of the terrain for the person who is confused today. Experts write for people who already understand. Beginners write for beginners, and beginners are the majority.

Second, and more valuable: people corrected me, immediately and kindly. Every wrong thing I published got fixed in the comments within a day. I got a free education from strangers who could not resist fixing an error.

## Three rules I follow

Write it the day you learn it, while the confusion is still legible to you. Wait a week and you will have become a mini-expert, and the confusing part will have gone invisible to you too.

Say what you do not understand. The honest sentence "I still do not know why this works, only that it does" is more useful than a fake explanation, because it tells the reader where the map ends.

Ship it before you feel ready. The fear is that being publicly wrong makes you look foolish. The reality is that being publicly wrong is how you find the twelve people who will teach you.

## The ask

There is something you learned this month that you have not written down. It felt small. It is not small to the person who is three weeks behind you.

Write it today, badly, in public. That is the whole method. Learn out loud, and let the room help.`,
  },
  {
    id: 'next-ten-years',
    kind: 'speech',
    title: 'Building for the Next Ten Years',
    author: 'Founder, anonymised',
    category: 'Business',
    occasion: 'Company all-hands',
    level: 'Keynote',
    tags: ['strategy', 'vision', 'long-term'],
    preview:
      'A strategy talk that commits to specific sacrifices, because a vision without a cost list is a wish.',
    createdAt: '2026-02-23',
    content: `## Vision without a cost list is a wish

Everyone in this room has sat through a vision talk. They usually involve a mountain, a horizon, and no specifics whatsoever. I want to do the opposite: I want to tell you what we are going to give up.

A strategy that costs nothing is not a strategy. It is a wish with a nice slide.

## The bet

Here is the one sentence: for the next ten years, we are betting that the value moves to whoever holds the relationship with the user, not whoever holds the biggest dataset.

If that is true — and I think it is, but I could be wrong — then everything about how we build changes. We build for the person holding the relationship. We make money by making them more valuable, not by extracting the value ourselves.

## Three things we are giving up

**One: we are giving up the platform tax.** Starting this quarter, we take 0% on the first year of any integration partner's revenue. That is roughly 2 million of near-term revenue we are choosing not to collect. I want everyone to know that number, because when someone asks why our growth chart looks different next year, this is why.

**Two: we are giving up short-term exclusivity deals.** Every exclusivity clause we have signed is a bet against our own product. If our product is better, we do not need a contract to keep you. All existing exclusivity clauses come up for renewal over eighteen months and we will not extend a single one.

**Three: we are giving up two features people love.** The dashboard builder and the custom scripting layer. Together they are used by 4% of accounts and consume 31% of engineering time. Sunsetting them will be unpopular with a small, loud, and completely correct group of users, and we will give them eighteen months' notice and a migration path. This is the one I expect you to argue with me about.

## What we are buying with it

Three things: a reputation as the partner that does not squeeze, an engineering team that is not maintaining two products for 4% of users, and the freedom to be the place where other people build their business.

## How we will know if I am wrong

Two numbers, reported to this room every quarter for a decade. Partner retention without exclusivity, and revenue per partner.

If partner retention drops below 70% two years after we stop using contracts, my bet was wrong, and I will say so here, out loud, and we will change course.

That is the whole strategy. One bet, three sacrifices, two numbers, ten years. Let's go.`,
  },
  {
    id: 'template-problem-solution',
    kind: 'template',
    title: 'Template: Problem → Proof → Ask',
    author: 'Presentation Buddy',
    category: 'Templates',
    occasion: 'Persuasive talks',
    level: 'Standard',
    tags: ['template', 'persuasion', 'structure'],
    preview:
      'The most reliable persuasive structure in the language, with prompts in every slot.',
    createdAt: '2026-01-01',
    content: `## 1. The problem, in a person

Open with one named person and one specific moment. Not "many people struggle with…" — one person, one Tuesday.

> [Name] had [specific task] and it took [painful length of time]. Here is exactly what happened.

**Why it works:** audiences do not feel statistics, they feel Tuesdays.

## 2. The cost, in one number

Convert the pain into the number your audience already cares about. Money, hours, lives, churn — pick their currency, not yours.

> Across [population], that adds up to [number] every [period].

## 3. The turn

> And here is the part that made us angry: [the reason this is avoidable / unfair / fixable].

## 4. The proof

Three pieces. One from data, one from a story, one from a demonstration or testimonial.

- Data: [metric, before → after]
- Story: [one person, one outcome, one quote]
- Demonstration: [show, do not describe]

## 5. The ask

One sentence. One action. One date.

> I am asking for [specific thing] by [date], so that [specific outcome].

## 6. The close

End on the person from the beginning, one sentence, no summary.

> [Name] should not have to spend another [time] on this. Let's fix it.`,
  },
  {
    id: 'template-story-structure',
    kind: 'template',
    title: 'Template: And, But, Therefore',
    author: 'Presentation Buddy',
    category: 'Templates',
    occasion: 'Narrative talks',
    level: 'Warm-up',
    tags: ['template', 'storytelling', 'narrative'],
    preview:
      'A three-beat story engine you can use for any talk, from a toast to a TED stage.',
    createdAt: '2026-01-01',
    content: `## The engine

Every memorable talk runs on three beats. Write one sentence for each and you have a spine.

## AND — the world as it was

Set the scene in one concrete image. Not context; a picture.

> For [time], [situation] worked like this: [one concrete detail a listener can see].

## BUT — the thing that broke

The inciting incident. Something changes, and it must change for someone specific.

> Then, on [day], [specific event]. And suddenly [what became impossible].

## THEREFORE — what we did and what changed

The response, then the new world.

> So we [specific action]. And now [concrete, measurable difference].

## Stretch it with three scenes

Take your BUT and give it three scenes at increasing stakes:

1. **The door:** the moment the problem first appears.
2. **The room:** the moment you realise it is bigger than you thought.
3. **The mirror:** the moment you realise what it is asking of you.

## End where you began

Return to the opening image, changed.

> [Opening image], except now [one concrete difference].

**Rehearsal note:** if you can say your AND, BUT and THEREFORE in three sentences, you can recover from losing your place anywhere in the talk.`,
  },
  {
    id: 'template-90-second-intro',
    kind: 'template',
    title: 'Template: The 90-Second Introduction',
    author: 'Presentation Buddy',
    category: 'Templates',
    occasion: 'Introductions & networking',
    level: 'Warm-up',
    tags: ['template', 'networking', 'pitch'],
    preview:
      'A repeatable self-introduction that makes people ask a follow-up question instead of nodding politely.',
    createdAt: '2026-01-01',
    content: `## Four beats, ninety seconds

## 1. Who you are (5 seconds)

Name, and the one-word version of your role. No job title — titles are forgettable.

> I'm [Name]. I [verb] [thing] for [who].

## 2. The problem you are close to (30 seconds)

Not what your company does. What you personally keep running into.

> The thing I keep seeing is [specific, concrete problem]. Last week, [tiny true story].

## 3. What you are building or learning (30 seconds)

Present tense, no adjectives.

> Right now I'm working on [one specific thing], and the hard part is [honest difficulty].

## 4. The hook (25 seconds)

End with a question you genuinely want answered. This is the part that turns a monologue into a conversation.

> Which is why I wanted to ask you: [genuine question about their work].

## Rules

- No superlatives. "Passionate", "innovative" and "synergy" delete themselves from memory on the way in.
- One number beats three adjectives.
- Name the difficulty. People trust the person who admits the hard part.

**Practise it out loud until it takes ninety seconds. Then never say it the same way twice.**`,
  },
  {
    id: 'template-data-story',
    kind: 'template',
    title: 'Template: One Number, Three Passes',
    author: 'Presentation Buddy',
    category: 'Templates',
    occasion: 'Data & report talks',
    level: 'Standard',
    tags: ['template', 'data', 'clarity'],
    preview:
      'How to present a number so it changes a decision instead of decorating a slide.',
    createdAt: '2026-01-01',
    content: `## Pick one number

Not five. One number that, if it moved, would change what the room does next.

## Pass one: the number, alone

Show it. Say it. Then stop talking for two seconds.

> [Number]. [Unit]. Over [period].

Silence is not awkward here. Silence is how a number lands.

## Pass two: the comparison

A number with no comparison is noise. Always give one of these three:

- **Against the past:** "It was [old] last year."
- **Against a target:** "We said [target]. We are at [actual]."
- **Against a peer:** "The category is [benchmark]."

## Pass three: the mechanism

The number is a footprint. Show the thing that made it.

> This happened because [specific decision or behaviour]. Here is the evidence: [one chart, one quote].

## The warning inside the number

Every good number has a problem hidden in it. Name it before someone else does.

> The part I want to argue about is [weakness in the trend].

## The decision

> So my recommendation is [specific action], owned by [name], reviewed on [date].

## Checklist

- [ ] One number, not five
- [ ] One comparison
- [ ] One mechanism
- [ ] One honest weakness
- [ ] One decision with a name and a date`,
  },
  {
    id: 'template-difficult-conversation',
    kind: 'template',
    title: 'Template: The Hard Conversation',
    author: 'Presentation Buddy',
    category: 'Templates',
    occasion: 'Feedback & conflict',
    level: 'Standard',
    tags: ['template', 'feedback', 'conflict'],
    preview:
      'A structure for saying the difficult thing clearly, without making the other person defend themselves.',
    createdAt: '2026-01-01',
    content: `## Before you speak

Write down, in one sentence: what do I want to be different afterwards?

If the answer is "they should understand how I feel", stop. That is not an outcome. Make it a behaviour.

## The structure

## 1. Set the frame (15 seconds)

> I want to talk about [one specific thing]. It'll take ten minutes and I'd like to hear your side. Is now okay?

Asking permission lowers defensiveness more than any wording trick.

## 2. The observation, without a verdict (30 seconds)

Describe what you saw the way a camera would. No motives, no character.

> On [occasion], [specific behaviour]. I noticed [concrete effect].

Never: "You always…" / "You don't care about…"

## 3. The impact, on the work (30 seconds)

> The effect on the project was [concrete consequence].

Keep it about the work. Work impact is discussable; character is not.

## 4. The question (the most important part)

> How did that land from your side?

Then be quiet and actually listen. Most hard conversations fail here, because the speaker keeps going.

## 5. The ask

> What I'd like is [specific, observable behaviour], starting [when].

## 6. Close forward

> Thanks for talking. Let's check in on [date].

## Phrases that help

- "Help me understand…"
- "I might have this wrong."
- "What would make this easier on your side?"
- "Let's agree on what 'done' looks like."

## Phrases that never help

- "To be honest…" (implies the rest was not)
- "With all due respect…"
- "You're being defensive."
- "We've been over this."`,
  },
  {
    id: 'template-qa-recovery',
    kind: 'template',
    title: 'Template: Handling Any Question',
    author: 'Presentation Buddy',
    category: 'Templates',
    occasion: 'Q&A and panels',
    level: 'Warm-up',
    tags: ['template', 'qa', 'improvise'],
    preview:
      'Four response shapes that cover every question you will ever be asked, including the hostile ones.',
    createdAt: '2026-01-01',
    content: `## Shape 1 — You know the answer

Answer in one sentence, then give the evidence, then stop.

> [Answer]. The reason is [one piece of evidence].

Speakers get in trouble by answering the same question three times in three different phrasings. Say it once, well, then wait.

## Shape 2 — You do not know

> I don't know, and I don't want to guess in front of you. I'll find out and send you an answer by [day].

This is the highest-trust sentence available to you. Never fake it — an audience forgives ignorance instantly and forgives bluffing never.

## Shape 3 — The question contains a wrong premise

Correct gently, then answer the real question.

> I'd push back on one part: [correction]. But the underlying question — [restate fairly] — is a good one, and here's what I know.

## Shape 4 — The hostile question

Do not defend. Agree with whatever is true, then bridge.

> You're right that [true part]. What I'd add is [your frame].

Then: answer the room, not the person. Maintain eye contact with the wider audience, keep your voice lower and slower than you feel like keeping it.

## Bridge phrases

- "The short answer is… and the longer answer is…"
- "There are two ways to look at that."
- "I can only speak to our part of that, which is…"
- "That's outside my expertise — the person you want is [name]."

## The last ten seconds

Always end with one forward-looking sentence. Never end on a hedge.

> What I'd take from this is [one takeaway], and I'm happy to keep talking after.`,
  },
];

export const CATEGORY_ORDER = [
  'Career',
  'Leadership',
  'Education',
  'Technology',
  'Science',
  'Business',
  'Community',
  'Ceremony',
  'Advocacy',
  'Environment',
  'Arts',
  'Sports',
  'Wellness',
  'Sales',
  'Templates',
];
