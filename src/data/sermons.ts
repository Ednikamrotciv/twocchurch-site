export type Sermon = {
  id: string;
  title: string;
  speaker: string;
  speakerRole: string;
  /** Where this message lives: YouTube (default), Facebook, or an uploaded file. */
  platform?: "youtube" | "facebook" | "upload";
  /** The video link, whole (note 127) — any YouTube form parses downstream. */
  youtubeId: string;
  /** Used when platform is "facebook". */
  facebookUrl?: string;
  /** Used when platform is "upload" — a video file hosted by the upload service. */
  uploadUrl?: string;
  /** Optional still image, otherwise the YouTube thumbnail is used. */
  poster?: string;
  durationText: string;
  scripture: string;
  summary: string;
  points: string[];
  questions: string[];
  tags: string[];
  weeksAgo: number;
  venue: string;
  /** The exact day preached (YYYY-MM-DD); wins over `weeksAgo`. */
  date?: string;
  /** This message was one of our own live broadcasts, not a teaching upload. */
  fromLive?: boolean;
  /** Fingerprint of the broadcast that produced it, so it is never filed twice. */
  liveKey?: string;
  publishedAt?: number;
};

import { registerPhotoCollection } from "./photos";
import { posterFor, watchUrl, type VideoSource } from "../lib/embed";
import { siteTimezone, zonedParts, zonedTimeToUtc } from "../lib/store";

/* Demo links: public teaching messages — swap for the church's own uploads. Whole links, not bare ids (note 127). */

export const ytThumb = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
export const ytWatch = (id: string) => `https://www.youtube.com/watch?v=${id}`;
export const ytEmbed = (id: string) => `https://www.youtube.com/embed/${id}?rel=0&modestbranding=1&playsinline=1&autoplay=1`;

/* A sermon can be hosted on YouTube, Facebook or as an uploaded video file —
   these pick the right thumbnail, player source and "open it there" link. */
export const sermonSource = (s: Sermon): VideoSource => ({
  platform: s.platform === "facebook" ? "facebook" : s.platform === "upload" ? "upload" : "youtube",
  youtubeId: s.youtubeId,
  facebookUrl: s.facebookUrl,
  uploadUrl: s.uploadUrl,
  poster: s.poster,
});
export const sermonThumb = (s: Sermon) => posterFor(sermonSource(s));
export const sermonWatchUrl = (s: Sermon) => watchUrl(sermonSource(s));

export const SERMONS: Sermon[] = [
  {
    id: "overcoming-in-christ",
    title: "Overcoming in Christ",
    speaker: "Dr. Tony Evans",
    speakerRole: "Guest Teacher",
    youtubeId: "https://www.youtube.com/watch?v=0xThVTs8aro",
    durationText: "49:01",
    scripture: "Romans 8:37",
    summary:
      "We are not fighting for victory, we are fighting from victory. Dr. Evans walks through what it means to be more than a conqueror — not a survivor of the battle, but somebody with spoils in their hands.",
    points: ["The overcomer's identity is settled at the cross, not at the altar", "Overcoming is a posture, not an occasional event", "Spoils belong to the one who keeps standing"],
    questions: ["Where have I been fighting for a victory Christ already won?", "What 'spoil' is God asking me to take hold of this week?"],
    tags: ["faith", "victory", "identity"],
    weeksAgo: 0,
    venue: "Overcomers' Cathedral, Dallas",
  },
  {
    id: "hope-that-overcomes",
    title: "The Hope That Overcomes the World",
    speaker: "Dr. John MacArthur",
    speakerRole: "Guest Teacher",
    youtubeId: "https://www.youtube.com/watch?v=3hNg87JWWt4",
    durationText: "57:12",
    scripture: "John 16:23-33",
    summary:
      "Peace is not the absence of tribulation — Jesus promised the opposite. This message follows Christ's closing words to His disciples to show why a hope anchored outside this world cannot be shaken by it.",
    points: ["In the world you will have tribulation — expect it", "Be of good cheer — the victory is already announced", "Peace is a person before it is a feeling"],
    questions: ["What tribulation have I been treating as a surprise?", "How does my hope survive when circumstances don't change?"],
    tags: ["hope", "peace", "perseverance"],
    weeksAgo: 1,
    venue: "Overcomers' Cathedral, Dallas",
  },
  {
    id: "overcoming-the-world-baucham",
    title: "Overcoming the World",
    speaker: "Dr. Voddie Baucham",
    speakerRole: "Guest Teacher",
    youtubeId: "https://www.youtube.com/watch?v=I0HgcECXv3k",
    durationText: "1:01:52",
    scripture: "1 John 5:1-12",
    summary:
      "A careful walk through John's logic: faith is the victory, and faith is only as good as its object. Baucham presses the test of genuine belief — does your life prove what your lips profess?",
    points: ["Love for God and obedience are inseparable", "Faith overcomes, not willpower", "The witness of God is greater than the witness of men"],
    questions: ["What evidence of new birth is present in my life?", "Is my faith resting in a feeling or in the Son of God?"],
    tags: ["assurance", "doctrine", "obedience"],
    weeksAgo: 2,
    venue: "Overcomers' Cathedral, Dallas",
  },
  {
    id: "stages-of-faith",
    title: "The Stages of Our Faith",
    speaker: "Dr. Charles Stanley",
    speakerRole: "Guest Teacher",
    youtubeId: "https://www.youtube.com/watch?v=y2oiCm24T5U",
    durationText: "56:51",
    scripture: "Mark 4:26-29",
    summary:
      "Faith grows in stages — seed, blade, ear, full grain — and God is patient in each one. A hopeful word for anyone who feels stuck between where they were and where they want to be.",
    points: ["Faith has seasons; God is Lord of all of them", "Growth is often invisible before it is undeniable", "Don't despise the stage you are in"],
    questions: ["Which stage am I in right now?", "Where am I tempted to rush what God is growing slowly?"],
    tags: ["growth", "patience", "discipleship"],
    weeksAgo: 3,
    venue: "Overcomers' Cathedral, Dallas",
  },

  {
    id: "priority-of-prayer",
    title: "The Priority of Prayer",
    speaker: "Dr. Charles Stanley",
    speakerRole: "Guest Teacher",
    youtubeId: "https://www.youtube.com/watch?v=yMQ79ANw-ts",
    durationText: "36:14",
    scripture: "Mark 1:35",
    summary:
      "Jesus was busier than any of us and still left the crowd to pray. If the Son of God needed the secret place, what makes us think we can lead our lives without it?",
    points: ["A rising bell before a ringing phone", "Jesus prayed before He chose, healed and travelled", "The busier the season, the more pressing the altar"],
    questions: ["What would change if my first fifteen minutes belonged to God?", "What have I been deciding without prayer?"],
    tags: ["discipline", "devotion", "morning"],
    weeksAgo: 4,
    venue: "Overcomers' Cathedral, Dallas",
  },
  {
    id: "effectual-prayer",
    title: "The Secret of Effectual Prayer",
    speaker: "Pastor Adrian Rogers",
    speakerRole: "Guest Teacher",
    youtubeId: "https://www.youtube.com/watch?v=XpS7I2JoECw",
    durationText: "43:45",
    scripture: "James 5:16",
    summary:
      "Fervent prayer is not loud prayer — it is prayer that has been in the presence of God. This message unpacks the conditions Scripture attaches to praying that avails much.",
    points: ["Righteousness matters more than vocabulary", "Confession clears the channel", "Prevailing prayer is sustained prayer"],
    questions: ["Is there anything I need to confess before I ask again?", "What request have I given up on too soon?"],
    tags: ["intercession", "confession", "revival"],
    weeksAgo: 5,
    venue: "Overcomers' Cathedral, Dallas",
  },
  {
    id: "prayer-that-moves-god",
    title: "Prayer That Moves God",
    speaker: "Dr. Charles Stanley",
    speakerRole: "Guest Teacher",
    youtubeId: "https://www.youtube.com/watch?v=0s3ON1Yg3xw",
    durationText: "26:46",
    scripture: "Genesis 18:20-33",
    summary:
      "Abraham bargaining at the edge of Sodom teaches us that God invites argument, repetition and holy boldness from His children. Prayer changes things because prayer changes us.",
    points: ["Intercession is standing in the gap for another", "Boldness honours God's character", "God's delays are not God's denials"],
    questions: ["Who needs me to stand in the gap this week?", "What would holy boldness look like in my praying?"],
    tags: ["intercession", "faith", "boldness"],
    weeksAgo: 6,
    venue: "Overcomers' Cathedral, Dallas",
  },
  {
    id: "putting-prayer-first",
    title: "Putting Prayer First",
    speaker: "Dr. Charles Stanley",
    speakerRole: "Guest Teacher",
    youtubeId: "https://www.youtube.com/watch?v=acaG65bFYj8",
    durationText: "23:20",
    scripture: "1 Thessalonians 5:17",
    summary:
      "A practical message on unbroken prayer — an attitude of dependence that runs underneath the whole day rather than a scheduled slot that rarely arrives.",
    points: ["Pray without ceasing is a posture, not a marathon", "Short prayers released through the day", "Gratitude keeps the conversation open"],
    questions: ["What reminder could I set to return to prayer today?", "What am I carrying that I have not yet handed over?"],
    tags: ["discipline", "gratitude", "practice"],
    weeksAgo: 7,
    venue: "Overcomers' Cathedral, Dallas",
  },

  {
    id: "godly-wife",
    title: "Building a Godly Home",
    speaker: "Pastor Josh Howerton",
    speakerRole: "Guest Teacher",
    youtubeId: "https://www.youtube.com/watch?v=MUcAtScS6uE",
    durationText: "42:31",
    scripture: "Proverbs 14:1",
    summary:
      "A wife's wisdom builds a house; her folly pulls it down with her own hands. Warm, practical teaching on the quiet power of a woman who fears the Lord — and the husband called to love her sacrificially.",
    points: ["Every home is being built or dismantled daily", "Wisdom is a way of speaking and a way of waiting", "The house of God begins in the house"],
    questions: ["What am I building with my words this week?", "Where does my home need repair prayer?"],
    tags: ["marriage", "wisdom", "family"],
    weeksAgo: 8,
    venue: "Overcomers' Cathedral, Dallas",
  },
  {
    id: "covenant-not-contract",
    title: "Marriage: A Covenant, Not a Contract",
    speaker: "Dr. Tony Evans",
    speakerRole: "Guest Teacher",
    youtubeId: "https://www.youtube.com/watch?v=cRptjonzx0o",
    durationText: "42:47",
    scripture: "Malachi 2:14",
    summary:
      "A contract is broken when terms are violated; a covenant is kept because God is witness. This message reframes marriage as a divine binding that survives the seasons it passes through.",
    points: ["Contracts negotiate, covenants covenant", "God is a witness, not a bystander", "You keep a covenant when you don't feel like it"],
    questions: ["Have I treated my vows as terms or as worship?", "What am I doing that a covenant-keeper would not do?"],
    tags: ["marriage", "covenant", "faithfulness"],
    weeksAgo: 9,
    venue: "Overcomers' Cathedral, Dallas",
  },
  {
    id: "marriage-family-work",
    title: "Marriage, Family and Work",
    speaker: "Pastor Gary Hamrick",
    speakerRole: "Guest Teacher",
    youtubeId: "https://www.youtube.com/watch?v=U2imJDEnpag",
    durationText: "41:13",
    scripture: "Ephesians 5:21-6:9",
    summary:
      "A verse-by-verse walk through Paul's house rules: submission shaped by love, children raised in instruction, work done heartily as unto the Lord. Ordinariness is not the enemy of holiness.",
    points: ["All authority answers to Christ", "Fathers provoke by absence or anger", "Your desk is an altar when you work as unto Him"],
    questions: ["Which relationship needs re-ordering this week?", "How can I make my work an act of worship?"],
    tags: ["marriage", "parenting", "work"],
    weeksAgo: 10,
    venue: "Overcomers' Cathedral, Dallas",
  },
  {
    id: "godly-home-corrupt-world",
    title: "Raising a Godly Home in a Corrupt World",
    speaker: "Bro. Zac Poonen",
    speakerRole: "Guest Teacher",
    youtubeId: "https://www.youtube.com/watch?v=T0ZQK6MUdRY",
    durationText: "41:29",
    scripture: "Deuteronomy 6:6-9",
    summary:
      "Discipleship is not a programme that happens after school — it is the running commentary of a life lived with God in front of children. Faith is caught far more than it is taught.",
    points: ["Children learn what they live", "Family worship should be normal, not ceremonial", "Consistency is louder than curriculum"],
    questions: ["What would my children say I love most?", "What small family habit could we start this week?"],
    tags: ["parenting", "discipleship", "home"],
    weeksAgo: 11,
    venue: "Overcomers' Cathedral, Dallas",
  },

  {
    id: "finding-your-purpose",
    title: "Finding Your Purpose",
    speaker: "Pastor Steven Furtick",
    speakerRole: "Guest Teacher",
    youtubeId: "https://www.youtube.com/watch?v=07-UkIZSwws",
    durationText: "17:36",
    scripture: "Ephesians 2:10",
    summary:
      "You are God's workmanship — the word is poiema, a poem. Purpose is not discovered by looking inward but by looking up and then walking forward in the ordinary things already in your hand.",
    points: ["You were created in Christ Jesus for good works", "God doesn't need you to be impressive, just available", "Purpose is walked out, not waited for"],
    questions: ["What is already in my hand that God can use?", "Where am I waiting for a calling instead of obeying today?"],
    tags: ["calling", "identity", "works"],
    weeksAgo: 12,
    venue: "Overcomers' Cathedral, Dallas",
  },
  {
    id: "purpose-in-life",
    title: "Finding Your Purpose in Life",
    speaker: "Skip Heitzig",
    speakerRole: "Guest Teacher",
    youtubeId: "https://www.youtube.com/watch?v=u8XhQFaPIdc",
    durationText: "50:34",
    scripture: "Nehemiah 2:1-10",
    summary:
      "Nehemiah heard a report, wept, prayed, and then asked the king for permission. A study in how a burden becomes a blueprint — the anatomy of a God-given assignment.",
    points: ["Purpose often begins with a burden you cannot shake", "Prayer precedes planning", "Provision follows the decision to build"],
    questions: ["What report makes me weep?", "What request have I not yet made?"],
    tags: ["calling", "prayer", "leadership"],
    weeksAgo: 13,
    venue: "Overcomers' Cathedral, Dallas",
  },
  {
    id: "knowing-your-purpose",
    title: "How to Know the Purpose of Your Life",
    speaker: "Dr. Myles Munroe",
    speakerRole: "Guest Teacher",
    youtubeId: "https://www.youtube.com/watch?v=gTgcGlnK1kk",
    durationText: "1:14:12",
    scripture: "Jeremiah 29:11",
    summary:
      "A landmark message on the difference between a job, a career and a calling — and why your gift was never given for your own benefit alone. The cross is the model: potency poured out for others.",
    points: ["Purpose precedes your birth and outlives your death", "Your gift makes room for you and serves others", "Never exchange your assignment for a salary"],
    questions: ["Whose lives would improve if I used my gift fully?", "What am I trading my assignment for?"],
    tags: ["calling", "leadership", "gifts"],
    weeksAgo: 14,
    venue: "Overcomers' Cathedral, Dallas",
  },

  {
    id: "grace-alone",
    title: "Grace Alone",
    speaker: "Dr. Charles Stanley",
    speakerRole: "Guest Teacher",
    youtubeId: "https://www.youtube.com/watch?v=Vdycm8zMwAY",
    durationText: "54:06",
    scripture: "Ephesians 2:8-9",
    summary:
      "If grace is a gift, then no one can boast — and no one can be disqualified for lack of credentials. A freeing message for the performance-weary believer.",
    points: ["Grace excludes boasting and includes the undeserving", "Faith is the hand that receives, not the price that pays", "You cannot work for what was given"],
    questions: ["Where am I still trying to earn God's approval?", "What would rest look like for me this week?"],
    tags: ["grace", "salvation", "rest"],
    weeksAgo: 15,
    venue: "Overcomers' Cathedral, Dallas",
  },
  {
    id: "transforming-grace",
    title: "The Transforming Grace of God",
    speaker: "Dr. Charles Stanley",
    speakerRole: "Guest Teacher",
    youtubeId: "https://www.youtube.com/watch?v=YGID9naxPYU",
    durationText: "26:22",
    scripture: "Titus 2:11-12",
    summary:
      "Grace is not permission to sin; it is power to say no. The same grace that saves teaches us to deny ungodliness and to live soberly, righteously and godly in this present world.",
    points: ["Grace has appeared, to all men, and it teaches", "Salvation and transformation are one package", "The forgiven life is a different life"],
    questions: ["What is grace teaching me to put down?", "Where has grace become an excuse in my life?"],
    tags: ["grace", "holiness", "change"],
    weeksAgo: 16,
    venue: "Overcomers' Cathedral, Dallas",
  },
  {
    id: "gospel-of-grace",
    title: "The Gospel of the Grace of God",
    speaker: "Dr. Charles Stanley",
    speakerRole: "Guest Teacher",
    youtubeId: "https://www.youtube.com/watch?v=NQnDQM-3cf4",
    durationText: "51:09",
    scripture: "Acts 20:24",
    summary:
      "Paul counted his own life dear only for the sake of finishing his course and the ministry of testifying to the gospel of the grace of God. What would it look like for that to be our single ambition?",
    points: ["The gospel is news, not advice", "Grace is the content of the message", "Finishing matters more than impressing"],
    questions: ["What is my one thing?", "Who has not yet heard this news from me?"],
    tags: ["gospel", "evangelism", "calling"],
    weeksAgo: 17,
    venue: "Overcomers' Cathedral, Dallas",
  },
  {
    id: "grace-at-work",
    title: "Grace is God at Work",
    speaker: "Pastor Louie Giglio",
    speakerRole: "Guest Teacher",
    youtubeId: "https://www.youtube.com/watch?v=xUhKi14LhOU",
    durationText: "34:44",
    scripture: "2 Corinthians 12:9",
    summary:
      "God's strength does not meet us after our weakness is resolved — it is perfected in the middle of it. A message for anyone who thinks their cracks disqualify them from usefulness.",
    points: ["Grace shows up in weakness, not after it", "Boasting in weakness is a discipline", "God's power is made perfect, not slightly better"],
    questions: ["What weakness have I been hiding instead of offering?", "Where have I seen God work through my limits?"],
    tags: ["grace", "weakness", "strength"],
    weeksAgo: 18,
    venue: "Overcomers' Cathedral, Dallas",
  },
];

registerPhotoCollection(SERMONS as any[]);

export function parseSermonDate(value?: string): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value).trim());
  if (!m) return null;
  /* A filed date is a calendar date, so it is read on the church's own clock. */
  const d = zonedTimeToUtc(Number(m[1]), Number(m[2]), Number(m[3]), 11, 30);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function sermonDate(sermon: Sermon, now = new Date()): Date {
  const fixed = parseSermonDate(sermon?.date);
  if (fixed) return fixed;
  const tz = siteTimezone();
  const today = zonedParts(now, tz);
  return zonedTimeToUtc(today.year, today.month, today.day - today.weekday - (sermon?.weeksAgo || 0) * 7, 11, 30, tz);
}

export function sermonPublishTime(s: Sermon): number {
  const t = (s as any)?.publishedAt;
  return typeof t === "number" && isFinite(t) ? t : sermonDate(s).getTime();
}

export function sermonRank(s: Sermon): number {
  const t = (s as any)?.publishedAt;
  return typeof t === "number" && isFinite(t) ? 0 : 1;
}

/** Newest first, by the real date (so a filed broadcast lands at the top). */
export const newestFirst = (a: Sermon, b: Sermon) =>
  sermonRank(a) - sermonRank(b) || sermonPublishTime(b) - sermonPublishTime(a) || (a.weeksAgo || 0) - (b.weeksAgo || 0);

export function sermonsNewestFirst(): Sermon[] {
  return [...SERMONS].sort(newestFirst);
}

/** An id the way a link can carry it: no case, no punctuation, no spaces. */
export function plainId(input: string): string {
  return String(input || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/* A link someone shared may have picked up capitals or a stray space on its way
   through a chat app or an email, so an id is matched exactly first and then
   with the punctuation and case ignored — never loosely enough to guess. */
export function sermonById(id: string): Sermon | undefined {
  const wanted = String(id || "");
  const exact = SERMONS.find((s) => s.id === wanted);
  if (exact) return exact;
  const key = plainId(wanted);
  return key ? SERMONS.find((s) => plainId(s.id) === key) : undefined;
}

export const SPEAKERS = Array.from(new Set(SERMONS.map((s) => s.speaker))).sort();
export const SERMON_YEARS = Array.from(
  new Set(SERMONS.map((s) => String(zonedParts(sermonDate(s)).year)))
).sort((a, b) => Number(b) - Number(a));
