/** Festival & occasion themes (2.6). The owner picks one, stored as
 * `site_settings.theme` = { festivalId }; everyone sees it and anyone may
 * still personalise locally — the festival is a seasonal skin, never a
 * replacement, and never explained to visitors (2.6.2). */
export interface FestivalTheme { id: string; name: string; group: string; note: string; greeting: string; accent: string; accent2: string; glow: string; emoji: string }
const F = (id:string,name:string,group:string,note:string,greeting:string,accent:string,accent2:string,emoji:string): FestivalTheme => ({ id,name,group,note,greeting,accent,accent2,glow:accent,emoji });
export const FESTIVALS: FestivalTheme[] = [
  F('none','No festival','House','The everyday Presentation Buddy palette.','Welcome back','#1d4f45','#c58a2e','✦'),
  F('dashain','Dashain','Nepal','Blessings, jamara and tika — victory of good, family coming home.','Shubha Dashain — may every word you speak land with blessings.','#b4232a','#e8a317','🪁'),
  F('tihar','Tihar / Diwali','Nepal · Hindu','Five days of lights — for crows, dogs, Lakshmi, oxen and siblings.','Shubha Tihar — a diyo lit for every sentence you are brave enough to say.','#d97706','#7c3aed','🪔'),
  F('holi','Holi','Hindu','Colour thrown into the air; grudges washed off in spring water.','Happy Holi — say it in colour.','#db2777','#2563eb','🌈'),
  F('teej','Teej','Nepal','Red saris, song and fasting for love and longevity.','Happy Teej — songs first, speeches after.','#be123c','#f59e0b','🔴'),
  F('losar','Losar','Himalayan','Tibetan/Sherpa/Tamang new year — prayer flags and fresh starts.','Losar Tashi Delek — a new year, a new first line.','#0f766e','#dc2626','🏔️'),
  F('eid','Eid al-Fitr / al-Adha','Muslim','The crescent sighted; tables shared with neighbours.','Eid Mubarak — words, like food, are best shared.','#047857','#ca8a04','🌙'),
  F('christmas','Christmas','Christian','Carols, candlelight and speeches of gratitude at year end.','Merry Christmas — tidings of comfort and joy, spoken aloud.','#b91c1c','#15803d','🎄'),
  F('new-year','New Year','Global','January 1 / Nepali New Year (Baisakh) — resolutions with witnesses.','Happy New Year — this is the year you say it out loud.','#1d4ed8','#f59e0b','🎆'),
  F('buddha-jayanti','Buddha Jayanti','Buddhist · Nepal','Lumbini candles; speeches that begin in silence.','Peace in every word.','#b45309','#65a30d','🕯️'),
  F('valentines',"Valentine's Day",'Global','Toasts to the people who taught us how to speak gently.','For the ones who listen first.','#e11d48','#fb7185','💌'),
  F('womens-day',"International Women's Day",'Global','March 8 — the women who spoke when rooms were not built for them.','Her words, her stage.','#7c3aed','#db2777','♀'),
  F('earth-day','Earth Day','Global','April 22 — speeches for the only venue we all share.','Speak for the planet.','#15803d','#0369a1','🌍'),
  F('pride','Pride','Global','June — every voice, exactly as it is.','Say it proud.','#9333ea','#f59e0b','🏳️‍🌈'),
  F('graduation','Graduation season','Occasion','Caps in the air; commencement words that must be earned.','To the class that is about to speak.','#1e40af','#ca8a04','🎓'),
  F('wedding','Wedding season','Occasion','Toasts season — love, told in three concrete details.','To love, told properly.','#be185d','#b45309','💍'),
  F('halloween','Halloween','Global','October 31 — ghost stories and delicious dread.','Boo. Now begin.','#ea580c','#581c87','🎃'),
  F('thanksgiving','Thanksgiving','North America','Gratitude said out loud before the meal goes cold.','Say the thanks out loud.','#b45309','#a16207','🦃'),
  F('independence','Independence / National Day','Global','Founding words — the speeches nations rehearse forever.','Words that built a country.','#1d4ed8','#dc2626','🏛️'),
  F('ramadan','Ramadan','Muslim','A month of fasting, reflection and evening gatherings.','Ramadan Kareem — reflective words after sunset.','#0f766e','#1e3a8a','☪️'),
];
export const festivalById = (id?: string | null) => FESTIVALS.find((f) => f.id === id) ?? FESTIVALS[0];
