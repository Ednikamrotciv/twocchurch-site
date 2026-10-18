import { img, SITE } from "./site";
import { registerPhotoCollection } from "./photos";
import type { Testimony, WallPrayer } from "../lib/store";

export const SCRIPTURES: { ref: string; text: string; theme: string }[] = [
  { ref: "1 John 5:4", text: "For whatsoever is born of God overcometh the world: and this is the victory that overcometh the world, even our faith.", theme: "faith" },
  { ref: "Romans 8:37", text: "Nay, in all these things we are more than conquerors through him that loved us.", theme: "faith" },
  { ref: "Isaiah 41:10", text: "Fear thou not; for I am with thee: be not dismayed; for I am thy God: I will strengthen thee; yea, I will help thee.", theme: "fear" },
  { ref: "Philippians 4:6-7", text: "Be careful for nothing; but in every thing by prayer and supplication with thanksgiving let your requests be made known unto God.", theme: "anxiety" },
  { ref: "Jeremiah 29:11", text: "For I know the thoughts that I think toward you, thoughts of peace, and not of evil, to give you an expected end.", theme: "purpose" },
  { ref: "Psalm 30:2", text: "O LORD my God, I cried unto thee, and thou hast healed me.", theme: "healing" },
  { ref: "Exodus 15:26", text: "I am the LORD that healeth thee.", theme: "healing" },
  { ref: "Psalm 23:1", text: "The LORD is my shepherd; I shall not want.", theme: "provision" },
  { ref: "Philippians 4:19", text: "But my God shall supply all your need according to his riches in glory by Christ Jesus.", theme: "provision" },
  { ref: "Joshua 24:15", text: "As for me and my house, we will serve the LORD.", theme: "family" },
  { ref: "Proverbs 22:6", text: "Train up a child in the way he should go: and when he is old, he will not depart from it.", theme: "family" },
  { ref: "Psalm 34:18", text: "The LORD is nigh unto them that are of a broken heart; and saveth such as be of a contrite spirit.", theme: "grief" },
  { ref: "2 Corinthians 5:17", text: "Therefore if any man be in Christ, he is a new creature: old things are passed away; behold, all things are become new.", theme: "salvation" },
  { ref: "Romans 10:9", text: "If thou shalt confess with thy mouth the Lord Jesus, and shalt believe in thine heart that God hath raised him from the dead, thou shalt be saved.", theme: "salvation" },
  { ref: "Luke 15:20", text: "But when he was yet a great way off, his father saw him, and had compassion, and ran, and fell on his neck, and kissed him.", theme: "grace" },
  { ref: "Ephesians 2:8-9", text: "For by grace are ye saved through faith; and that not of yourselves: it is the gift of God: not of works, lest any man should boast.", theme: "grace" },
  { ref: "Psalm 91:11", text: "For he shall give his angels charge over thee, to keep thee in all thy ways.", theme: "protection" },
  { ref: "Isaiah 43:2", text: "When thou passest through the waters, I will be with thee; and through the rivers, they shall not overflow thee.", theme: "protection" },
  { ref: "1 Corinthians 10:13", text: "God is faithful, who will not suffer you to be tempted above that ye are able; but will with the temptation also make a way to escape.", theme: "temptation" },
  { ref: "Psalm 121:1-2", text: "I will lift up mine eyes unto the hills, from whence cometh my help. My help cometh from the LORD.", theme: "help" },
  { ref: "Matthew 11:28", text: "Come unto me, all ye that labour and are heavy laden, and I will give you rest.", theme: "rest" },
  { ref: "Lamentations 3:22-23", text: "It is of the LORD's mercies that we are not consumed, because his compassions fail not. They are new every morning.", theme: "mercy" },
  { ref: "Revelation 12:11", text: "And they overcame him by the blood of the Lamb, and by the word of their testimony.", theme: "testimony" },
  { ref: "Deuteronomy 31:6", text: "Be strong and of a good courage: he will not fail thee, nor forsake thee.", theme: "courage" },
];

export const PRAYER_CATEGORIES = [
  { id: "healing", label: "Healing & health", icon: "heart", verseTheme: "healing" },
  { id: "family", label: "Family & marriage", icon: "home", verseTheme: "family" },
  { id: "finances", label: "Finances & provision", icon: "gift", verseTheme: "provision" },
  { id: "salvation", label: "Salvation of a loved one", icon: "cross", verseTheme: "salvation" },
  { id: "deliverance", label: "Deliverance & breakthrough", icon: "shield", verseTheme: "temptation" },
  { id: "grief", label: "Grief & comfort", icon: "prayer", verseTheme: "grief" },
  { id: "purpose", label: "Direction & purpose", icon: "compass", verseTheme: "purpose" },
  { id: "thanksgiving", label: "Thanksgiving & praise", icon: "star", verseTheme: "mercy" },
];

export const TESTIMONY_CATEGORIES = [
  { id: "salvation", label: "Salvation", accent: "gold" },
  { id: "healing", label: "Healing", accent: "sky" },
  { id: "provision", label: "Provision & jobs", accent: "emerald" },
  { id: "family", label: "Family restored", accent: "crimson" },
  { id: "deliverance", label: "Deliverance", accent: "violet" },
  { id: "missions", label: "Missions & outreach", accent: "gold" },
  { id: "other", label: "God in the ordinary", accent: "sky" },
];

export const SEED_TESTIMONIES: Testimony[] = [
  {
    id: "t-seed-1",
    name: "Amara O.",
    city: "Lagos",
    category: "healing",
    title: "The scan came back clear",
    body:
      "In March the doctors found a growth and gave us a date for surgery. Our small group began fasting on Tuesdays with us. Two weeks before the operation they repeated the scan and found nothing. Nothing. I have never cried like that in a hospital corridor — joy, not fear. God still heals.",
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 6,
    amens: 214,
    iAmened: false,
  },
  {
    id: "t-seed-2",
    name: "Daniel & Rebekah M.",
    city: "Dallas",
    category: "family",
    title: "Our marriage came back from the edge",
    body:
      "We sat in Pastor Michael's office certain we were done. Twelve years, two children, and nothing left but logistics. He asked us to try one thing: pray together out loud for six weeks. It was awkward for about four days. Then God met us in the awkwardness. We celebrate our anniversary again — properly.",
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 21,
    amens: 156,
    iAmened: false,
  },
  {
    id: "t-seed-3",
    name: "Anonymous",
    city: "Lagos",
    category: "deliverance",
    title: "Free after eleven years",
    body:
      "I was bound to something I couldn't speak about for eleven years. I told one intercessor after a Friday service, expecting to be shamed. Instead she prayed with me until 1 a.m. That was fourteen months ago and I have not gone back once. If you are hiding, please — one honest conversation changes everything.",
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 33,
    amens: 341,
    iAmened: false,
  },
  {
    id: "t-seed-4",
    name: "Priya S.",
    city: "Toronto",
    category: "provision",
    title: "A job before the last payment left the account",
    body:
      "My visa did not permit me to be unemployed for long. I applied for over ninety roles and heard nothing. The week my savings ran dry a stranger in this church forwarded my CV to her manager. I interviewed on Thursday and started on Monday. The salary was more than I had dared to ask for.",
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 47,
    amens: 189,
    iAmened: false,
  },
  {
    id: "t-seed-5",
    name: "Joseph K.",
    city: "Abuja",
    category: "salvation",
    title: "My father gave his life to Christ at 78",
    body:
      "I prayed for my father for twenty-six years. He mocked my faith, then tolerated it, then grew quiet about it. Last October he called me from the hospital and asked me to read him something from the Bible. We prayed together on speakerphone. He was gloriously saved at 78 and went home to Jesus four months later.",
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 62,
    amens: 402,
    iAmened: false,
  },
  {
    id: "t-seed-6",
    name: "The Adekunle family",
    city: "Toronto",
    category: "missions",
    title: "Our whole street came to the barbecue",
    body:
      "We were terrified to host the summer barbecue on our street. Two families from church came to help set up, and we simply loved people — no agenda, no tracts, just food. Forty-one neighbours came. Eleven of them have since visited a service, and two are doing Next Steps with us.",
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 81,
    amens: 97,
    iAmened: false,
  },
  {
    id: "t-seed-7",
    name: "Ruth N.",
    city: "Atlanta",
    category: "other",
    title: "God in the night shift",
    body:
      "I am a nurse and I was burning out quietly. Someone in the prayer team wrote me one handwritten card a month — just scripture and 'we are praying for you'. Fourteen cards later I finished my residency. You will never know the ministry of your car dashboard and a stamp.",
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 103,
    amens: 143,
    iAmened: false,
  },
  {
    id: "t-seed-8",
    name: "Michael T.",
    city: "Dallas",
    category: "provision",
    title: "The debt snowball is gone",
    body:
      "Six years ago we were carrying $48,000 of consumer debt. We joined the financial freedom class, stopped pretending, and started giving even while we were paying it down. Last month we made the final payment. I have the screenshot on my phone and I show it to strangers.",
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 128,
    amens: 268,
    iAmened: false,
  },
];

export const SEED_WALL: WallPrayer[] = [
  { id: "w-seed-1", name: "Anonymous", category: "healing", text: "Please pray for my mother's surgery on Thursday. She is the only family I have here.", createdAt: Date.now() - 1000 * 60 * 60 * 5, prayed: 62 },
  { id: "w-seed-2", name: "Kwame", category: "finances", text: "I lost my job three weeks ago and have two children in school. Standing in faith for work.", createdAt: Date.now() - 1000 * 60 * 60 * 19, prayed: 48 },
  { id: "w-seed-3", name: "Anonymous", category: "salvation", text: "Praying my brother would come home — to the Lord and to us. It has been nine years.", createdAt: Date.now() - 1000 * 60 * 60 * 30, prayed: 81 },
  { id: "w-seed-4", name: "Maria", category: "family", text: "Please agree with me for peace in my home this month. We are trying again.", createdAt: Date.now() - 1000 * 60 * 60 * 52, prayed: 37 },
];

export type ChurchEvent = {
  id: string;
  title: string;
  description: string;
  category: "service" | "conference" | "outreach" | "youth" | "prayer" | "class";
  offsetDays: number;
  time: string;
  durationMin: number;
  location: string;
  branchId: string;
  image: string;
  featured?: boolean;
  cost: string;
  register?: boolean;
};

/* Events are stored as offsets from today so the calendar never goes stale.
   Replace with fixed dates if you prefer. */
export const EVENTS: ChurchEvent[] = [
  {
    id: "ev-overcomers-2026",
    title: "Overcomers' Conference 2026",
    description:
      "Three nights, seven branches, one altar. Guest speakers, mass choir and a Friday night of healing ministry. Doors open one hour early for the prayer pre-service.",
    category: "conference",
    offsetDays: 12,
    time: "18:30",
    durationMin: 210,
    location: "Overcomers' Cathedral, Dallas",
    branchId: "dallas",
    image: img("hero"),
    featured: true,
    cost: "Free — offering received",
    register: true,
  },
  {
    id: "ev-worship-night",
    title: "Nights of Worship",
    description: "An unplugged evening of psalms, hymns and spiritual songs with our branch choirs.",
    category: "service",
    offsetDays: 4,
    time: "19:00",
    durationMin: 120,
    location: "Overcomers' Tabernacle, Abuja",
    branchId: "abuja",
    image: img("choir"),
    cost: "Free",
  },
  {
    id: "ev-food-drive",
    title: "Community Food Drive & Pantry Day",
    description: "We are packing 1,200 food parcels for families across the city. Wear comfortable shoes and bring a friend.",
    category: "outreach",
    offsetDays: 9,
    time: "09:00",
    durationMin: 240,
    location: "Overcomers' Fellowship, Atlanta",
    branchId: "atlanta",
    image: img("outreach"),
    cost: "Free — donations welcome",
    register: true,
  },
  {
    id: "ev-youth-lockin",
    title: "Youth Lock-In: Set Apart",
    description: "All-night worship, tournament, testimonies and breakfast at dawn for ages 12–19.",
    category: "youth",
    offsetDays: 16,
    time: "21:00",
    durationMin: 660,
    location: "Overcomers' Centre, Toronto",
    branchId: "toronto",
    image: img("youth"),
    cost: "$15 per teen",
    register: true,
  },
  {
    id: "ev-night-vigil",
    title: "Monthly Night Vigil",
    description: "A watch of prayer from 10pm until 2am. Come with your list, your burden and your expectation.",
    category: "prayer",
    offsetDays: 6,
    time: "22:00",
    durationMin: 240,
    location: "Overcomers' Tabernacle, Lagos",
    branchId: "lagos",
    image: img("prayer"),
    cost: "Free",
  },
  {
    id: "ev-next-steps",
    title: "Next Steps Class",
    description: "New here? Meet the pastors, hear the vision and find your place in this family. Lunch provided.",
    category: "class",
    offsetDays: 19,
    time: "13:30",
    durationMin: 90,
    location: "Overcomers' Cathedral, Dallas",
    branchId: "dallas",
    image: img("welcome"),
    cost: "Free",
    register: true,
  },
  {
    id: "ev-marriage-night",
    title: "Marriage Enrichment Night",
    description: "Dinner, teaching and guided conversation for couples at every stage. Childcare provided on request.",
    category: "class",
    offsetDays: 26,
    time: "18:00",
    durationMin: 150,
    location: "Overcomers' Fellowship, Atlanta",
    branchId: "atlanta",
    image: img("welcome"),
    cost: "$30 per couple",
    register: true,
  },
  {
    id: "ev-baptism",
    title: "Water Baptism Service",
    description: "Ready to take the step? Bring towel and a change of clothes — we provide the robe and the celebration.",
    category: "service",
    offsetDays: 30,
    time: "11:30",
    durationMin: 120,
    location: "All branches",
    branchId: "dallas",
    image: img("bible"),
    cost: "Free",
    register: true,
  },
  {
    id: "ev-missions-banquet",
    title: "Missions Banquet & Commissioning",
    description: "Meet our planters, taste food from six nations and send out the next team with your own hands.",
    category: "conference",
    offsetDays: 38,
    time: "17:00",
    durationMin: 180,
    location: "Overcomers' Tabernacle, Edo",
    branchId: "edo",
    image: img("giving"),
    cost: "$25 suggested",
    register: true,
  },
  {
    id: "ev-kids-camp",
    title: "Kingdom Kids Holiday Camp",
    description: "Five days of crafts, games, memory verses and swimming for ages 5–11.",
    category: "youth",
    offsetDays: 45,
    time: "08:30",
    durationMin: 480,
    location: "Overcomers' Tabernacle, Ogun",
    branchId: "ogun",
    image: img("kids"),
    cost: "$40 per child",
    register: true,
  },
  {
    id: "ev-prayer-fast",
    title: "21 Days of Prayer & Fasting",
    description: "Our annual consecration. Daily devotional sent to your inbox, nightly prayer at 7pm on the stream.",
    category: "prayer",
    offsetDays: 1,
    time: "19:00",
    durationMin: 60,
    location: "Every branch & online",
    branchId: "dallas",
    image: img("bible"),
    cost: "Free",
  },
];

registerPhotoCollection(EVENTS as any[]);

export const READING_PLAN: { day: string; reference: string; theme: string }[] = [
  { day: "Day 1", reference: "1 John 5:1-12", theme: "The faith that overcomes" },
  { day: "Day 2", reference: "Romans 8:31-39", theme: "More than conquerors" },
  { day: "Day 3", reference: "Joshua 1:1-9", theme: "Courage for the crossing" },
  { day: "Day 4", reference: "Psalm 91", theme: "Under His shadow" },
  { day: "Day 5", reference: "Philippians 4:4-13", theme: "Peace that guards" },
  { day: "Day 6", reference: "James 1:2-8", theme: "Joy in the testing" },
  { day: "Day 7", reference: "Revelation 12:7-12", theme: "Overcoming by the blood" },
];

export const MEMORY_VERSES = [
  { ref: "1 John 5:4", text: "For whatsoever is born of God overcometh the world." },
  { ref: "Philippians 4:13", text: "I can do all things through Christ which strengtheneth me." },
  { ref: "Isaiah 40:31", text: "They that wait upon the LORD shall renew their strength." },
  { ref: "Psalm 23:1", text: "The LORD is my shepherd; I shall not want." },
  { ref: "Romans 8:28", text: "All things work together for good to them that love God." },
  { ref: "Proverbs 3:5-6", text: "Trust in the LORD with all thine heart; lean not unto thine own understanding." },
];

/* ============================================================================
   Lists that used to be hard-coded inside individual pages. They live here so
   the admin console can edit them like any other section of the site.
   ========================================================================== */

/** Event filter chips (ids must match the event categories). */
export const EVENT_FILTERS = [
  { id: "all", label: "Everything" },
  { id: "conference", label: "Conferences" },
  { id: "service", label: "Special services" },
  { id: "prayer", label: "Prayer & fasting" },
  { id: "outreach", label: "Outreach" },
  { id: "youth", label: "Youth & children" },
  { id: "class", label: "Classes" },
];

/** The desks a message can be sent to from the contact page. */
export const CONTACT_TOPICS = [
  { id: "general", label: "General enquiry", email: SITE.email },
  { id: "pastoral", label: "Pastoral care & counselling", email: "care@worldovercomers.org" },
  { id: "prayer", label: "Prayer request", email: SITE.prayerEmail },
  { id: "giving", label: "Giving & receipts", email: SITE.givingEmail },
  { id: "media", label: "Media & press", email: SITE.mediaEmail },
  { id: "missions", label: "Missions & partnership", email: "missions@worldovercomers.org" },
  { id: "volunteer", label: "Volunteering", email: SITE.email },
  { id: "visit", label: "Planning my first visit", email: SITE.email },
  { id: "branch", label: "Starting a branch near me", email: SITE.email },
];

/** Ways to give, listed in step 3 of the giving wizard. */
export const GIVING_METHODS = [
  { id: "transfer", label: "Bank transfer", note: "Best for tithes and larger gifts — no processing fees." },
  { id: "in-person", label: "In person", note: "Envelopes are available at every branch." },
];

/** Stewardship questions answered on the giving page. */
export const GIVING_FAQS = [
  { q: "Do I have to give to belong here?", a: "No. Giving is worship, not membership. Nobody checks what you put in, and nobody will ever ask you to explain yourself." },
  { q: "Can I give to a specific fund?", a: "Yes — choose from any of the six funds above. Money designated to a fund is used for that fund; the only exception is if a fund is over-subscribed, in which case it is redirected to the nearest equivalent need (we will tell you if that happens)." },
  { q: "How do I get a receipt?", a: "Email the finance team with the date and fund of your gift and they will send a receipt, usually within two working days. Annual giving statements go out every January for tax purposes." },
  { q: "What if I can't give right now?", a: "Then give your prayers — they are worth more than money. If you need help yourself, our benevolence team exists exactly for this: please contact us." },
  { q: "Do you publish who gives what?", a: "Never. Giving records are seen only by the finance officer and the auditors." },
];

/** Serving team rotas on the ministries page. */
export const SERVING_TEAMS = [
  { name: "Welcome & hospitality", need: "Greeters, ushers, coffee team", slots: "2 per service, 1 Sunday a month" },
  { name: "Kingdom Kids", need: "Teachers, helpers, check-in desk", slots: "Sundays, once a month" },
  { name: "Worship & choir", need: "Singers, instrumentalists, rehearsals", slots: "Thursdays + Sundays" },
  { name: "Media & streaming", need: "Camera, sound, graphics, captions", slots: "Sundays, 2-hour shift" },
  { name: "Prayer team", need: "Intercessors, altar workers, follow-up", slots: "Fridays + monthly vigil" },
  { name: "Missions support", need: "Packers, translators, admin", slots: "Quarterly projects" },
  { name: "Facilities & parking", need: "Stewards, setup, maintenance", slots: "Sundays, early shift" },
  { name: "Benevolence & pantry", need: "Drivers, cooks, delivery pairs", slots: "Second Saturday monthly" },
];

/** Questions asked before someone volunteers. */
export const SERVING_FAQS = [
  { q: "Do I have to be a member to serve?", a: "You need to have trusted Christ and be part of the family, but you do not need to have completed any class to start serving. Membership can come later." },
  { q: "How much time does it take?", a: "Most teams ask for one Sunday a month plus a short briefing. Worship and media teams rehearse on Saturdays for an hour." },
  { q: "I have a disability — can I still serve?", a: "Yes. Tell us what you need and we will find or create a role that fits. Several of our most faithful servers serve from a seated position or from home." },
  { q: "Will I be trained?", a: "Always. No team here expects you to arrive knowing what to do. You will be paired with an experienced server until you are confident." },
  { q: "Can my children serve with me?", a: "Absolutely — children serve alongside parents in hospitality, music and outreach. It is one of the best discipleship tools we have." },
];

/** The prayer points the intercessors are standing on this week. */
export const PRAYER_FOCUS = [
  { text: "Our missionaries in West Africa — strength, protection and open doors." },
  { text: "Marriages in this house — that husbands would love and wives would honour." },
  { text: "The next generation — that our teenagers would stand firm in their schools." },
  { text: "Those waiting on God for children — that faith would not grow weary." },
  { text: "Our city — for revival, justice and provision for the poor." },
  { text: "The sick in our hospitals — for healing and comfort." },
  { text: "Every unsaved family member named in our services last Sunday." },
  { text: "Our leaders — wisdom, integrity and protection." },
];

/** What a first-time visitor can expect, step by step. */
export const VISIT_EXPECT = [
  { icon: "people", title: "A greeter at the door", text: "Someone will meet you, show you where to go and answer any question you have." },
  { icon: "book", title: "About two hours", text: "Worship and prayer, a Bible message, and a short time of ministry at the altar." },
  { icon: "kids", title: "Children are welcome", text: "Kingdom Kids runs during both Sunday services with secure check-in." },
  { icon: "ticket", title: "Nothing to pay", text: "There is no entry fee and no pressure to give. An offering basket is passed for those who want to participate." },
  { icon: "heart", title: "Dress as you are", text: "Some wear suits, some wear jeans. God looks at the heart and so do we." },
  { icon: "prayer", title: "Prayer if you want it", text: "At the end of every service our pastors pray with anyone who comes forward — quietly, briefly and without fuss." },
];

/** The two questions visitors ask that are not in the main FAQ list. */
export const VISIT_FAQS = [
  { q: "Will anyone single me out?", a: "No. Visitors are welcomed warmly from the front but never asked to stand, speak or give. If you'd prefer to stay completely anonymous, sit anywhere and enjoy the service." },
  { q: "Is there parking?", a: "Every branch has free parking with stewards on hand, including accessible bays near the entrance. Arrive 15 minutes early on high Sundays." },
];
