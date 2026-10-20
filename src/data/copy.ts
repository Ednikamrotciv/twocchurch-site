/* Every headline and paragraph in one place, editable under Page text.
   *em* **strong** [label](/route); {{tokens}} filled by pages.
   Titles/buttons locked; `locked` lines unlisted (notes 47-50, 64). Name/logo not here (site.ts/assets). */

import { AUTO_ENTRIES } from "./autocopy";
import { translatedText } from "../lib/i18n";

export type CopyRole = "button" | "pageTitle" | "sectionTitle";
export type CopyEntry = { id: string; label: string; value: string; role?: CopyRole; locked?: boolean };
export type CopyPage = { id: string; label: string; blurb: string; entries: CopyEntry[] };
/** One group of lines inside a page-text section (the site's own segments). */
export type CopySegment = { key: string; label: string; entries: CopyEntry[] };
const HAND_PAGES: CopyPage[] = [
  /* ------------------------------------------------------------------ home */
  {
    id: "home",
    label: "Home page",
    blurb: "The hero, the welcome section and every section heading on the front page.",
    entries: [
      {
        id: "home.hero.title",
        locked: true,
        label: "Hero headline",
        value: "Where *Champions*\nare raised in Christ",
      },
      {
        id: "home.hero.lede",
        label: "Hero paragraph",
        /* Locked: the church does not want this one reworded, and it should not
           sit in the editor's list of paragraphs. It stays on the hero. */
        locked: true,
        value:
          "We are Christ-centered, People of Accountability & integrity, Relationship designed and We are people of Excellence (CARE).",
      },
      { id: "home.hero.cta1", locked: true, label: "Hero button 1", value: "Watch sermons" },
      { id: "home.hero.cta2", locked: true, label: "Hero button 2", value: "Locate our family" },
      { id: "home.hero.cta3", locked: true, label: "Hero button 3", value: "Prayer request" },
      { id: "home.hero.cta4", locked: true, label: "Hero button 4", value: "Share your testimony" },
      { id: "home.hero.stream", locked: true, label: "Hero stream link", value: "Stream details" },
      { id: "home.welcome.eyebrow", locked: true, label: "Welcome — eyebrow", value: "Welcome home" },
      {
        id: "home.welcome.title",
        locked: true,
        label: "Welcome — headline",
        value: "You were not made to survive. You were made to overcome.",
      },
      {
        id: "home.welcome.lede",
        label: "Welcome — paragraph",
        value:
          "{{church}} began in 1999 with twelve people in a rented hall who believed God still saves, heals and delivers. Today we are seven branches and thousands of members — but we are still one family, and there is still room for you.",
      },
      { id: "home.welcome.badge", locked: true, label: "Welcome — badge label", value: "years of ministry" },
      { id: "home.welcome.cta1", locked: true, label: "Welcome — button 1", value: "Our story & beliefs" },
      { id: "home.welcome.cta2", locked: true, label: "Welcome — button 2", value: "Find your place" },
      { id: "home.sermons.eyebrow", locked: true, label: "Latest sermon — eyebrow", value: "This week's word" },
      { id: "home.sermons.title", locked: true, label: "Latest sermon — headline", value: "Fresh from the pulpit" },
      {
        id: "home.sermons.lede",
        label: "Latest sermon — paragraph",
        value:
          "Missed Sunday? Every message is recorded, captioned and archived — with notes and discussion questions for your small group.",
      },
      { id: "home.sermons.action", locked: true, label: "Latest sermon — button", value: "All sermons" },
      { id: "home.testimonies.eyebrow", locked: true, label: "Testimonies — eyebrow", value: "The overcomer's report" },
      { id: "home.testimonies.title", locked: true, label: "Testimonies — headline", value: "Your story is somebody's lifeline" },
      {
        id: "home.testimonies.lede",
        label: "Testimonies — paragraph",
        value: "Real people, real battles, real deliverance. Read what God is doing in this family — then add your own.",
      },
      { id: "home.testimonies.action", locked: true, label: "Testimonies — button", value: "Share with us" },
      { id: "home.events.eyebrow", locked: true, label: "Calendar — eyebrow", value: "On the calendar" },
      { id: "home.events.title", locked: true, label: "Calendar — headline", value: "What's happening next" },
      { id: "home.events.action", locked: true, label: "Calendar — button", value: "Full calendar" },
      { id: "home.branches.eyebrow", locked: true, label: "Branches — eyebrow", value: "Our family" },
      { id: "home.branches.title", locked: true, label: "Branches — headline", value: "Find a branch near you" },
      {
        id: "home.branches.lede",
        label: "Branches — paragraph",
        value:
          "Seven branches across Nigeria, America and Canada — every one with the same Word, the same warmth and a seat with your name on it.",
      },
      { id: "home.branches.action", locked: true, label: "Branches — button", value: "Locate our family" },
      { id: "home.ministries.eyebrow", locked: true, label: "Ministries — eyebrow", value: "Get involved" },
      { id: "home.ministries.title", locked: true, label: "Ministries — headline", value: "There is a place for you here" },
      {
        id: "home.ministries.lede",
        label: "Ministries — paragraph",
        value: "You were not saved to sit. Every ministry in this house exists to help you grow and to help somebody else find Jesus.",
      },
    ],
  },

  /* ----------------------------------------------------------------- about */
  {
    id: "about",
    label: "About page",
    blurb: "Mission, vision, story, beliefs and leadership headings.",
    entries: [
      { id: "about.head.eyebrow", label: "Page — eyebrow", value: "About us" },
      { id: "about.head.title", label: "Page — headline", value: "A house built on the *Rock*, for overcomers" },
      {
        id: "about.head.lede",
        label: "Page — paragraph",
        /* Locked at the church's request (SPEC note 64). */
        locked: true,
        value:
          "{{church}} exists to raise a generation of world overcomers — believers who know Christ, walk in the Spirit and carry the gospel to every nation. This is who we are and what we believe.",
      },
      { id: "about.mission.title", label: "Mission card — heading", value: "Our mission" },
      { id: "about.vision.title", label: "Vision card — heading", value: "Our vision" },
      { id: "about.anchor.title", label: "Anchor verse card — heading", value: "Our anchor" },
      {
        id: "about.pledge",
        label: "Pledge under the cards",
        locked: true,
        value:
          "Our mission is not to fill a building but to build people — every sermon, every ministry, every branch measured by one question: **are people becoming more like Jesus?**",
      },
      { id: "about.values.eyebrow", label: "Values — eyebrow", value: "What we hold dear" },
      { id: "about.values.title", label: "Values — headline", value: "Eight convictions that shape everything" },
      { id: "about.story.eyebrow", label: "Our story — eyebrow", value: "Our story" },
      { id: "about.story.title", label: "Our story — headline", value: "From twelve people to seven branches" },
      {
        id: "about.story.lede",
        label: "Our story — paragraph",
        locked: true,
        value: "God has been faithful at every stage. Here are the milestones we remember with gratitude.",
      },
      { id: "about.beliefs.eyebrow", label: "Beliefs — eyebrow", value: "Sound doctrine, warm hearts" },
      { id: "about.beliefs.title", label: "Beliefs — headline", value: "What we believe" },
      {
        id: "about.beliefs.lede",
        label: "Beliefs — paragraph",
        locked: true,
        value:
          "We are unapologetically Bible-believing and joyfully Spirit-filled. These eight statements summarise the faith once delivered to the saints.",
      },
      { id: "about.leaders.eyebrow", label: "Leadership — eyebrow", value: "Leadership" },
      { id: "about.leaders.title", label: "Leadership — headline", value: "The people who serve you" },
      {
        id: "about.leaders.lede",
        locked: true,
        label: "Leadership — paragraph",
        value:
          "Accountable, approachable and available. Our pastors and deacons are not celebrities — they are shepherds with phone numbers.",
      },
      { id: "about.leaders.action", label: "Leadership — button", value: "Contact the team" },
      { id: "about.numbers.eyebrow", label: "Numbers — eyebrow", value: "The family today" },
      { id: "about.numbers.title", label: "Numbers — headline", value: "Where we are, by the numbers" },
      { id: "about.faq.eyebrow", label: "FAQs — eyebrow", value: "Questions" },
      { id: "about.faq.title", label: "FAQs — headline", value: "Frequently asked questions" },
      { id: "about.faq.action", label: "FAQs — button", value: "Ask us something else" },
      { id: "about.readBio", label: "Leadership card link", value: "Read bio" },
    ],
  },

  /* ------------------------------------------------------------- watch live */
  {
    id: "live",
    label: "Watch live page",
    blurb: "The live panel, the “while you watch” list and the two catch-up sections. How many services *Recent services* holds, and the hours promised for a write-up, are set in the Live stream section.",
    entries: [
      { id: "live.head.eyebrow", label: "Page — eyebrow", value: "Watch live" },
      { id: "live.head.title", label: "Page — headline", value: "Join us, *wherever* you are" },
      {
        id: "live.head.lede",
        label: "Page — paragraph",
        locked: true,
        value:
          "Every Sunday we go live from the Cathedral, and every branch streams its own gathering. If you cannot be in the room, be in the chat — our online hosts pray with hundreds of people each week.",
      },
      { id: "live.watch.button1", label: "Player buttons — button 1", value: "Watch on YouTube" },
      { id: "live.watch.button2", label: "Player buttons — button 2", value: "Watch on Facebook" },
      { id: "live.last.eyebrow", label: "Last message — eyebrow", value: "Last message" },
      { id: "live.last.title", label: "Last message — headline", value: "Missed the last one? Watch it here" },
      {
        id: "live.last.lede",
        locked: true,
        label: "Last message — paragraph",
        value:
          "The most recent message, playing right here on this page. If it is not the one you were looking for, every earlier service is underneath.",
      },
      { id: "live.card.youtube", label: "Sermon card — YouTube button", value: "Watch on YouTube" },
      { id: "live.card.facebook", label: "Sermon card — Facebook button", value: "Watch on Facebook" },
      { id: "live.card.upload", label: "Sermon card — uploaded video button", value: "Play the video file" },
      { id: "live.card.openYoutube", label: "Sermon card — button to open on YouTube", value: "Open on YouTube" },
      { id: "live.card.openFacebook", label: "Sermon card — button to open on Facebook", value: "Open on Facebook" },
      { id: "live.card.openFile", label: "Sermon card — button to open the video file", value: "Open the video file" },
      { id: "live.card.message", label: "Sermon card — button to the message page", value: "Notes & discussion" },
      { id: "live.card.pickLabel", label: "Sermon card — player picker", value: "Where this message plays from" },
      { id: "live.platform.label", label: "Player — label above the player", value: "Choose where to watch" },
      {
        id: "live.platform.hint",
        locked: true,
        label: "Player — hint under the player",
        value: "Both streams are the same service — pick whichever one loads best for you.",
      },
      { id: "live.fallback.title", label: "No stream set — headline", value: "The stream opens here on Sunday" },
      {
        id: "live.fallback.text",
        locked: true,
        label: "No stream set — text",
        value:
          "Nobody has published a stream link for this service yet. In the meantime, every recent message is in the archive below.",
      },
      { id: "live.next.badge", label: "Next broadcast — badge", value: "Next broadcast" },
      { id: "live.live.prefix", label: "Live badge — text", value: "Live now" },
      { id: "live.player.badge", label: "Player — badge while on air", value: "Live" },
      {
        id: "live.where.text",
        locked: true,
        label: "Streaming note under the player",
        value: "We stream on {{platforms}} — the player opens here on Sunday.",
      },
      {
        id: "live.preview.note",
        locked: true,
        label: "Live — notice under the player",
        value:
          "We are on air now — you are watching our most recent service.",
      },
      { id: "live.side.title", label: "While you watch — heading", value: "While you watch" },
      { id: "live.side.1.title", label: "While you watch 1 — heading", value: "Give during service" },
      { id: "live.side.1.text", label: "While you watch 1 — text", value: "Tithes, offerings and pledges" },
      { id: "live.side.2.title", label: "While you watch 2 — heading", value: "Service notes" },
      { id: "live.side.2.text", label: "While you watch 2 — text", value: "Follow along with the outline" },
      { id: "live.side.3.title", label: "While you watch 3 — heading", value: "Chat with an online host" },
      { id: "live.side.3.text", label: "While you watch 3 — text", value: "We reply within minutes" },
      { id: "live.side.4.title", label: "While you watch 4 — heading", value: "First time watching?" },
      { id: "live.side.4.text", label: "While you watch 4 — text", value: "Tell us you came — we'll reach out" },
      { id: "live.replay.eyebrow", label: "Catch up — eyebrow", value: "Catch up" },
      { id: "live.replay.title", label: "Catch up — headline", value: "Recent services" },
      {
        id: "live.replay.lede",
        locked: true,
        label: "Catch up — paragraph",
        /* {{limit}} is the office's number (Live stream → *How many recent
           services to show*), read through `recentLimit()` in src/data/live.ts,
           so the line always describes the list under it. */
        value:
          "The {{limit}} most recent services we streamed are here to play — older livestreams stay on our YouTube channel and Facebook page.",
      },
      { id: "live.replay.action", label: "Catch up — button", value: "Full archive" },
      { id: "live.recent.watch", label: "Recent services — card link", value: "Watch on YouTube" },
      { id: "live.past.eyebrow", label: "Previous sermons — eyebrow", value: "Previous sermons" },
      { id: "live.past.title", label: "Previous sermons — headline", value: "Services we have broadcasted" },
      {
        id: "live.past.lede",
        locked: true,
        label: "Previous sermons — paragraph",
        /* {{hours}} is the office's promise (Live stream → *Hours until it is
           written up*), read through `sermonTurnaroundHours()` in
           src/data/live.ts. */
        value:
          "Every message is written up and uploaded by the office after the service — usually within {{hours}} hours of it closing. Open one for the notes and the discussion questions.",
      },
      { id: "live.past.action", label: "Previous sermons — button", value: "Full sermon archive" },
      { id: "live.past.badge", label: "Sermon card — live badge", value: "Broadcast" },
      {
        id: "live.past.badge.hint",
        label: "Sermon card — live badge tooltip",
        value: "This message was one of our live broadcasts",
      },
      { id: "live.ways.eyebrow", label: "Ways to watch — eyebrow", value: "Ways to watch" },
      { id: "live.ways.title", label: "Ways to watch — headline", value: "Everywhere you already are" },
    ],
  },

  /* ---------------------------------------------------------------- sermons */
  {
    id: "sermons",
    label: "Sermons page",
    blurb: "The sermon archive headings, filters and empty states.",
    entries: [
      { id: "sermons.head.eyebrow", label: "Page — eyebrow", value: "Watch sermons" },
      { id: "sermons.head.title", label: "Page — headline", value: "The Word, *unfiltered*" },
      {
        id: "sermons.head.lede",
        locked: true,
        label: "Page — paragraph",
        value:
          "Every message we have preached is archived here — {{count}} sermons, {{hours}} of teaching. Stream it, take notes, and share it with someone who needs it.",
      },
      { id: "sermons.featured.eyebrow", label: "Latest message — eyebrow", value: "Latest message" },
      { id: "sermons.archive.eyebrow", label: "Archive — eyebrow", value: "The archive" },
      { id: "sermons.archive.title", label: "Archive — headline", value: "Browse every message" },
      { id: "sermons.search", label: "Search placeholder", value: "Search sermons, speakers, scriptures…" },
      { id: "sermons.results", label: "Result count", value: "{{n}} messages found" },
      { id: "sermons.empty.title", label: "No results — headline", value: "No sermons match those filters" },
      {
        id: "sermons.empty.text",
        locked: true,
        label: "No results — text",
        value: "Try clearing the search box or choosing a different speaker or year.",
      },
      { id: "sermons.ways.eyebrow", label: "Ways to watch — eyebrow", value: "Ways to watch" },
      { id: "sermons.ways.title", label: "Ways to watch — headline", value: "Sermons, wherever you are" },
    ],
  },

  /* --------------------------------------------------------- single sermon */
  {
    id: "sermon",
    label: "Sermon page",
    blurb: "The cards beside a single message: notes, points, discussion and platforms.",
    entries: [
      { id: "sermon.about.title", label: "About this message — heading", value: "About this message" },
      { id: "sermon.points.title", label: "Key points — heading", value: "Key points" },
      { id: "sermon.scripture.title", label: "Scripture — heading", value: "Scripture" },
      { id: "sermon.notes.title", label: "My notes — heading", value: "My notes" },
      {
        id: "sermon.notes.placeholder",
        locked: true,
        label: "My notes — placeholder",
        value: "What is God saying to you through this message?",
      },
      { id: "sermon.questions.title", label: "Discussion — heading", value: "Discuss it in your group" },
      {
        id: "sermon.outline.note",
        locked: true,
        label: "Discussion — note",
        value:
          "Leading a small group? Download the outline above for the full leader's sheet with timings, ice-breakers and prayer points.",
      },
      { id: "sermon.platforms.title", label: "Other platforms — heading", value: "Watch on other platforms" },
      { id: "sermon.archive.eyebrow", label: "Archive — eyebrow", value: "From the archive" },
      { id: "sermon.archive.title", label: "Archive — headline", value: "Previous sermons" },
    ],
  },

  /* ----------------------------------------------------------------- events */
  {
    id: "events",
    label: "Events page",
    blurb: "The calendar page: featured event, filters, newsletter and notices.",
    entries: [
      { id: "events.head.eyebrow", label: "Page — eyebrow", value: "Events" },
      { id: "events.head.title", label: "Page — headline", value: "What's happening *next*" },
      {
        id: "events.head.lede",
        locked: true,
        label: "Page — paragraph",
        value:
          "Conferences, vigils, outreach days, classes and lock-ins. Everything here is open to you — most of it is free, and all of it is better with a friend.",
      },
      { id: "events.head.action1", label: "Page — button 1", value: "Ask about an event" },
      { id: "events.head.action2", label: "Page — button 2", value: "Serve at an event" },
      { id: "events.featured.eyebrow", label: "Featured — eyebrow", value: "Coming up in {{days}} days" },
      { id: "events.calendar.eyebrow", label: "Calendar — eyebrow", value: "The calendar" },
      { id: "events.calendar.title", label: "Calendar — headline", value: "All upcoming events" },
      {
        id: "events.empty.title",
        label: "No results — headline",
        value: "Nothing scheduled in that combination",
      },
      {
        id: "events.empty.text",
        locked: true,
        label: "No results — text",
        value: "Try another category or branch — or tell us what you'd like to see.",
      },
      { id: "events.news.eyebrow", label: "Newsletter — eyebrow", value: "Never miss a thing" },
      { id: "events.news.title", label: "Newsletter — headline", value: "Get the calendar in your inbox" },
      {
        id: "events.news.lede",
        locked: true,
        label: "Newsletter — paragraph",
        value: "One email each Monday with the week's gatherings, prayer points and serving rotas.",
      },
      {
        id: "events.submit",
        locked: true,
        label: "Submit-an-event notice",
        value:
          "Hosting something for the church family? [Submit your event](mailto:{{email}}?subject=Event%20submission) at least three weeks ahead so we can publish it here and on the app.",
      },
    ],
  },

  /* ----------------------------------------------------------------- giving */
  {
    id: "giving",
    label: "Giving page",
    blurb: "The giving wizard, the allocation card, transfer notes and giving FAQs.",
    entries: [
      { id: "giving.head.eyebrow", label: "Page — eyebrow", value: "Giving" },
      { id: "giving.head.title", label: "Page — headline", value: "Give with *joy*, not pressure" },
      {
        id: "giving.head.lede",
        locked: true,
        label: "Page — paragraph",
        value:
          "Your tithes and offerings keep the lights on, the pantry stocked, the missionaries sent and the gospel preached.",
      },
      { id: "giving.step1", label: "Wizard — step 1 heading", value: "Step 1 — choose an amount" },
      { id: "giving.step2", label: "Wizard — step 2 heading", value: "Step 2 — choose a fund" },
      { id: "giving.step3", label: "Wizard — step 3 heading", value: "Step 3 — how would you like to give?" },
      { id: "giving.alloc.title", label: "Allocation — heading", value: "Where every $100 goes" },
      {
        id: "giving.alloc.note",
        locked: true,
        label: "Allocation — note",
        value: "Independently audited figures from our most recent financial year.",
      },
      { id: "giving.bank.title", label: "Bank transfer — heading", value: "Bank transfer details" },
      {
        id: "giving.bank.note",
        locked: true,
        label: "Bank transfer — note",
        value: "Put your name and the fund in the payment narration where possible.",
      },
      { id: "giving.verse.title", label: "Generosity verse — heading", value: "On generosity" },
      {
        id: "giving.verse.text",
        locked: true,
        label: "Generosity verse — text",
        value: "“Bring ye all the tithes into the storehouse… and prove me now herewith, saith the LORD of hosts.”",
      },
      { id: "giving.verse.ref", label: "Generosity verse — reference", value: "Malachi 3:10" },
      { id: "giving.help.title", label: "Need help — heading", value: "Need help?" },
      {
        id: "giving.help.text",
        locked: true,
        label: "Need help — text",
        value: "The finance team answers giving questions Monday to Friday.",
      },
      { id: "giving.faq.eyebrow", label: "FAQs — eyebrow", value: "Stewardship" },
      { id: "giving.faq.title", label: "FAQs — headline", value: "Questions about giving" },
      {
        id: "giving.faq.text",
        locked: true,
        label: "FAQs — paragraph",
        value:
          "Money is the most private part of anyone's life, so we would rather answer everything up front than leave you guessing. If your question is not here, ask us — a real person replies.",
      },
      { id: "giving.faq.still.title", label: "Still unsure — heading", value: "Still unsure?" },
      {
        id: "giving.faq.still.text",
        locked: true,
        label: "Still unsure — text",
        value: "The finance team answers questions like these every week. Nothing is too small to ask.",
      },
      { id: "giving.thanks", label: "Closing headline", value: "Thank you for building this house with us" },
      {
        id: "giving.thanks.text",
        locked: true,
        label: "Closing paragraph",
        value:
          "Because of your generosity last year we fed 41,000 meals, funded 19 church planters, sent 6 short-term teams and kept the doors open seven days a week in seven cities. Yours is the hand behind every one of those stories.",
      },
    ],
  },

  /* ----------------------------------------------------------------- prayer */
  {
    id: "prayer",
    label: "Prayer page",
    blurb: "The prayer request page, the wall and the side cards.",
    entries: [
      { id: "prayer.head.eyebrow", label: "Page — eyebrow", value: "Prayer request" },
      { id: "prayer.head.title", label: "Page — headline", value: "Let us carry it *with* you" },
      {
        id: "prayer.head.lede",
        locked: true,
        label: "Page — paragraph",
        value:
          "Our intercessors pray over every request submitted here — usually within 24 hours, and always without judgement. Nothing is too small, too strange or too late for God.",
      },
      { id: "prayer.side.focus.title", label: "Prayer focus — heading", value: "Today's prayer focus" },
      { id: "prayer.side.how.title", label: "How we pray — heading", value: "How we pray for you" },
      { id: "prayer.side.how.1", locked: true, label: "How we pray — point 1", value: "**Within 24 hours** — a named intercessor prays your request." },
      { id: "prayer.side.how.2", locked: true, label: "How we pray — point 2", value: "**In the prayer meeting** — every Friday, anonymously." },
      { id: "prayer.side.how.3", locked: true, label: "How we pray — point 3", value: "**Confidentially** — requests are seen only by the prayer team." },
      { id: "prayer.side.how.4", locked: true, label: "How we pray — point 4", value: "**Follow-up** if you ask us to, by a pastor of your own gender where possible." },
      { id: "prayer.side.gather.title", label: "Gatherings — heading", value: "Prayer gatherings" },
      { id: "prayer.side.gather.action", label: "Gatherings — button", value: "Join the prayer stream" },
      { id: "prayer.side.urgent.title", label: "Crisis card — heading", value: "In crisis right now?" },
      {
        id: "prayer.side.urgent.text",
        locked: true,
        label: "Crisis card — text",
        value: "Please don't wait on a form. Call the church office on [{{phone}}](tel:{{phoneDigits}}) or WhatsApp our 24-hour prayer line.",
      },
      { id: "prayer.side.urgent.action", label: "Crisis card — button", value: "WhatsApp the prayer line" },
      { id: "prayer.mine.note", locked: true, label: "My requests — note", value: "Requests you send are kept privately on this device so you can mark them answered and watch God move." },
      { id: "prayer.wall.empty.title", label: "Empty wall — headline", value: "No requests in this category yet" },
      {
        id: "prayer.wall.empty.text",
        locked: true,
        label: "Empty wall — text",
        value: "Add the first one — it takes twenty seconds and it invites a hundred prayers.",
      },
      { id: "prayer.scriptures.eyebrow", label: "Scriptures — eyebrow", value: "Scriptures to stand on" },
      { id: "prayer.scriptures.title", label: "Scriptures — headline", value: "Pray the Word back to God" },
      {
        id: "prayer.scriptures.lede",
        locked: true,
        label: "Scriptures — paragraph",
        value: "Praying Scripture is praying God's own will. Here are verses our prayer team prays most often.",
      },
      { id: "prayer.intercessors.title", label: "Intercessors — heading", value: "Join the intercessors" },
      {
        id: "prayer.intercessors.text",
        locked: true,
        label: "Intercessors — text",
        value: "Two hours a month, one WhatsApp group, and a front-row seat to what God is doing in this house.",
      },
      { id: "prayer.learn.title", label: "Learn to pray — heading", value: "Learn to pray" },
      {
        id: "prayer.learn.text",
        locked: true,
        label: "Learn to pray — text",
        value: "Our ten-week School of Prayer runs every quarter, in person and online, with practical assignments.",
      },
      { id: "prayer.answered.title", label: "Answered prayer — heading", value: "Answered prayer?" },
      {
        id: "prayer.answered.text",
        locked: true,
        label: "Answered prayer — text",
        value: "Nothing strengthens the family like a report of what God has done. Turn your prayer into a testimony.",
      },
      {
        id: "prayer.wall.note",
        locked: true,
        label: "Prayer wall form — note",
        value: "A short request the whole family can see and pray over. Keep it general — no surnames, addresses or medical records.",
      },
      { id: "prayer.sent.title", label: "Request sent — headline", value: "We are praying for you" },
      {
        id: "prayer.sent.text",
        locked: true,
        label: "Request sent — text",
        value:
          "Your request was received and saved on this device. To reach our prayer team immediately, use one of the options below — it takes one tap.",
      },
    ],
  },

  /* ------------------------------------------------------------- testimonies */
  {
    id: "testimonies",
    label: "Testimonies page",
    blurb: "The testimony wall, its filters and the share-your-story modal.",
    entries: [
      { id: "testimonies.head.eyebrow", label: "Page — eyebrow", value: "Testimonies" },
      { id: "testimonies.head.title", label: "Page — headline", value: "Stories that make *heaven* applause" },
      {
        id: "testimonies.head.lede",
        locked: true,
        label: "Page — paragraph",
        value:
          "{{count}} testimonies from this family so far, and {{amens}} amens between them. Your story is not just for you — it is the weapon somebody else needs.",
      },
      { id: "testimonies.stat1.label", label: "Card 1 — label", value: "testimonies shared" },
      {
        id: "testimonies.stat1.text",
        locked: true,
        label: "Card 1 — text",
        value: "Every one read and prayed over by our pastoral team before publishing.",
      },
      { id: "testimonies.stat2.label", label: "Card 2 — label", value: "amens from the family" },
      {
        id: "testimonies.stat2.text",
        locked: true,
        label: "Card 2 — text",
        value: "Tap “Amen” on a story to tell that brother or sister you are rejoicing with them.",
      },
      { id: "testimonies.stat3.label", label: "Card 3 — label", value: "kinds of grace" },
      {
        id: "testimonies.stat3.text",
        locked: true,
        label: "Card 3 — text",
        value: "Salvation, healing, provision, family, deliverance and God in the ordinary.",
      },
      { id: "testimonies.wall.eyebrow", label: "Wall — eyebrow", value: "The testimony wall" },
      { id: "testimonies.wall.title", label: "Wall — headline", value: "Read, rejoice, repeat" },
      {
        id: "testimonies.wall.lede",
        locked: true,
        label: "Wall — paragraph",
        value:
          "Filter by what God did, or search for the situation you are walking through right now — somebody here has almost certainly been where you are.",
      },
      { id: "testimonies.empty.title", label: "Empty — headline", value: "No testimonies here yet" },
      {
        id: "testimonies.empty.text",
        locked: true,
        label: "Empty — text",
        value: "Be the first to share in this category — someone is waiting to read it.",
      },
      { id: "testimonies.mine.title", label: "Your submissions — heading", value: "Your submissions" },
      { id: "testimonies.mine.note", label: "Your submissions — note", locked: true, value: "Saved on this device. Our team publishes them once reviewed." },
      { id: "testimonies.share.eyebrow", label: "Share — eyebrow", value: "Your turn" },
      { id: "testimonies.share.title", label: "Share — headline", value: "Someone needs to hear your story" },
      {
        id: "testimonies.share.lede",
        locked: true,
        label: "Share — paragraph",
        value: "It does not have to be dramatic or polished. Just tell the truth about what God did.",
      },
      { id: "testimonies.ways.title", label: "Three ways — heading", value: "Three ways to share" },
      {
        id: "testimonies.privacy",
        locked: true,
        label: "Privacy notice",
        value: "Testimonies are stored on your device until you choose to email them to us. Nothing is published automatically.",
      },
      { id: "testimonies.modal.title", label: "Share modal — heading", value: "Share your testimony" },
    ],
  },

  /* ------------------------------------------------------------------ visit */
  {
    id: "visit",
    label: "Plan a visit page",
    blurb: "The visit wizard, what-to-expect cards and first-timer questions.",
    entries: [
      { id: "visit.head.eyebrow", label: "Page — eyebrow", value: "Plan your visit" },
      { id: "visit.head.title", label: "Page — headline", value: "Come as you are — *we'll keep a seat*" },
      {
        id: "visit.head.lede",
        locked: true,
        label: "Page — paragraph",
        value:
          "Tell us a little about your visit and we will have someone waiting for you at the door with your name. No obligation, no follow-up spam, just a warm welcome.",
      },
      { id: "visit.head.action1", label: "Page — button 1", value: "See all branches" },
      { id: "visit.head.action2", label: "Page — button 2", value: "Watch a service first" },
      { id: "visit.step1", label: "Wizard step 1 — heading", value: "Which branch will you be visiting?" },
      {
        id: "visit.step1.note",
        locked: true,
        label: "Wizard step 1 — note",
        value: "Not sure yet? Pick the one closest to you — you can change it later.",
      },
      { id: "visit.step2", label: "Wizard step 2 — heading", value: "Which service suits you best?" },
      {
        id: "visit.step2.note",
        locked: true,
        label: "Wizard step 2 — note",
        value: "Times are shown in your own time zone, wherever you are. We recommend arriving 15 minutes early.",
      },
      { id: "visit.step3", label: "Wizard step 3 — heading", value: "Who is coming with you?" },
      { id: "visit.pass.title", label: "Visit pass — headline", value: "{{name}}, you're expected." },
      {
        id: "visit.pass.lede",
        locked: true,
        label: "Visit pass — paragraph",
        value:
          "Our welcome team at {{city}} has been told you're coming. Show this pass at the welcome desk and someone will take you to your seat.",
      },
      {
        id: "visit.privacy",
        locked: true,
        label: "Privacy notice",
        value: "Your visit plan is saved on this device only. Nothing is sent to us unless you tap “Tell the welcome team”.",
      },
      { id: "visit.expect.eyebrow", label: "What to expect — eyebrow", value: "What to expect" },
      { id: "visit.expect.title", label: "What to expect — headline", value: "Your first Sunday, step by step" },
      { id: "visit.faq.eyebrow", label: "First-timer questions — eyebrow", value: "Still wondering?" },
      { id: "visit.faq.title", label: "First-timer questions — headline", value: "First-timer questions" },
      { id: "visit.faq.action", label: "First-timer questions — button", value: "Ask us anything else" },
    ],
  },

  /* ---------------------------------------------------------------- contact */
  {
    id: "contact",
    label: "Contact page",
    blurb: "Contact cards, the message form, the map card and the department table.",
    entries: [
      { id: "contact.head.eyebrow", label: "Page — eyebrow", value: "Contact" },
      { id: "contact.head.title", label: "Page — headline", value: "Talk to a *real person*" },
      {
        id: "contact.head.lede",
        locked: true,
        label: "Page — paragraph",
        value:
          "No chatbots, no ticket numbers. Whatever you need — prayer, direction, a receipt, a listening ear — someone on this team will answer you.",
      },
      { id: "contact.head.action1", label: "Page — button 1", value: "WhatsApp us" },
      { id: "contact.head.action2", label: "Page — button 2", value: "Prayer request" },
      { id: "contact.card1.title", label: "Call card — heading", value: "Call the office" },
      { id: "contact.card1.note", label: "Call card — note", value: "Monday to Friday, 9:00 AM – 5:00 PM, {{zone}} time" },
      { id: "contact.card2.title", label: "Email card — heading", value: "Email us" },
      { id: "contact.card2.note", locked: true, label: "Email card — note", value: "We reply to every email within one working day." },
      { id: "contact.card3.title", label: "Visit card — heading", value: "Visit the Cathedral" },
      { id: "contact.card4.title", label: "WhatsApp card — heading", value: "WhatsApp prayer line" },
      { id: "contact.card4.note", locked: true, label: "WhatsApp card — note", value: "Monitored daily, including Sundays until midnight." },
      { id: "contact.form.eyebrow", label: "Form — eyebrow", value: "Send a message" },
      { id: "contact.form.title", label: "Form — headline", value: "Tell us how we can help" },
      {
        id: "contact.form.lede",
        locked: true,
        label: "Form — paragraph",
        value: "Pick a topic and your message goes straight to the right desk — no triage, no waiting.",
      },
      { id: "contact.sent.title", label: "Message sent — heading", value: "Your message is on its way" },
      {
        id: "contact.privacy",
        locked: true,
        label: "Form — privacy note",
        value: "Your message opens in your own email app — we never receive it without you sending it, and we never share it.",
      },
      { id: "contact.side1.title", label: "Map card — heading", value: "Where to find us" },
      { id: "contact.side2.title", label: "Socials card — heading", value: "Follow the family" },
      { id: "contact.side3.title", label: "Emergency card — heading", value: "Emergency pastoral care" },
      {
        id: "contact.side3.text",
        locked: true,
        label: "Emergency card — text",
        value: "Hospital admission, bereavement or a pastoral emergency outside office hours? Call the on-call line — a pastor answers.",
      },
      { id: "contact.side3.action", label: "Emergency card — button", value: "Call the on-call pastor" },
      { id: "contact.depts.eyebrow", label: "Departments — eyebrow", value: "Departments" },
      { id: "contact.depts.title", label: "Departments — headline", value: "Every desk, in one place" },
      { id: "contact.faq.eyebrow", label: "FAQs — eyebrow", value: "Before you write" },
      { id: "contact.faq.title", label: "FAQs — headline", value: "Answers to the most common questions" },
      { id: "contact.faq.action", label: "FAQs — button", value: "Not answered? Plan your visit and ask us in person" },
    ],
  },

  /* -------------------------------------------------------------- locations */
  {
    id: "locations",
    label: "Locations page",
    blurb: "The branch finder — grouped by country, with sub-branches under their country — the branch detail panel and the small-group cards.",
    entries: [
      { id: "locations.head.eyebrow", label: "Page — eyebrow", value: "Locate our family" },
      { id: "locations.head.title", label: "Page — headline", value: "Find your *branch*" },
      {
        id: "locations.head.lede",
        locked: true,
        label: "Page — paragraph",
        value:
          "Seven branches across Nigeria, America and Canada — one family, one Word, one Spirit. Pick the one nearest you, save it as your branch, and we will keep you posted on everything happening there.",
      },
      { id: "locations.head.action1", label: "Page — button 1", value: "Use my location" },
      { id: "locations.head.action2", label: "Page — button 2", value: "Plan your first visit" },
      { id: "locations.search", label: "Search placeholder", value: "Search by city, country, pastor or language…" },
      { id: "locations.geo.badge", label: "Distance badge", value: "Sorted by distance from you" },
      {
        id: "locations.geo.denied",
        locked: true,
        label: "Location refused — notice",
        value:
          "We could not access your location. You can still search by city, or tap “Get directions” on any branch and your maps app will route you there.",
      },
      {
        id: "locations.noMatch",
        locked: true,
        label: "No match — notice",
        value:
          "No branch matches that search. Try a nearby city — or [tell us where you are](/contact) and we will let you know when a branch or small group starts near you.",
      },
      { id: "locations.detail.eyebrow", label: "Branch detail — eyebrow", value: "Branch detail" },
      { id: "locations.detail.setBranch", label: "Branch detail — button off", value: "Set as my branch" },
      { id: "locations.detail.isBranch", label: "Branch detail — button on", value: "This is your branch" },
      { id: "locations.times.title", label: "Weekly rhythm — heading", value: "Weekly rhythm" },
      { id: "locations.at.title", label: "At this branch — heading", value: "At this branch" },
      { id: "locations.lang.title", label: "Languages — heading", value: "Languages spoken" },
      { id: "locations.groups.eyebrow", label: "Small groups — eyebrow", value: "More than a building" },
      { id: "locations.groups.title", label: "Small groups — headline", value: "Small groups meet in homes near you" },
      {
        id: "locations.groups.lede",
        locked: true,
        label: "Small groups — paragraph",
        value:
          "Every branch runs midweek small groups across the city — living rooms, offices and student halls. Tell us where you are and we will connect you to the nearest one.",
      },
      { id: "locations.card1.title", label: "City groups — heading", value: "City groups" },
      {
        id: "locations.card1.text",
        locked: true,
        label: "City groups — text",
        value: "Groups of 8–14 meeting weekly for Bible study, prayer and food.",
      },
      { id: "locations.card2.title", label: "Bible school — heading", value: "Bible school" },
      {
        id: "locations.card2.text",
        locked: true,
        label: "Bible school — text",
        value: "Ten-week foundations course at every branch, in person and online.",
      },
      { id: "locations.card3.title", label: "Start a branch — heading", value: "Start a branch" },
      {
        id: "locations.card3.text",
        locked: true,
        label: "Start a branch — text",
        value: "Burdened for your city? We plant, train and support new branches every year.",
      },
      { id: "locations.card3.action", label: "Start a branch — button", value: "Talk to us" },
    ],
  },

  /* ------------------------------------------------------------- ministries */
  {
    id: "ministries",
    label: "Ministries page",
    blurb: "The serving teams table, the volunteer form and safeguarding notes.",
    entries: [
      { id: "ministries.head.eyebrow", label: "Page — eyebrow", value: "Ministries" },
      { id: "ministries.head.title", label: "Page — headline", value: "You were not saved to *sit*" },
      {
        id: "ministries.head.lede",
        locked: true,
        label: "Page — paragraph",
        value:
          "Every member is a minister. Whatever your gift — teaching, cooking, singing, spreadsheets, driving, praying — there is a place in this house where it is needed and where it will grow.",
      },
      { id: "ministries.list.eyebrow", label: "Ministries — eyebrow", value: "Where you belong" },
      { id: "ministries.list.title", label: "Ministries — headline", value: "Nine ministries, one family" },
      {
        id: "ministries.list.lede",
        locked: true,
        label: "Ministries — paragraph",
        value: "Each ministry meets weekly, is led by a trained leader and is open to every branch and every age.",
      },
      { id: "ministries.teams.eyebrow", label: "Serving teams — eyebrow", value: "Serve on a team" },
      { id: "ministries.teams.title", label: "Serving teams — headline", value: "Serving rotas" },
      {
        id: "ministries.teams.lede",
        locked: true,
        label: "Serving teams — paragraph",
        value: "Most serving roles ask for one Sunday a month. That's twelve Sundays a year — and a lifetime of friendships.",
      },
      { id: "ministries.form.eyebrow", label: "Volunteer — eyebrow", value: "Volunteer" },
      { id: "ministries.form.title", label: "Volunteer — headline", value: "Tell us how you'd love to serve" },
      {
        id: "ministries.form.lede",
        locked: true,
        label: "Volunteer — paragraph",
        value: "We will connect you with the team leader for your branch within a week. No experience required for most roles — we train everyone.",
      },
      { id: "ministries.fit.title", label: "Not sure — heading", value: "Not sure where you fit?" },
      {
        id: "ministries.fit.text",
        locked: true,
        label: "Not sure — text",
        value:
          "Take the Next Steps class and we will help you find the gift God put in you — then put you beside someone who is already doing it well.",
      },
      { id: "ministries.fit.action", label: "Not sure — button", value: "Next Steps dates" },
      { id: "ministries.why.title", label: "Why we serve — heading", value: "Why we serve" },
      { id: "ministries.safeguard.title", label: "Safeguarding — heading", value: "Safeguarding" },
      {
        id: "ministries.safeguard.text",
        locked: true,
        label: "Safeguarding — text",
        value:
          "Everyone serving with children or vulnerable adults completes a background check, safeguarding training and a two-year probation period. Policies are available from the church office.",
      },
      { id: "ministries.safeguard.badge", label: "Safeguarding — badge", value: "Fully compliant" },
      { id: "ministries.faq.eyebrow", label: "FAQs — eyebrow", value: "Questions" },
      { id: "ministries.faq.title", label: "FAQs — headline", value: "Serving FAQs" },
    ],
  },

  /* ------------------------------------------------------------- devotional */
  {
    id: "devotional",
    label: "Devotional page",
    blurb: "The daily reading, memory verses and the email sign-up.",
    entries: [
      { id: "devotional.head.eyebrow", label: "Page — eyebrow", value: "Daily devotional" },
      { id: "devotional.head.title", label: "Page — headline", value: "Feed your *faith* every morning" },
      {
        id: "devotional.head.lede",
        locked: true,
        label: "Page — paragraph",
        value:
          "A verse, a reading plan and something to write down. Ten minutes with God before the noise starts changes the whole day.",
      },
      { id: "devotional.read.title", label: "Reading plan — heading", value: "7-day reading plan" },
      {
        id: "devotional.read.note",
        locked: true,
        label: "Reading — note",
        value: "“Overcoming the world” — one chapter a day for a week.",
      },
      {
        id: "devotional.reflect.text",
        locked: true,
        label: "Reflection — prompt",
        value: "Read it twice. Then ask: what does this tell me about God, and what is He asking me to do today?",
      },
      { id: "devotional.reflect.title", label: "Reflection — heading", value: "Today's reflection" },
      { id: "devotional.reflect.note", label: "Reflection — note", value: "Your words stay on this device." },
      { id: "devotional.memory.title", label: "Memory verses — heading", value: "Hide these in your heart" },
      {
        id: "devotional.memory.note",
        locked: true,
        label: "Memory verses — note",
        value: "Six verses every overcomer should know by heart. Tap “Memorised” when you can quote it without looking.",
      },
      { id: "devotional.focus.title", label: "Prayer focus — heading", value: "Prayer focus" },
      { id: "devotional.streak.title", label: "Streak — heading", value: "Keep the streak" },
      {
        id: "devotional.streak.text",
        locked: true,
        label: "Streak — text",
        value: "Consistency beats intensity — ten minutes a day, every day.",
      },
      { id: "devotional.deeper.title", label: "Go deeper — heading", value: "Go deeper" },
      { id: "devotional.mail.eyebrow", label: "Email sign-up — eyebrow", value: "Want this by email?" },
      { id: "devotional.mail.title", label: "Email sign-up — headline", value: "The Monday devotional" },
      {
        id: "devotional.mail.lede",
        locked: true,
        label: "Email sign-up — paragraph",
        value: "A short word from {{church}}, the week's prayer points and the reading plan — every Monday morning.",
      },
    ],
  },

  /* --------------------------------------------------------------- library */
  {
    id: "library",
    label: "My library page",
    blurb: "The personal library page and its empty states.",
    entries: [
      { id: "library.head.eyebrow", label: "Page — eyebrow", value: "My library" },
      { id: "library.head.title", label: "Page — headline", value: "Your *own* corner of the house" },
      {
        id: "library.head.lede",
        locked: true,
        label: "Page — paragraph",
        value:
          "Sermons you saved, notes you took, prayers you are tracking and the reading plan you are working through — all kept privately on this device.",
      },
      { id: "library.saved.empty", locked: true, label: "No saved sermons — text", value: "Tap the bookmark icon on any sermon to keep it here for later." },
      { id: "library.stats.serviceNotes", label: "Service notes — stat card", value: "service notes" },
      { id: "library.notes.empty", locked: true, label: "No notes — text", value: "Open any sermon and write what God is saying to you — it saves automatically." },
      { id: "library.privacy", locked: true, label: "Privacy notice", value: "Everything on this page is stored in this browser only — no account, no server, no tracking. Clearing your browser data or tapping “Clear my data” will permanently remove it." },
      { id: "library.clear.title", label: "Clear data — heading", value: "Clear all your local data?" },
      {
        id: "library.clear.text",
        locked: true,
        label: "Clear data — text",
        value:
          "This removes your saved sermons, notes, prayer requests, testimonies, giving record, reading plan and visit plan from this device. It cannot be undone.",
      },
    ],
  },

  /* ------------------------------------------------------------ site-wide */
  {
    id: "site",
    label: "Site-wide text",
    blurb: "The wording that is not tied to one page.",
    entries: [
      { id: "site.notFound.title", label: "404 — headline", value: "This page has gone to glory" },
      {
        id: "site.notFound.lede",
        locked: true,
        label: "404 — paragraph",
        value: "The link you followed does not exist — but you are still welcome here. Let us point you somewhere useful.",
      },
      {
        id: "site.notFound.asked",
        label: "404 — the address that was asked for",
        value: "You asked for {{path}}",
      },
      { id: "site.notFound.search", label: "404 — search button", value: "Search the whole site" },
      {
        id: "site.appsTip",
        locked: true,
        label: "Add-to-home-screen tip",
        value: "Add this page to your home screen for the daily verse and sermon notifications.",
      },
      { id: "site.videoEmpty", label: "Video not set — text", value: "Video coming soon" },
      { id: "site.noResults", label: "Nothing found — headline", value: "Nothing matches that search" },
      { id: "site.tabTitle", label: "Browser tab title", value: "{{church}} — Where Champions Are Raised in Christ" },

      /* The menu across the top and the footer at the bottom. The words live
         here; src/data/site.ts holds only these keys (see NAV / FOOTER_LINKS). */
      { id: "site.nav.home", label: "Menu — Home", value: "Home" },
      { id: "site.nav.home.desc", label: "Menu — Home (search hint)", value: "Welcome home" },
      { id: "site.nav.about", label: "Menu — About", value: "About" },
      { id: "site.nav.about.desc", label: "Menu — About (search hint)", value: "Our story, beliefs and leadership" },
      { id: "site.nav.locations", label: "Menu — Locations", value: "Locations" },
      { id: "site.nav.locations.desc", label: "Menu — Locations (search hint)", value: "Find a branch near you and get directions" },
      { id: "site.nav.sermons", label: "Menu — Sermons", value: "Sermons" },
      { id: "site.nav.sermons.desc", label: "Menu — Sermons (search hint)", value: "Watch and listen to the Word" },
      { id: "site.nav.events", label: "Menu — Events", value: "Events" },
      { id: "site.nav.events.desc", label: "Menu — Events (search hint)", value: "What's happening next" },
      { id: "site.nav.testimonies", label: "Menu — Testimonies", value: "Testimonies" },
      { id: "site.nav.testimonies.desc", label: "Menu — Testimonies (search hint)", value: "Stories of God's faithfulness" },
      { id: "site.nav.giving", label: "Menu — Giving", value: "Giving" },
      { id: "site.nav.giving.desc", label: "Menu — Giving (search hint)", value: "Give cheerfully and securely" },
      { id: "site.nav.contact", label: "Menu — Contact", value: "Contact" },
      { id: "site.nav.contact.desc", label: "Menu — Contact (search hint)", value: "Talk to a member of our team" },

      { id: "site.footer.worship.title", label: "Footer — column 1 heading", value: "Worship with us" },
      { id: "site.footer.worship.visit", label: "Footer — Plan your visit", value: "Plan your visit" },
      { id: "site.footer.worship.locations", label: "Footer — Find a branch near you", value: "Find a branch near you" },
      { id: "site.footer.worship.sermons", label: "Footer — Watch sermons", value: "Watch sermons" },
      { id: "site.footer.worship.live", label: "Footer — Watch live", value: "Watch live" },
      { id: "site.footer.worship.devotional", label: "Footer — Daily devotional", value: "Daily devotional" },

      { id: "site.footer.family.title", label: "Footer — column 2 heading", value: "Family life" },
      { id: "site.footer.family.ministries", label: "Footer — Ministries", value: "Ministries" },
      { id: "site.footer.family.events", label: "Footer — Events calendar", value: "Events calendar" },
      { id: "site.footer.family.testimonies", label: "Footer — Testimonies", value: "Testimonies" },
      { id: "site.footer.family.prayer", label: "Footer — Prayer request", value: "Prayer request" },
      { id: "site.footer.family.library", label: "Footer — My library", value: "My library" },

      { id: "site.footer.partner.title", label: "Footer — column 3 heading", value: "Partner with us" },
      { id: "site.footer.partner.donate", label: "Footer — Donate online", value: "Donate online" },
      { id: "site.footer.partner.missions", label: "Footer — Missions & outreach", value: "Missions & outreach" },
      { id: "site.footer.partner.volunteer", label: "Footer — Volunteer", value: "Volunteer" },
      { id: "site.footer.partner.testimony", label: "Footer — Share a testimony", value: "Share a testimony" },
      { id: "site.footer.partner.contact", label: "Footer — Contact us", value: "Contact us" },

      /* Little messages that pop up from the shared helpers (src/lib/store.ts,
         src/lib/hooks.ts) when something is copied, downloaded or cannot be
         saved. {{name}} is filled in by the page. */
      { id: "site.toastCopied", label: "Message — copied to clipboard", value: "Copied to clipboard" },
      { id: "site.toastLinkCopied", label: "Message — link copied", value: "Link copied" },
      { id: "site.toastDownloaded", label: "Message — file downloaded", value: "Downloaded {{name}}" },
      { id: "site.toastDownloadBlocked", label: "Message — download blocked", value: "Your browser blocked that download." },
      { id: "site.toastClipboardFailed", locked: true, label: "Message — copy failed", value: "Couldn't access the clipboard — please copy manually." },
      { id: "site.toastStorageFull", locked: true, label: "Message — storage is full", value: "Your device's storage is full — that change could not be saved." },
    ],
  },
];

/* The small words recovered from the components by src/tools/auto-copy.mjs —
   labels, placeholders, tooltips, button captions. They live in the same page
   groups, so the office edits, previews and publishes them exactly like the
   hand-written text above. */
export const COPY_PAGES: CopyPage[] = HAND_PAGES.map((page) => {
  const extra = AUTO_ENTRIES[page.id];
  return extra && extra.length ? { ...page, entries: [...page.entries, ...extra] } : page;
});

/* ------------------------------------------------------------------ roles */

/** Button captions, page and section titles: shown but not reworded. */
const BUTTON_LABEL = /\b(button|cta)\b/i;

function inferRole(entry: CopyEntry): CopyRole | undefined {
  if (entry.role) return entry.role;
  if (entry.id.startsWith("auto.")) return undefined;
  if (/\.head\.(eyebrow|title)$/.test(entry.id)) return "pageTitle";
  if (BUTTON_LABEL.test(entry.label)) return "button";
  if (/\.(title|eyebrow)$/.test(entry.id)) return "sectionTitle";
  return undefined;
}

const ROLES: Record<string, CopyRole> = {};
for (const page of COPY_PAGES) {
  for (const entry of page.entries) {
    const role = inferRole(entry);
    if (role) {
      ROLES[entry.id] = role;
      /* Write it back, so the segment view can show it per line. */
      entry.role = role;
    }
  }
}

/** What kind of furniture this line is, if it is furniture at all. */
export function copyRoleOf(id: string): CopyRole | undefined {
  return ROLES[id];
}

/* A line marked `locked` is furniture too, but the editor never lists it: it is
   the church's own fixed wording (see `home.hero.lede`). The guard below treats
   it exactly like a button caption — no stored wording can replace it. */

/* Recovered small words locked here — autocopy.ts is generated (note 64). */
const LOCKED_AUTO = new Set<string>([
  "auto.home.caff7790d4063599",
  "auto.home.7af560c8a7a14349",
  "auto.home.f8b81a4278b923bb",
  "auto.home.8ded8fa080b51139",
  "auto.home.d2448217aa4f6a76",
  "auto.home.a75c1e7b9034d2aa",
  "auto.home.c009d7385019ed69",
  "auto.home.ceb9f331317dcd00",
  "auto.home.0926a1c3960c88d2",
  "auto.home.d0a3a00cf7452d25",
  "auto.home.b97672eba3f40f12",
  "auto.home.73a8166fb6a12bc6",
  "auto.home.0ff58e93c1bc7492",
  "auto.home.fbd5dd4bffee1afa",
  "auto.home.2617b23455be3e8d",
]);

const LOCKED = new Set<string>();
for (const page of COPY_PAGES) {
  for (const entry of page.entries) if (entry.locked || LOCKED_AUTO.has(entry.id)) LOCKED.add(entry.id);
}

/** True when the line is deliberately kept out of the editor's lists. */
export function copyIsLocked(id: string): boolean {
  return LOCKED.has(id);
}

/** True when the line is a button caption, a page title, a section title — or
    one of the locked lines, which the office never sees at all. */
export function copyIsFixed(id: string): boolean {
  return !!ROLES[id] || LOCKED.has(id);
}

/** How the editor describes a fixed line to the office. */
export const COPY_ROLE_LABELS: Record<CopyRole, string> = {
  button: "Button caption",
  pageTitle: "Page title",
  sectionTitle: "Section title",
};

/* --------------------------------------------------------------- segments */

/** The words that identify a line's own kind, so a segment can be named. */
const KINDS = /\s*(headline|paragraph|heading|eyebrow|label|placeholder|link|caption|badge|action|tooltip|hint|button\s*\d*|cta\s*\d*)\s*$/i;

/** Which segment of the page a copy line belongs to. */
function segmentKeyOf(entry: CopyEntry): string {
  if (entry.id.startsWith("auto.")) return "auto";
  const parts = entry.id.split(".");
  return (parts.length >= 3 ? parts.slice(0, 2) : parts.slice(0, 1)).join(".");
}

function segmentNameOf(key: string, first: CopyEntry): string {
  if (key === "auto") return "Buttons, labels & small words";
  const head = first.label.split(/\u2014|\u2013|-{2}/)[0];
  const name = head.replace(KINDS, "").replace(/\s*\d+\s*$/, "").trim();
  return name || key;
}

/** A page's lines, grouped as the visitor meets them. */
export function copySegmentsOf(pageId: string): CopySegment[] {
  const page = COPY_PAGES.find((p) => p.id === pageId);
  if (!page) return [];
  const map = new Map<string, CopySegment>();
  for (const entry of page.entries) {
    const key = segmentKeyOf(entry);
    let segment = map.get(key);
    if (!segment) {
      segment = { key, label: "", entries: [] };
      map.set(key, segment);
    }
    segment.entries.push(entry);
  }
  const segments = [...map.values()];
  for (const segment of segments) segment.label = segmentNameOf(segment.key, segment.entries[0]);
  return segments;
}

/* ------------------------------------------------------------------ lookup */

const DEFAULTS: Record<string, string> = {};
const LABELS: Record<string, string> = {};
const PAGE_OF: Record<string, string> = {};
for (const page of COPY_PAGES) {
  for (const entry of page.entries) {
    DEFAULTS[entry.id] = entry.value;
    LABELS[entry.id] = entry.label;
    PAGE_OF[entry.id] = page.id;
  }
}

let overrides: Record<string, string> = {};

function interpolate(value: string, vars?: Record<string, string | number>): string {
  if (!vars) return value;
  return value.replace(/\{\{(\w+)\}\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : match
  );
}

/** Current text for a copy key (admin override, else the shipped default). */
export function ct(id: string, vars?: Record<string, string | number>): string {
  const value = Object.prototype.hasOwnProperty.call(overrides, id) ? overrides[id] : DEFAULTS[id];
  if (value === undefined) return "";
  /* A visitor reading in another language gets the translated line when one
     has landed; English (or not-yet-translated) reads as before. */
  const t = translatedText(id, value);
  return interpolate(t ?? value, vars);
}

/** The section the office edits this line in, e.g. "copy-home". */
export function copySectionOf(id: string): string {
  const page = PAGE_OF[id];
  return page ? "copy-" + page : "";
}

/** Every current [id, resolved text] pair — what the translator travels with. */
export function allCopySources(): [string, string][] {
  return Object.keys(DEFAULTS).map((id) => [
    id,
    Object.prototype.hasOwnProperty.call(overrides, id) ? overrides[id] : DEFAULTS[id],
  ]);
}

/** The shipped wording, for the editor's "put the original back" button. */
export function copyDefault(id: string): string {
  return Object.prototype.hasOwnProperty.call(DEFAULTS, id) ? DEFAULTS[id] : "";
}

/** True when a line is prose: shown first, in a tall box. Decided by shipped wording. */
export function copyIsParagraph(id: string): boolean {
  const shipped = copyDefault(id);
  if (shipped.indexOf("\n") !== -1) return true;
  if (shipped.length >= 80) return true;
  return shipped.length >= 40 && /[.!?](\s|$)/.test(shipped);
}

/** How many lines a prose line needs, so its box shows the whole sentence. */
export function copyLineRows(id: string): number {
  /* The drawer's boxes are ~45 characters wide, so a sentence needs about one
     line per 48 characters — and never fewer than three. */
  return Math.max(3, Math.min(8, Math.ceil(copyDefault(id).length / 48)));
}

/** The current (override) wording, without interpolation. */
export function copyStored(id: string): string {
  return Object.prototype.hasOwnProperty.call(overrides, id) ? overrides[id] : copyDefault(id);
}

/** True when the office has reworded this line. */
export function copyIsEdited(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(overrides, id);
}

/** Plain-language description of a line, e.g. "Hero headline" + its page. */
export function copyMeta(id: string): { page: string; label: string; role?: CopyRole } {
  const page = COPY_PAGES.find((p) => p.id === PAGE_OF[id]);
  return { page: page ? page.label : "", label: LABELS[id] || id, role: ROLES[id] };
}

export function copyPageOf(id: string): string {
  return PAGE_OF[id] || "";
}

/** Every entry in a page group, with its current value — for the admin list. */
export function copyPageList(pageId: string): CopyEntry[] {
  const page = COPY_PAGES.find((p) => p.id === pageId);
  if (!page) return [];
  return page.entries.map((entry) => ({
    id: entry.id,
    label: entry.label,
    value: copyIsFixed(entry.id)
      ? entry.value
      : Object.prototype.hasOwnProperty.call(overrides, entry.id)
      ? overrides[entry.id]
      : entry.value,
  }));
}

/** Apply a published page group. Unknown ids are ignored, blank values reset to shipped. */
export function bindCopyPage(pageId: string, list: any): void {
  const page = COPY_PAGES.find((p) => p.id === pageId);
  if (!page || !Array.isArray(list)) return;
  const next = { ...overrides };
  /* A stored wording for a button, a title or a locked line (published before
     those became fixed) is dropped, so the shipped wording is what everyone
     sees — and so is a line the code no longer has at all (a segment that was
     removed), which could never be found in the drawer again. */
  for (const id of Object.keys(next)) if (copyIsFixed(id) || !PAGE_OF[id]) delete next[id];
  let touched = 0;
  for (const item of list) {
    const id = item && typeof item.id === "string" ? item.id : "";
    if (!id || PAGE_OF[id] !== pageId) continue;
    /* Buttons, titles and locked lines are furniture: whatever a stale draft
       says, they keep the wording the site shipped with. */
    if (copyIsFixed(id)) continue;
    const value = typeof item.value === "string" ? item.value : "";
    if (value === DEFAULTS[id]) delete next[id];
    else next[id] = value;
    touched++;
  }
  // A published page that dropped every entry means "put the originals back".
  if (!touched) {
    for (const entry of page.entries) if (!copyIsFixed(entry.id)) delete next[entry.id];
  }
  overrides = next;
}

export function copyPageById(id: string) {
  return COPY_PAGES.find((p) => p.id === id);
}
