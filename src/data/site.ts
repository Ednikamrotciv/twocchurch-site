import { DEFAULT_CURRENCY, DEFAULT_TIMEZONE, setBaseCurrency, setChurchTimezone, setVisitorCurrencyEnabled, setVisitorTimeEnabled, type ServiceSlot } from "../lib/store";
import { photoSrc, registerPhotoCollection } from "./photos";

const w = window as any;
const pick = (name: string, fallback: string) => {
  const v = w[name];
  if (typeof v === "string" && v.trim()) return v.trim();
  if (v && typeof v.evaluateItem === "string" && v.evaluateItem.trim()) return v.evaluateItem.trim();
  return fallback;
};

/** A bundled photo, following whatever the office has put in its place. */
export const img = (name: string) => photoSrc(name);
export const LOGO = "src/assets/logo.png";
export const LOGO_MARK = "src/assets/logo-mark.png";

export const SITE = {
  name: pick("churchName", "The World Overcomers' Ministries Inc."),
  short: pick("churchShortName", "World Overcomers"),
  initials: "WOM",
  tagline: pick("churchTagline", "Where Champions are raised in Christ"),
  verse: { ref: "1 John 5:4", text: "For whatsoever is born of God overcometh the world: and this is the victory that overcometh the world, even our faith." },
  founded: 1999,
  mission:
    "To raise a generation of world overcomers — men, women and children who know Christ, walk in the power of the Holy Spirit, and carry the gospel to every nation, tribe and tongue.",
  vision:
    "A family of believers on every continent, each branch a lighthouse of prayer, worship and practical love, until the knowledge of the glory of the Lord covers the earth.",
  phone: pick("churchPhone", "+1 (214) 555-0147"),
  whatsapp: "+12145550147",
  email: pick("churchEmail", "hello@worldovercomers.org"),
  prayerEmail: "prayer@worldovercomers.org",
  givingEmail: "giving@worldovercomers.org",
  mediaEmail: "media@worldovercomers.org",
  address: "Overcomers' Cathedral, Oke-Odo Road, Agbado Oke-Odo, Alimosho, Lagos State, Nigeria",
  /** The church's own zone — Lagos. Visitors read on their own clock unless `visitorTime` is off. Editable in console or main.pjs. */
  timezone: pick("churchTimezone", DEFAULT_TIMEZONE),
  /** Show each visitor times on their own clock (note 85). Off: everyone on the church clock. */
  visitorTime: true,
  /** The currency figures are written in (USD unless changed). Visitors read their own. Editable in console or main.pjs. */
  currency: pick("churchCurrency", DEFAULT_CURRENCY),
  /** Show each visitor money in their own currency (note 98). Off: the church's currency as typed. */
  visitorCurrency: true,
  officeHours: [
    { day: 1, open: "09:00", close: "17:00" },
    { day: 2, open: "09:00", close: "17:00" },
    { day: 3, open: "09:00", close: "17:00" },
    { day: 4, open: "09:00", close: "17:00" },
    { day: 5, open: "09:00", close: "13:00" },
  ],
  socials: [
    { label: "YouTube", handle: "@twocorg", url: "https://www.youtube.com/@twocorg", icon: "youtube" },
    { label: "Facebook", handle: "/worldovercomers", url: "https://www.facebook.com/", icon: "facebook" },
    { label: "Instagram", handle: "@worldovercomers", url: "https://www.instagram.com/", icon: "instagram" },
  ],
};

/* Church clock to the time helpers at once, so module dates are Lagos dates. */
setChurchTimezone(SITE.timezone);
setVisitorTimeEnabled(SITE.visitorTime);
setBaseCurrency(SITE.currency);
setVisitorCurrencyEnabled(SITE.visitorCurrency);

/** Menu entries. `label`/`desc` are copy keys (src/data/copy.ts, page "site"),
    not the words themselves — so the office can reword the menu from the editor. */
export type NavItem = { label: string; to: string; desc: string };

export const NAV: NavItem[] = [
  { label: "site.nav.home", to: "/", desc: "site.nav.home.desc" },
  { label: "site.nav.about", to: "/about", desc: "site.nav.about.desc" },
  { label: "site.nav.locations", to: "/locations", desc: "site.nav.locations.desc" },
  { label: "site.nav.sermons", to: "/sermons", desc: "site.nav.sermons.desc" },
  { label: "site.nav.events", to: "/events", desc: "site.nav.events.desc" },
  { label: "site.nav.testimonies", to: "/testimonies", desc: "site.nav.testimonies.desc" },
  { label: "site.nav.giving", to: "/giving", desc: "site.nav.giving.desc" },
  { label: "site.nav.contact", to: "/contact", desc: "site.nav.contact.desc" },
];

/** Footer columns — `title`/`label` are copy keys too (page "site"). */
export const FOOTER_LINKS: { title: string; links: { label: string; to: string }[] }[] = [
  {
    title: "site.footer.worship.title",
    links: [
      { label: "site.footer.worship.visit", to: "/visit" },
      { label: "site.footer.worship.locations", to: "/locations" },
      { label: "site.footer.worship.sermons", to: "/sermons" },
      { label: "site.footer.worship.live", to: "/watch-live" },
      { label: "site.footer.worship.devotional", to: "/devotional" },
    ],
  },
  {
    title: "site.footer.family.title",
    links: [
      { label: "site.footer.family.ministries", to: "/ministries" },
      { label: "site.footer.family.events", to: "/events" },
      { label: "site.footer.family.testimonies", to: "/testimonies" },
      { label: "site.footer.family.prayer", to: "/prayer" },
      { label: "site.footer.family.library", to: "/library" },
    ],
  },
  {
    title: "site.footer.partner.title",
    links: [
      { label: "site.footer.partner.donate", to: "/donate" },
      { label: "site.footer.partner.missions", to: "/giving?fund=missions" },
      { label: "site.footer.partner.volunteer", to: "/ministries?volunteer=1" },
      { label: "site.footer.partner.testimony", to: "/testimonies?share=1" },
      { label: "site.footer.partner.contact", to: "/contact" },
    ],
  },
];

export const SERVICES: ServiceSlot[] = [
  { day: 0, time: "09:00", name: "Sunday Celebration", minutes: 120 },
  { day: 0, time: "11:30", name: "Sunday Celebration", minutes: 120 },
  { day: 3, time: "19:00", name: "Midweek Bible Study", minutes: 90 },
  { day: 5, time: "18:30", name: "Prayer & Fasting", minutes: 90 },
];

export const STATS = [
  { value: 7, label: "Branches worldwide", suffix: "" },
  { value: 4, label: "Continents reached", suffix: "" },
  { value: 12400, label: "Members in covenant", suffix: "+" },
  { value: 27, label: "Years of ministry", suffix: "" },
  { value: 41, label: "Nations touched", suffix: "" },
  { value: 1840, label: "Volunteers serving", suffix: "+" },
];

export const VALUES = [
  { title: "Christ at the centre", text: "Everything we build begins and ends with Jesus — His cross, His resurrection, His lordship over every area of life.", icon: "cross" },
  { title: "The Word without apology", text: "We teach the whole counsel of God plainly and let Scripture, not culture, set the agenda.", icon: "book" },
  { title: "Prayer as a first language", text: "Nothing of eternal value happens without prayer. Our altars stay open and our knees stay bent.", icon: "prayer" },
  { title: "Every member a minister", text: "You were not saved to sit. We help every believer discover, develop and deploy their gift.", icon: "people" },
  { title: "Family as the first church", text: "Strong homes make strong churches. We disciple marriages, parents and children on purpose.", icon: "home" },
  { title: "Generosity that costs something", text: "We give because He gave. Our people fund the gospel, feed the hungry and send the called.", icon: "gift" },
  { title: "Honour & integrity", text: "We do ministry above board — transparent accounts, accountable leaders, honest words.", icon: "shield" },
  { title: "The urgency of the harvest", text: "The fields are white. We work while it is day, because night is coming when no one can work.", icon: "globe" },
];

export const BELIEFS = [
  {
    title: "The Scriptures",
    text: "We believe the Bible is the inspired, infallible Word of God — our only rule of faith and conduct, profitable for doctrine, correction and training in righteousness.",
    verse: "2 Timothy 3:16-17",
  },
  {
    title: "The Triune God",
    text: "We believe in one God eternally existing in three persons: Father, Son and Holy Spirit — equal in power, glory and majesty.",
    verse: "Matthew 28:19",
  },
  {
    title: "Salvation by grace",
    text: "We believe salvation is the free gift of God, received by grace through faith in the finished work of Jesus Christ, and not by works, lest any should boast.",
    verse: "Ephesians 2:8-9",
  },
  {
    title: "The Holy Spirit",
    text: "We believe in the present-day ministry of the Holy Spirit — that He indwells, fills, gifts and empowers believers for holy living and effective witness.",
    verse: "Acts 1:8",
  },
  {
    title: "Water baptism & communion",
    text: "We believe in baptism by immersion for believers, and in the Lord's Supper as a memorial of His death until He comes.",
    verse: "Acts 2:38; 1 Corinthians 11:26",
  },
  {
    title: "Divine healing",
    text: "We believe that the atonement provides healing for the body, and we pray for the sick with expectation, honouring God whether He heals now or later.",
    verse: "Isaiah 53:5",
  },
  {
    title: "The overcomer's life",
    text: "We believe the born-again believer is called to overcome the world, the flesh and the devil — through faith, the blood of the Lamb and the word of their testimony.",
    verse: "Revelation 12:11",
  },
  {
    title: "The return of Christ",
    text: "We believe in the imminent, visible return of Jesus Christ, the resurrection of the dead, and eternal life with God for all who believe.",
    verse: "1 Thessalonians 4:16-17",
  },
];

export const TIMELINE = [
  { year: "1999", title: "A room, a pulpit, a promise", text: "Twelve friends began gathering in a rented community hall in South Dallas with one conviction: God still saves, heals and delivers." },
  { year: "2003", title: "The Overcomers' Chapel opens", text: "The young congregation bought its first building — a former warehouse — and filled it within a year." },
  { year: "2007", title: "First daughter church", text: "A church plant in Atlanta became our model for releasing, rather than hoarding, growth." },
  { year: "2011", title: "Global Missions launched", text: "Overcomers Missions began supporting indigenous church planters across West Africa and South Asia." },
  { year: "2016", title: "The broadcast goes global", text: "Weekly teaching went on air and online, opening doors in over forty nations." },
  { year: "2020", title: "Church without walls", text: "When the world closed, we were already live. Small groups carried the church into living rooms." },
  { year: "2024", title: "Three nations, one family", text: "Our Nigerian sub-branches — Lagos, Abuja, Edo and Ogun — were joined by Toronto in Canada. Seven gatherings, one altar." },
  { year: "2026", title: "The next generation", text: "Our focus now: raising, training and sending young overcomers into every sphere of society." },
];

export type Person = { id: string; name: string; role: string; bio: string; image?: string; monogram: string; since: string; verse?: string };

export const LEADERSHIP: Person[] = [
  {
    id: "adeyemi",
    name: "Pastor Emmanuel Adeyemi",
    role: "Founder & Senior Pastor",
    bio: "Pastor Emmanuel has shepherded this house for over two decades with a singular burden: that believers would live as more than conquerors. He teaches expositionally, prays with urgency and is happiest when strangers become family.",
    image: img("pastor-1"),
    monogram: "EA",
    since: "1999",
    verse: "\"We are more than conquerors through him that loved us.\" — Romans 8:37",
  },
  {
    id: "adeyemi-g",
    name: "Pastor Grace Adeyemi",
    role: "Co-Pastor & Director of Women of Worth",
    bio: "Pastor Grace leads our women's ministry, pastoral care and counselling teams. Her quiet wisdom and fierce intercession have carried countless families through their darkest seasons.",
    image: img("pastor-2"),
    monogram: "GA",
    since: "1999",
    verse: "\"She openeth her mouth with wisdom; and in her tongue is the law of kindness.\" — Proverbs 31:26",
  },
  {
    id: "thompson",
    name: "Rev. Michael Thompson",
    role: "Executive Pastor",
    bio: "Rev. Michael oversees branch operations, stewardship and our leadership development pipeline, ensuring that growth never outruns integrity and that every member is known by name.",
    image: img("pastor-3"),
    monogram: "MT",
    since: "2006",
  },
  {
    id: "kim",
    name: "Pastor Daniel Kim",
    role: "Youth & Branch Pastor",
    bio: "Pastor Daniel serves our teenagers and university students in Toronto, Dallas and beyond. He is a gifted communicator to the next generation and a relentless trainer of student leaders.",
    image: img("pastor-4"),
    monogram: "DK",
    since: "2018",
  },
  { id: "osei", name: "Pastor Sarah Osei", role: "Missions Director", bio: "Pastor Sarah coordinates our indigenous church planters across three continents and travels yearly to encourage the field.", monogram: "SO", since: "2011" },
  { id: "patel", name: "Deacon Rachel Patel", role: "Director of Benevolence", bio: "Deacon Rachel runs the food pantry, rent assistance and hospital visitation ministry — the hands and feet of this house in practical form.", monogram: "RP", since: "2014" },
  { id: "mbeche", name: "Bro. Joshua Mbeche", role: "Worship & Media Lead", bio: "Joshua leads our worship teams and media crew, stewarding the sound of this house across seven branches and the online broadcast.", monogram: "JM", since: "2016" },
  { id: "diaz", name: "Sista Maria Diaz", role: "Children's Ministry Lead", bio: "Maria builds the safest, brightest room in the building — where children meet Jesus and learn that they belong.", monogram: "MD", since: "2012" },
];

export type Ministry = { id: string; name: string; image: string; description: string; meets: string; leader: string; for: string };

registerPhotoCollection(LEADERSHIP as any[]);

export const MINISTRIES: Ministry[] = [
  { id: "children", name: "Kingdom Kids", image: img("kids"), description: "Bible-centred, play-rich discipleship for ages 3–11 with a secure check-in system and trained volunteers at every branch.", meets: "Sundays, 9:00 & 11:30 AM", leader: "Sista Maria Diaz", for: "Ages 3–11" },
  { id: "youth", name: "Overcomers Youth", image: img("youth"), description: "High-energy worship, honest teaching and real friendships for teenagers finding their footing in Christ.", meets: "Fridays, 6:30 PM", leader: "Pastor Daniel Kim", for: "Ages 12–19" },
  { id: "branch", name: "Branch & Young Adults", image: img("worshipband"), description: "University students and young professionals living out their faith in lecture halls, offices and shared flats.", meets: "Thursdays, 7:00 PM", leader: "Pastor Daniel Kim", for: "Ages 18–29" },
  { id: "women", name: "Women of Worth", image: img("choir"), description: "Bible study, mentoring and practical support for women in every season — single, married, mothering or mentoring.", meets: "Tuesdays, 6:00 PM", leader: "Pastor Grace Adeyemi", for: "Women" },
  { id: "men", name: "Men of Valour", image: img("bible"), description: "Brothers sharpening brothers in purity, provision, fatherhood and purpose — no masks, no pretence.", meets: "Saturdays, 7:00 AM", leader: "Rev. Michael Thompson", for: "Men" },
  { id: "worship", name: "Worship & Media", image: img("worshipband"), description: "Choirs, bands, sound, lighting and streaming crews who serve the congregation by making worship undistracting.", meets: "Rehearsals Saturdays, 4:00 PM", leader: "Bro. Joshua Mbeche", for: "Serving team" },
  { id: "prayer", name: "Prayer & Intercession", image: img("prayer"), description: "Watchmen who keep the altar burning — night vigils, monthly fasts and round-the-clock intercession for the nations.", meets: "Fridays, 6:30 PM + monthly vigil", leader: "Pastor Grace Adeyemi", for: "Everyone" },
  { id: "outreach", name: "Mercy & Outreach", image: img("outreach"), description: "Food pantry, prison visits, hospital rounds, community clean-ups and disaster relief in every city where we gather.", meets: "Second Saturday monthly", leader: "Deacon Rachel Patel", for: "Everyone" },
  { id: "marriage", name: "Marriage & Family", image: img("welcome"), description: "Pre-marital counselling, marriage enrichment nights and parenting workshops to build homes that outlast us.", meets: "Monthly, first Friday", leader: "Rev. Michael Thompson", for: "Couples & families" },
  { id: "missions", name: "Overcomers Missions", image: img("giving"), description: "Supporting indigenous planters, translated Bibles and clean-water projects across three continents.", meets: "Quarterly commissioning", leader: "Pastor Sarah Osei", for: "Partners & givers" },
];

registerPhotoCollection(MINISTRIES as any[]);

export const FAQS = [
  { q: "I've never been to church — what happens when I arrive?", a: "You'll be greeted at the door by a real human being, handed a printed programme and shown to a seat — or to our Visitors' Lounge if you'd prefer to meet a pastor first. You are not asked to stand, speak or give anything." },
  { q: "How long is a service?", a: "About two hours: roughly 30 minutes of worship and prayer, a 45–50 minute message from the Word, and a short time of ministry at the altar." },
  { q: "Is there something for my children?", a: "Yes. Kingdom Kids runs concurrently with both Sunday services for ages 3–11, with secure check-in, trained volunteers and a Bible lesson pitched right at their level." },
  { q: "Do you offer communion and baptism?", a: "We celebrate the Lord's Supper on the first Sunday of every month, and we hold water baptism services quarterly. Anyone who has trusted Christ can be baptised — just speak to a pastor." },
  { q: "Is the building accessible?", a: "Every branch has step-free access, accessible restrooms and reserved seating. Tell us what you need on our Plan Your Visit form and we'll have it ready." },
  { q: "How do I become a member?", a: "Join our Next Steps class, held after the 11:30 AM service on the third Sunday of each month. You'll hear our vision, ask questions and, if you're ready, covenant with the family." },
  { q: "Where does my giving actually go?", a: "Our accounts are independently audited and published to members annually. Missions, facilities, pastoral care, youth and outreach are the largest line items." },
];

export const DEPARTMENTS = [
  { name: "General enquiries", email: SITE.email, desc: "Questions about the church, membership or Next Steps.", hours: "Mon–Fri, 9 AM–5 PM" },
  { name: "Pastoral care & counselling", email: "care@worldovercomers.org", desc: "Hospital visits, bereavement, marriage and family support.", hours: "By appointment" },
  { name: "Prayer team", email: SITE.prayerEmail, desc: "Urgent and ongoing prayer requests, altar ministry.", hours: "Answered within 24 hours" },
  { name: "Giving & finance", email: SITE.givingEmail, desc: "Tithes, offerings, receipts and building fund questions.", hours: "Mon–Fri, 9 AM–4 PM" },
  { name: "Media & broadcast", email: SITE.mediaEmail, desc: "Sermon permissions, livestream, podcast and press.", hours: "Tue–Sat, 10 AM–6 PM" },
  { name: "Missions & partners", email: "missions@worldovercomers.org", desc: "Church planting partnerships and missionary support.", hours: "Mon–Thu, 9 AM–5 PM" },
];

export const GIVING_FUNDS = [
  { id: "tithe", name: "Tithes", desc: "The first tenth, returned in obedience and worship.", verse: "Malachi 3:10" },
  { id: "offering", name: "Offerings", desc: "Freewill gifts that keep the lights on and the doors open.", verse: "2 Corinthians 9:7" },
  { id: "building", name: "Building & Grounds", desc: "Repairs, seating and our next sanctuary project.", verse: "1 Chronicles 29:3" },
  { id: "missions", name: "Missions & Church Planting", desc: "Sending and sustaining planters on three continents.", verse: "Matthew 28:19" },
  { id: "benevolence", name: "Mercy & Benevolence", desc: "Food, rent assistance and hospital care for those in need.", verse: "James 1:27" },
  { id: "youth", name: "Youth & Children", desc: "Curriculum, camps and scholarships for the next generation.", verse: "Psalm 145:4" },
];

export const GIVING_BREAKDOWN = [
  { label: "Missions & church planting", pct: 28 },
  { label: "Facilities & mortgage", pct: 22 },
  { label: "Pastoral care & benevolence", pct: 16 },
  { label: "Youth, children & branch", pct: 14 },
  { label: "Local outreach", pct: 12 },
  { label: "Administration & audit", pct: 8 },
];

export const BANK_ACCOUNTS = [
  { region: "Lagos (NGN)", bank: "Covenant Microfinance Bank, Lagos", name: "World Overcomers Ministries Ltd/Gte", acct: "0133447788" },
];
