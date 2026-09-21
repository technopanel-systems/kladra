import type { NotificationKind } from "../../src/lib/notify";
import type { PaymentDetail, PaymentTerms } from "../../src/lib/payment";

/**
 * The demo customer base — **invented lookalikes, never Technopanel's real sheet.**
 *
 * Not one company, person, phone number or project below belongs to a real
 * customer. What is copied from the founder's live sheet is the SHAPE: Arabic
 * names with a few English ones, contractors and factories dominating, Riyadh
 * heavy with real weight in Jeddah and the East, one to three contacts each,
 * and a rep's own note on about half of them.
 *
 * DATA ONLY. `scripts/seed-demo.ts` is the only thing that writes it; nothing
 * here imports the database, and every day is expressed as an offset so the
 * dataset is as fresh on the day it is run as it was the day it was written.
 *
 * Two kinds of offset, and they are not interchangeable:
 *   `back`  — working days back from today (0 = the most recent working day on
 *             or before today). Reps log on working days; Friday and Saturday
 *             are the Riyadh weekend.
 *   `days`  — plain calendar days from today, signed. Follow-ups fall where the
 *             rep put them, weekend or not.
 */

/**
 * Whose name a company, a job or a piece of paper carries.
 *
 * Rawan is here since SPEC §3 made the coordinator a selling role: she has a
 * floor of her own beside the desk she runs, and every screen that reads a
 * rep's name has to have read hers once.
 */
export type RepKey = "faisal" | "saad" | "turki" | "marketing" | "rawan";
export type Channel = "visit" | "siteVisit" | "meeting" | "call" | "whatsapp" | "other";
/**
 * What came of it, by the English name the admin's list is seeded with
 * (`OUTCOMES` in ./lookups). The seed looks each one up by that name and stops
 * on one it cannot find, so a word here the list does not have fails the run.
 */
export type OutcomeName =
  | "Reached"
  | "No answer"
  | "Meeting set"
  | "Wants a quotation"
  | "Not now"
  | "Lost to someone else";

// ---- users -------------------------------------------------------------------

export type UserSeed = {
  key: string;
  name: string;
  /** The same person in Arabic; absent means the Latin name shows to everyone. */
  nameAr?: string;
  email: string;
  role: "rep" | "marketing" | "coordinator" | "manager" | "admin";
  locale: "en" | "ar";
  /**
   * Calendar days back for `last_seen_on`, or `null` for somebody who has never
   * signed in (D77). Absent means today.
   *
   * The demo needs both sides of the week line or the admin's use screen reads
   * the same every day it is opened: everybody here, nobody gone (rules/data.md).
   */
  lastSeenDaysAgo?: number | null;
};

/**
 * The seven from README.md. Rawan and marketing read Arabic; the rest English.
 *
 * Marketing is a role account rather than a person, because Jerom has not named
 * who holds it (SPEC §1, D50). Since SPEC §3 P13 it is a rep in everything plus
 * the lead module: it keeps two customers of its own, with a target, a quotation
 * and an approved load on one of them (D168), and it has passed a lead at every
 * stage the founder named.
 */
export const USERS: UserSeed[] = [
  // Both names on every account, because the Arabic screens name people too
  // (D68). Turki was seeded without one so the Latin fallback was a thing
  // somebody had seen; the founder asked for every demo person in Arabic
  // (2026-09-15), and the fallback is now shown by tests/reading.spec.ts, which
  // takes his Arabic name away for the length of one screen.
  {
    key: "jerom",
    name: "Jerom",
    nameAr: "جيروم",
    email: "jerom@technopanel.com.sa",
    role: "admin",
    locale: "en",
  },
  {
    key: "abdulrahman",
    name: "Abdulrahman Al-Zahrani",
    nameAr: "عبدالرحمن الزهراني",
    email: "abdulrahman@technopanel.com.sa",
    role: "manager",
    locale: "en",
    /*
     * The one who has stopped opening it — nine days, the wrong side of the week
     * line, so the admin's use screen names somebody instead of reading nought
     * every day (rules/data.md).
     *
     * The manager and not a rep, because he is the only person in this dataset
     * for whom it is TRUE: what a person did is counted from the audit log, and
     * every rep here logged a call two days ago. A manager writes nothing — he
     * reads — so a manager who has stopped opening it leaves no other trace at
     * all, which is exactly the failure this screen exists to catch, and the
     * worst one: the screen that replaced his spreadsheet is the one he stopped
     * looking at.
     */
    lastSeenDaysAgo: 9,
  },
  {
    key: "rawan",
    name: "Rawan",
    nameAr: "روان",
    email: "rawan@technopanel.com.sa",
    role: "coordinator",
    locale: "ar",
  },
  {
    key: "faisal",
    name: "Faisal Al-Harbi",
    nameAr: "فيصل الحربي",
    email: "faisal@technopanel.com.sa",
    role: "rep",
    locale: "en",
  },
  {
    key: "saad",
    name: "Saad Al-Qahtani",
    nameAr: "سعد القحطاني",
    email: "saad@technopanel.com.sa",
    role: "rep",
    locale: "en",
  },
  {
    key: "turki",
    name: "Turki Al-Shammari",
    nameAr: "تركي الشمري",
    email: "turki@technopanel.com.sa",
    role: "rep",
    locale: "en",
  },
  {
    key: "marketing",
    name: "Marketing",
    nameAr: "التسويق",
    email: "marketing@technopanel.com.sa",
    role: "marketing",
    locale: "ar",
  },
];

// ---- companies and contacts ---------------------------------------------------

export type ContactSeed = {
  name: string;
  /** As a rep types it — 05x, spaced, or +966. `normalizePhone` does the rest. */
  phone: string;
  /** `positions.name_en`; the contact stores the text, not the id (SPEC D21). */
  position: string;
  email?: string;
  notes?: string;
  /**
   * Taken off the company this many days ago, by the rep who holds the company
   * — somebody who left the customer (P13-S7). The archive screen is read for
   * who took a thing off the floor and when, and a contact is the kind nobody
   * had seeded, so the group and its Restore button were a branch nobody had
   * seen (rules/data.md).
   */
  archived?: { daysAgo: number; reason: string };
};

export type CompanySeed = {
  key: string;
  name: string;
  rep: RepKey;
  /** `company_categories.name_en`. */
  category: string;
  /** `lead_sources.name_en`. */
  source: string;
  /** `cities.name_en` — Saudi companies only. */
  city?: string;
  /** ISO alpha-2; defaults to SA. Non-Saudi companies carry `cityText` instead. */
  country?: string;
  cityText?: string;
  notes?: string;
  /**
   * Other reps this company is shared with (SPEC §3, D147). They read all of
   * it and keep their own contacts on it. One company carries this so the
   * "who else is on it" line is not a screen nobody has ever seen with a row
   * in it.
   */
  sharedWith?: RepKey[];
  /** The first one is the main contact (SPEC D18). */
  contacts: ContactSeed[];
  /**
   * Off the floor, with the reason the admin typed (D87, D106). One company in
   * the demo is archived so the archive screen, the restore path and the
   * reason-only-when-archived rule all have a row to run against, rather than
   * a branch nobody has seen (rules/data.md).
   */
  archived?: { daysAgo: number; reason: string };
  /**
   * Brought in by marketing, and therefore a lead (SPEC §3, P12-7).
   *
   * `daysAgo` overrides the spread-out creation date, because a lead's whole
   * meaning is its age: two working days is the line, and the demo carries a
   * row on each side of it plus one already answered. A threshold with no row
   * past it is a figure nobody has ever seen work (rules/data.md).
   *
   * `acknowledgedDaysAgo` is missing on the ones nobody has answered. A lead
   * somebody filed onto his OWN floor is always answered — there is nobody to
   * tell — which is what `createLeadAction` writes and what these rows copy.
   *
   * `back` is WORKING days back, instead of `daysAgo`, for the one lead whose
   * whole point is the two-working-day line (P13): three working days is past
   * it on whatever weekday the demo is read, and a calendar count is not.
   */
  lead?: {
    from: RepKey;
    query: string;
    daysAgo?: number;
    back?: number;
    acknowledgedDaysAgo?: number;
  };
  /**
   * Opened this many days ago, instead of taking the spread the book gets
   * (P12-8).
   *
   * Only the duplicates use it, and they need it: a flag is raised the moment
   * the second record appears, so the age of the pair IS the age of the newer
   * company. The spread starts twenty days back, which would make every pair on
   * the screen late and leave the amber half of that badge a branch nobody has
   * ever seen (rules/data.md).
   */
  addedDaysAgo?: number;
  /**
   * Whether this customer is in SMAC, and whose word it is (SPEC §3, P14).
   *
   * `registered` is the coordinator's answer and `believed` is the rep's; absent
   * is nobody having said, which is where every company starts and is what the
   * coordinator's backlog is made of. All three are on this floor, because a
   * state the demo never shows is a state nobody has seen work (rules/data.md).
   */
  smac?: "registered" | "believed";
};

export const COMPANIES: CompanySeed[] = [
  // ---- Faisal Al-Harbi — Riyadh and the centre (12) --------------------------
  {
    key: "f1",
    name: "مصنع سدرة للصناعات المعدنية",
    rep: "faisal",
    category: "Factory",
    source: "Field visit",
    city: "Riyadh",
    notes: "يشتري بكميات، اللون فضي ونحاسي، توريد فقط",
    contacts: [
      { name: "سعود المطرفي", phone: "0551204477", position: "Procurement", email: "s.almutarfi@example.sa", notes: "الأفضل الاتصال به الصباح، ما يرد بعد الظهر" },
      { name: "م. خالد الدوسري", phone: "055 331 8842", position: "Engineer" },
    ],
  },
  {
    key: "f2",
    name: "شركة أنماء للمقاولات",
    rep: "faisal",
    // Saad reads this one with him: the customer's Riyadh office buys through
    // Faisal and the Eastern site is Saad's, which is the case sharing exists
    // for (SPEC §3).
    sharedWith: ["saad"],
    category: "Contractor",
    source: "Direct contact",
    city: "Riyadh",
    notes: "واجهة مكاتب إدارية، اللون نحاسي، توريد وتركيب",
    contacts: [
      { name: "ماجد الغامدي", phone: "0503391182", position: "Project manager", email: "majed@example.sa" },
      { name: "نايف السبيعي", phone: "0533320981", position: "Site engineer" },
    ],
  },
  {
    key: "f3",
    name: "مكتب المعمار الحديث للاستشارات الهندسية",
    rep: "faisal",
    category: "Consultant",
    source: "Referral",
    city: "Riyadh",
    notes: "يعتمدون A2 في المشاريع الحكومية",
    contacts: [{ name: "م. وليد القحطاني", phone: "0509923417", position: "Architect", email: "w.alqahtani@example.sa" }],
  },
  {
    key: "f4",
    name: "مؤسسة إبداع للدعاية والإعلان",
    rep: "faisal",
    category: "Advertising",
    source: "WhatsApp",
    city: "Riyadh",
    contacts: [{ name: "فهد العنزي", phone: "0554478812", position: "Owner" }],
  },
  {
    key: "f5",
    name: "Delta Rock Co",
    rep: "faisal",
    category: "Contractor",
    source: "Exhibition",
    city: "Riyadh",
    notes: "Met at the exhibition; the HQ job is the live one",
    // In SMAC already, with a request still waiting on the desk: the one
    // arrangement that shows the coordinator NOT being asked to register a
    // customer she has already registered (P14, rules/data.md).
    smac: "registered",
    contacts: [
      { name: "Ziad Nassar", phone: "0566712093", position: "General manager", email: "ziad@example.com" },
      { name: "Hassan Odeh", phone: "0561120934", position: "Procurement", notes: "Asks for the datasheet every time; send it before the visit" },
    ],
  },
  {
    key: "f6",
    name: "شركة البناء المتين للمقاولات",
    rep: "faisal",
    category: "Contractor",
    source: "Field visit",
    city: "Al Kharj",
    notes: "حساس للسعر، قارن مع عرض ثاني",
    contacts: [
      { name: "عبدالله الشهري", phone: "0555018834", position: "Project manager" },
      { name: "تركي الدوسري", phone: "0501187740", position: "Accountant" },
      // Moved to another contractor; Faisal archived him last week. On a live
      // company, so the archive offers him back in one press (D92).
      {
        name: "خالد المالكي",
        phone: "0540073316",
        position: "Site engineer",
        archived: { daysAgo: 6, reason: "انتقل إلى مقاول آخر" },
      },
    ],
  },
  {
    key: "f7",
    name: "مصنع نجد للكلادينج",
    rep: "faisal",
    category: "Factory",
    source: "Direct contact",
    city: "Riyadh",
    // The coordinator created this one in SMAC when she issued 4541 (P14).
    smac: "registered",
    contacts: [{ name: "بندر الرشيد", phone: "+966 50 551 2908", position: "General manager" }],
  },
  {
    key: "f8",
    name: "ورشة الإتقان للتشكيل المعدني",
    rep: "faisal",
    category: "Workshop",
    source: "Online",
    city: "Riyadh",
    notes: "كميات صغيرة ومتكررة",
    // Faisal thinks this one is in SMAC; nobody has checked (P14).
    smac: "believed",
    contacts: [{ name: "سلطان القرني", phone: "0567719923", position: "Owner" }],
  },
  {
    key: "f9",
    name: "شركة محطات الطريق لإدارة المحطات",
    rep: "faisal",
    category: "Station management",
    source: "Referral",
    city: "Riyadh",
    notes: "ست محطات على طريق الخرج، تنفيذ على مراحل",
    contacts: [
      { name: "مشعل العتيبي", phone: "0532218890", position: "General manager", email: "m.alotaibi@example.sa" },
      { name: "عمر البقمي", phone: "0544410023", position: "Procurement" },
      { name: "م. ياسر الشمري", phone: "0551129983", position: "Site engineer" },
    ],
  },
  {
    key: "f10",
    name: "شركة أملاك المستقبل العقارية",
    rep: "faisal",
    category: "Real estate",
    source: "Marketing",
    city: "Riyadh",
    contacts: [{ name: "صالح المزيني", phone: "0505541127", position: "Owner" }],
  },
  {
    key: "f11",
    name: "Prime Facade Systems",
    rep: "faisal",
    category: "Contractor",
    source: "Online",
    city: "Riyadh",
    notes: "Came through the website, price list only so far",
    contacts: [{ name: "Rami Haddad", phone: "0568812207", position: "Engineer", email: "rami@example.com" }],
  },
  {
    key: "f12",
    name: "مؤسسة ركائز البناء",
    rep: "faisal",
    category: "Contractor",
    source: "Field visit",
    city: "Ad Diriyah",
    contacts: [
      { name: "خالد الحربي", phone: "0558840012", position: "Owner" },
      { name: "عبدالإله الفهد", phone: "0503398821", position: "Project manager" },
    ],
  },

  // A card off a stand, typed in and never called — Faisal's own copy of the
  // band that had existed on his screen since P8 with nothing in it. Marketing
  // and Saad each had one, so the band was exercised somewhere and invisible
  // where anybody looks: a rep's day is demonstrated on Faisal (D66).
  // Faisal's half of the pair that is NOT a duplicate (P12-8). It holds the
  // same number as Rawan's «مؤسسة صدف الشرق للمقاولات» and is a different firm
  // with a different owner at it — one office, two trades, which is exactly
  // what the manager's "not the same company" answer exists for. Both records
  // are old, so this pair is the late one on his screen.
  {
    key: "f13",
    name: "شركة الواجهة الذهبية للتجارة",
    rep: "faisal",
    category: "Contractor",
    source: "Exhibition",
    city: "Riyadh",
    contacts: [{ name: "بدر العتيبي", phone: "0556612094", position: "Owner" }],
  },

  // ---- Saad Al-Qahtani — the West (8) ----------------------------------------
  {
    key: "s1",
    name: "شركة رؤى العمران للمقاولات",
    rep: "saad",
    category: "Contractor",
    source: "Field visit",
    city: "Jeddah",
    notes: "برج الكورنيش، أكبر فرصة عندي هالشهر",
    contacts: [
      { name: "أنس الحربي", phone: "0552210094", position: "Project manager", email: "anas@example.sa" },
      { name: "م. طارق العمري", phone: "0501129987", position: "Site engineer" },
      { name: "هيثم الشريف", phone: "0509912238", position: "Procurement" },
    ],
  },
  {
    key: "s2",
    name: "مصنع الواحة للصناعات المعدنية",
    rep: "saad",
    category: "Factory",
    source: "Direct contact",
    city: "Jeddah",
    contacts: [
      { name: "زياد المالكي", phone: "0555523398", position: "Procurement" },
      { name: "أحمد الزهراني", phone: "0551178840", position: "Accountant" },
    ],
  },
  {
    key: "s3",
    name: "مكتب أبعاد للاستشارات الهندسية",
    rep: "saad",
    category: "Consultant",
    source: "Referral",
    city: "Jeddah",
    contacts: [{ name: "م. عبدالرحمن الجاسر", phone: "0556612290", position: "Consultant", email: "a.aljasser@example.sa" }],
  },
  {
    key: "s4",
    name: "Silver Line Contracting",
    rep: "saad",
    category: "Contractor",
    source: "Exhibition",
    city: "Jeddah",
    notes: "Retail podium, consultant still reviewing the datasheet",
    contacts: [
      { name: "Nabil Aziz", phone: "0567730118", position: "General manager", email: "nabil@example.com" },
      { name: "Omar Sultan", phone: "0533398812", position: "Engineer" },
    ],
  },
  {
    key: "s5",
    name: "شركة الحصن للمقاولات العامة",
    rep: "saad",
    category: "Contractor",
    source: "WhatsApp",
    city: "Makkah",
    notes: "توسعة فندق، الواجهة الخارجية فقط",
    contacts: [{ name: "مازن الخالدي", phone: "0544478812", position: "Project manager" }],
  },
  {
    key: "s6",
    name: "مؤسسة سواعد التعمير",
    rep: "saad",
    category: "Contractor",
    source: "Field visit",
    city: "Madinah",
    contacts: [{ name: "نواف البلوي", phone: "0507719934", position: "Owner" }],
  },
  {
    key: "s7",
    name: "شركة تمكين للمقاولات",
    rep: "saad",
    category: "Contractor",
    source: "Marketing",
    city: "Jeddah",
    contacts: [{ name: "سالم العطوي", phone: "053 339 8813", position: "Procurement" }],
  },
  {
    key: "s8",
    name: "Gulf Cladding Systems LLC",
    rep: "saad",
    category: "Contractor",
    source: "Exhibition",
    country: "AE",
    cityText: "Dubai",
    notes: "Buys from Riyadh and ships out; export pricing only",
    contacts: [
      { name: "Karim Mansour", phone: "0569901142", position: "General manager", email: "karim@example.com" },
      { name: "Salim Abdullah", phone: "0502217736", position: "Procurement" },
    ],
  },

  // ---- Turki Al-Shammari — the East (5) --------------------------------------
  {
    key: "t1",
    name: "مصنع الرواد للألمنيوم",
    rep: "turki",
    category: "Factory",
    source: "Direct contact",
    city: "Dammam",
    notes: "لونين في نفس المشروع، 168 و1020",
    contacts: [
      { name: "فيصل الرشيدي", phone: "0533345567", position: "Procurement", email: "f.alrashidi@example.sa" },
      { name: "م. سعد المطيري", phone: "0551190223", position: "Engineer" },
    ],
  },
  {
    key: "t2",
    name: "شركة البنيان الراسخ للمقاولات",
    rep: "turki",
    category: "Contractor",
    source: "Field visit",
    city: "Al Khobar",
    notes: "الاستشاري يطلب A2 بدون استثناء",
    contacts: [
      { name: "عبدالعزيز القحطاني", phone: "0556680019", position: "Project manager" },
      { name: "وليد الشمري", phone: "0505590278", position: "Site engineer" },
    ],
  },
  {
    key: "t3",
    name: "مؤسسة نبض للدعاية والإعلان",
    rep: "turki",
    category: "Advertising",
    source: "Online",
    city: "Dammam",
    contacts: [{ name: "ريان العنزي", phone: "0534418860", position: "Owner" }],
  },
  {
    key: "t4",
    name: "فهد بن عبدالله العتيبي",
    rep: "turki",
    category: "Personal",
    source: "Referral",
    city: "Al Khobar",
    notes: "استراحة خاصة، كمية صغيرة",
    contacts: [{ name: "فهد العتيبي", phone: "0559930071", position: "Owner" }],
  },
  {
    key: "t5",
    name: "شركة النيل الحديثة للمقاولات",
    rep: "turki",
    category: "Contractor",
    source: "Referral",
    country: "EG",
    cityText: "Cairo",
    contacts: [
      { name: "Mostafa Kamel", phone: "0561178803", position: "General manager", email: "mostafa@example.com" },
      { name: "Ahmed Sherif", phone: "0507740119", position: "Engineer" },
    ],
  },

  /*
   * ---- Marketing — what it brought in (2 of its own, 6 given away) ----------
   *
   * Since SPEC §3 marketing files a LEAD rather than a company, and filing one
   * IS the assignment. Its own two are leads it kept — "or to herself" (P13) —
   * and are therefore answered the moment they are written: there is nobody to
   * tell. And since P13 it sells them like a rep: m1 carries a job, an accepted
   * quotation and a load approved this month, so its month card, its row on
   * the manager's table and its pace line are figures rather than dashes (D168),
   * and m2 carries a job with no paper yet, which is where a walk asks for a
   * price.
   */
  {
    key: "m1",
    name: "شركة واجهات الرياض للمقاولات",
    rep: "marketing",
    category: "Contractor",
    source: "Exhibition",
    city: "Riyadh",
    lead: { from: "marketing", query: "واجهة مبنى إداري في العليا، طلبوا كتالوج وسعر تقريبي", daysAgo: 26 },
    contacts: [
      { name: "ريان الحربي", phone: "0553318890", position: "Procurement", email: "rayan@example.sa" },
    ],
  },
  {
    key: "m2",
    name: "مؤسسة درع الخليج للديكور",
    rep: "marketing",
    category: "Contractor",
    source: "Marketing",
    city: "Riyadh",
    // No activity anywhere below: this one is the "never contacted" band on
    // marketing's day, which is the habit S51 wants visible.
    lead: { from: "marketing", query: "استفسار من الموقع عن ألواح 4 مم لمشروع ديكور داخلي", daysAgo: 20 },
    contacts: [{ name: "ماجد الزهراني", phone: "0501129983", position: "Owner" }],
  },

  /*
   * ---- Marketing — six it gave away, one at every stage ---------------------
   *
   * The founder's stages for a lead marketing passed are "acknowledged,
   * contacted, quoted, won" (§3 P13), and the rep's band and the manager's line
   * need the two sides of "unacknowledged": so, in order, one given to Faisal
   * TODAY (his band, amber), one given to Faisal three WORKING days ago and
   * still unanswered (past the two-day line: red on the leads view and on the
   * manager's stuck list), one that arrived yesterday on Saad's floor, one
   * acknowledged and then rung (contacted), one with a quotation issued on it
   * (quoted), and one whose quotation the customer accepted and nothing has
   * been loaded yet — still quoted, because a lead is won when a load to the
   * customer is approved (D182); marketing's own m1 carries the won one. Every stage
   * is read from the company's own rows at read time, so each row below carries
   * exactly the record that puts it there and nothing that would move it on.
   *
   * No activity on the unanswered ones and no follow-up date: a lead is a
   * customer nobody has spoken to yet, which is the whole reason somebody is
   * waiting.
   *
   * A lead carries only the customer's question — no notes on the company or
   * the contact (§3 P13: "the customer's query as the single note").
   */
  {
    key: "l0",
    name: "مؤسسة سنا المشرق للمقاولات",
    rep: "faisal",
    category: "Contractor",
    source: "WhatsApp",
    city: "Riyadh",
    lead: {
      from: "marketing",
      query: "واجهة فيلا في حي الياسمين، يسأل عن ألوان الخشب والسعر التقريبي",
      daysAgo: 0,
    },
    contacts: [{ name: "بدر القرني", phone: "0559043318", position: "Owner" }],
  },
  {
    key: "l1",
    name: "شركة الرواسي للمقاولات العامة",
    rep: "faisal",
    category: "Contractor",
    source: "Marketing",
    city: "Riyadh",
    lead: {
      from: "marketing",
      query: "برج مكاتب من ستة أدوار في طريق الملك فهد، يريدون سعر كلادينج A2 خلال أسبوع",
      back: 3,
    },
    contacts: [
      { name: "عبدالله الشمري", phone: "0554417702", position: "Procurement", email: "a.alshammari@example.sa" },
    ],
  },
  {
    key: "l2",
    name: "مؤسسة البناء المتين للتجارة",
    rep: "saad",
    category: "Other",
    source: "Exhibition",
    city: "Dammam",
    lead: {
      from: "marketing",
      query: "محل عرض في الدمام، واجهة صغيرة، يسأل عن الألوان المتوفرة والسعر",
      daysAgo: 1,
    },
    contacts: [{ name: "طلال الدوسري", phone: "0503380914", position: "Owner" }],
  },
  {
    key: "l3",
    name: "شركة أفق الشمال للاستثمار",
    rep: "turki",
    category: "Contractor",
    source: "Marketing",
    city: "Buraydah",
    // Contacted: acknowledged a week ago and rung since (the report is under
    // ACTIVITIES), and nothing priced yet.
    lead: {
      from: "marketing",
      query: "مبنى تجاري في بريدة، يسأل عن التوريد فقط بدون تركيب",
      daysAgo: 8,
      acknowledgedDaysAgo: 7,
    },
    contacts: [{ name: "نواف العتيبي", phone: "0567719920", position: "General manager" }],
  },
  {
    key: "l4",
    name: "مؤسسة ركن الجزيرة للديكور",
    rep: "turki",
    category: "Workshop",
    source: "Online",
    city: "Al Khobar",
    // Quoted: acknowledged, a job opened, and a quotation issued on it (q12).
    lead: {
      from: "marketing",
      query: "واجهة محل في الخبر، مساحة صغيرة، يريد عرض سعر لونين",
      daysAgo: 13,
      acknowledgedDaysAgo: 12,
    },
    contacts: [{ name: "ماجد الغامدي", phone: "0538817264", position: "Owner" }],
  },
  {
    key: "l5",
    name: "شركة بوابة العارض للمقاولات",
    rep: "faisal",
    category: "Contractor",
    source: "Referral",
    city: "Riyadh",
    // Quoted still: the customer accepted the quotation on it (q13) and no load
    // has been approved, and a lead is won when one is (D182).
    lead: {
      from: "marketing",
      query: "مجمع مكاتب في حي العارض، يطلب A2 ويسأل عن مدة التوريد",
      daysAgo: 12,
      acknowledgedDaysAgo: 11,
    },
    contacts: [{ name: "فهد السبيعي", phone: "0547731905", position: "Procurement" }],
  },
  // ---- Rawan — the desk that also sells (1) ---------------------------------
  /*
   * Hers, because SPEC §3 gives the coordinator companies of her own. One, and
   * a small one: she runs the queue for five people and sells on the side, so a
   * floor the size of a rep's would be a demo that says something untrue about
   * the job. Source is a walk-in rather than Marketing, which is the one source
   * she is not offered (§3, P12-5).
   */
  {
    key: "r1",
    name: "مؤسسة صدف الشرق للمقاولات",
    rep: "rawan",
    category: "Contractor",
    source: "Direct contact",
    city: "Riyadh",
    // Rawan's half of the pair that is NOT a duplicate (P12-8). Its day is set
    // rather than spread, because the flag is dated at whichever of the two
    // records arrived second: on the spread it landed three months back, and a
    // pair that has waited a working quarter reads as a broken screen rather
    // than as a backlog.
    addedDaysAgo: 12,
    notes: "اتصلوا على المكتب مباشرة، واجهة معرض واحد",
    contacts: [
      { name: "عبدالله الشمري", phone: "0556612094", position: "Owner", email: "a.alshammari@example.sa" },
    ],
  },
  /*
   * Two records of one customer, twice over (P12-8).
   *
   * `d1` is the pair the manager has not answered yet and it arrived TODAY, so
   * the flag on his screen is amber rather than red — the other open pair is
   * weeks old and red, and a badge with only one of its two colours ever drawn
   * is a colour nobody has seen work (rules/data.md). Turki took the call and
   * typed the customer's name the way he heard it; Faisal has had the same firm
   * since the spring, spelled with مؤسسة in front of it. One number between
   * them, two different spellings, and neither man knows about the other.
   *
   * `d2` is the pair that has been answered: the manager kept Faisal's record
   * and shared it, so this one is a tombstone. It carries a project and a log
   * entry, both of which move to the record that continues and stay Turki's —
   * which is what makes the fold worth looking at on a screen rather than only
   * in a test.
   */
  {
    key: "d1",
    name: "إبداع للدعاية والإعلان",
    rep: "turki",
    category: "Advertising",
    source: "Online",
    city: "Riyadh",
    addedDaysAgo: 0,
    notes: "اتصل يسأل عن لوحات واجهة، ما عندي تفاصيل أكثر",
    contacts: [{ name: "فهد العنزي", phone: "0554478812", position: "Owner" }],
  },
  {
    key: "d2",
    name: "انماء للمقاولات",
    rep: "turki",
    category: "Contractor",
    source: "WhatsApp",
    city: "Riyadh",
    addedDaysAgo: 12,
    contacts: [{ name: "ماجد الغامدي", phone: "0503391182", position: "Project manager" }],
  },

  // ---- Off the floor (1) -------------------------------------------------------
  // Saad's, archived six weeks ago with the reason he gave — by Saad, because
  // only the rep who holds a company archives it (`archiveCompanyAction`), and
  // the archive screen names who did. It is on that screen and nowhere else;
  // its contact stays as it was, the way the app leaves a company's people when
  // the company goes (D87).
  {
    key: "x1",
    name: "مؤسسة الرواد للألمنيوم",
    rep: "saad",
    category: "Contractor",
    source: "Direct contact",
    city: "Riyadh",
    notes: "تعاملنا معهم في مشروعين صغيرين",
    contacts: [{ name: "ناصر العتيبي", phone: "0558817320", position: "Owner" }],
    archived: { daysAgo: 42, reason: "أغلقت المؤسسة نشاطها" },
  },
];

// ---- projects -----------------------------------------------------------------

export type ProjectSeed = {
  key: string;
  company: string;
  name: string;
  /** Reps working this job besides its owner (SPEC §3, D147). */
  sharedWith?: RepKey[];
  /** numeric(12,2) — a string, always, so nothing rounds on the way in. */
  expectedSqm: string;
  notes?: string;
  /**
   * Marked lost this many calendar days ago, for the reason stored — one of the
   * nine codes, or a written line for "Other" (`@/lib/loss-reason`). Until
   * P11J the demo had no lost project at all, so every screen that says
   * anything about one was drawn from an empty case.
   */
  lost?: { daysAgo: number; reason: string };
  /**
   * Created this many months back rather than in the last fortnight (P12-10).
   *
   * The jobs the history hangs off are older than the seed's default, because
   * the paper on them is: a project created after its own quotation is a lie
   * about the order things happened in, and the trail panels read in order.
   */
  fromMonthsBack?: number;
  /**
   * Archived on the 27th of that month back: the job is over (P12-10).
   *
   * Delivered, or given up on. Kladra has no "finished" state for a project and
   * §3 refuses to add one, so archived is what a rep does with a job nobody
   * works any more (S16) — and it keeps a delivered job out of the pipeline,
   * which counts what is still to come. Archived by the project's own rep, with
   * the audit line the action writes, so the archive says who (P13-S7).
   */
  archivedMonthsBack?: number;
  /**
   * Why it went, in the words the rep wrote on the request (P14 14.8). Every
   * archive now carries one, and a job archived with nothing said is a row the
   * archive screen can only call "archived".
   */
  archivedReason?: string;
  /**
   * Opened this many calendar days ago, instead of taking the spread (P13). The
   * jobs on a lead are younger than the lead, and the spread starts a fortnight
   * back and runs for months, which would open a job before its customer.
   */
  daysAgo?: number;
};

/*
 * Every column of the projects board has a job in it (D170, rules/data.md), and
 * none of them was put there: the stage is read off the papers below, so these
 * are the rows that land each one.
 *
 * - Open — p12 and pd2 (nothing asked for), p19 (its only request sent back),
 *   p9 (its only price rejected), h5 (a request sent back months ago).
 * - Quoted — p3 (q7 issued today), p4 (q3 issued, its revision on the desk),
 *   p7 (q11 accepted, its first load still waiting), h4 (issued, never answered).
 * - Dispatching — p1, p2, p8 and p18: a load approved, sheets still to go.
 * - Won — p5, p6 and p10 (their months went out whole), p11 (its accepted paper
 *   went out whole, a second price since issued and not taken).
 * - Lost — p13 to p17.
 *
 * `tests/project-board.spec.ts` reads every one of these back off the screen
 * against the stage it works out for itself.
 */
/**
 * Requests to archive that are still waiting, and one that came back refused
 * (SPEC §3, P14 14.8).
 *
 * Without these the sales manager's newest band is empty on the demo floor and
 * the refused state — his reason sitting on a record, waiting to be answered
 * with a better one — is a branch nobody has seen (rules/data.md: every band
 * gets a row, and a colour the demo never shows is a colour nobody has seen
 * work). Three rows, one of each kind, so the band's row reads differently for
 * a customer, a person and a job.
 *
 * All three records stay ON the floor, which is the point of the rule: a
 * request changes nothing until it is answered.
 */
export const ARCHIVE_ASKS: {
  kind: "company" | "contact" | "project";
  /** The seed key of the record — a company, a project, or the contact's company. */
  key: string;
  /** Which of that company's contacts, where the kind is a contact. */
  contactAt?: number;
  /** Who asked — the rep who holds the record. */
  by: string;
  daysAgo: number;
  reason: string;
  /** Answered, where it has been: the manager, his day, and his words. */
  refusedBy?: string;
  refusedDaysAgo?: number;
  refuseReason?: string;
}[] = [
  // The oldest, and therefore the top of his band: a customer Faisal has given
  // up on while the office has not.
  {
    kind: "company",
    key: "f10",
    by: "faisal",
    daysAgo: 5,
    reason: "لم يعد لديهم مشاريع كلادينج، والملف مغلق من طرفهم",
  },
  // A job whose tender went elsewhere, asked for by the rep who opened it.
  {
    kind: "project",
    key: "p12",
    by: "turki",
    daysAgo: 2,
    reason: "المناقصة رست على مورّد آخر",
  },
  // A person at one of Saad's customers, still waiting: the contact card's own
  // waiting notice, and the archive item it takes off that card's menu, had no
  // row on the demo floor without it.
  {
    kind: "contact",
    key: "s2",
    contactAt: 1,
    by: "saad",
    daysAgo: 1,
    reason: "ترك الشركة ولم يعد رقمه يعمل",
  },
  // And the one he answered: the reason is on the contact's card, and Faisal
  // may ask again with an answer to it.
  {
    kind: "contact",
    key: "f9",
    contactAt: 1,
    by: "faisal",
    daysAgo: 8,
    reason: "لم يعد يرد على الاتصال",
    refusedBy: "abdulrahman",
    refusedDaysAgo: 6,
    refuseReason: "رقمه هو الوحيد على أوامر الشراء، يُسأل عنه أولًا عند المدير",
  },
];

export const PROJECTS: ProjectSeed[] = [
  { key: "p1", company: "f1", name: "واجهة مبنى الإدارة", expectedSqm: "480.00" },
  {
    key: "p2",
    company: "f2",
    name: "برج مكاتب طريق الملك فهد",
    // The one job two reps are on: Saad works it with Faisal, so the screens
    // that say who is credited what have a row that is not one person's
    // (SPEC §3, D147).
    sharedWith: ["saad"],
    expectedSqm: "2400.00",
    notes: "توريد وتركيب، اللون نحاسي",
  },
  { key: "p3", company: "f3", name: "فيلا خاصة - الدرعية", expectedSqm: "620.00" },
  { key: "p4", company: "f5", name: "Delta Rock HQ", expectedSqm: "3200.00", notes: "Consultant approved A2 only" },
  { key: "p5", company: "f6", name: "مجمع سكني - حي الياسمين", expectedSqm: "1850.00" },
  {
    key: "p6",
    company: "f9",
    name: "محطات طريق الخرج",
    expectedSqm: "5000.00",
    notes: "ست محطات، تنفيذ على مراحل",
  },
  { key: "p7", company: "f7", name: "واجهات معرض السيارات", expectedSqm: "900.00" },
  { key: "p8", company: "s1", name: "برج الكورنيش التجاري", expectedSqm: "4200.00" },
  { key: "p9", company: "s4", name: "Jeddah Gate Retail Podium", expectedSqm: "1300.00" },
  { key: "p10", company: "s5", name: "توسعة فندق العزيزية", expectedSqm: "2750.00" },
  { key: "p11", company: "t1", name: "مبنى مكاتب الخبر", expectedSqm: "760.00" },
  { key: "p12", company: "t2", name: "مركز الظهران التجاري", expectedSqm: "3400.00" },
  /*
   * Lost two days ago, with a request raised three working days ago still
   * sitting on the coordinator's desk (D138). That is the only way into this
   * state — a NEW request on a lost project is refused at the action — and it
   * is the state the desk could not see: she reads the row, prices it, and the
   * decision was taken the day before.
   */
  {
    key: "p13",
    company: "t1",
    name: "مستودعات الدمام - المرحلة الثانية",
    expectedSqm: "1450.00",
    lost: { daysAgo: 2, reason: "competitor" },
  },
  /*
   * Three more given up inside the quarter, on three floors and for three
   * different reasons, so "why we lose" (D140) has a shape rather than a single
   * bar. The reasons are the ones a cladding job actually dies of: the price,
   * the lead time, and a customer who simply stopped answering.
   */
  {
    key: "p14",
    company: "f6",
    name: "أبراج الياسمين - المرحلة الثالثة",
    expectedSqm: "2100.00",
    lost: { daysAgo: 20, reason: "price" },
  },
  {
    key: "p15",
    company: "s4",
    name: "Jeddah Gate Office Tower",
    expectedSqm: "3000.00",
    lost: { daysAgo: 45, reason: "leadTime" },
  },
  {
    key: "p16",
    company: "f7",
    name: "معرض السيارات - الفرع الشمالي",
    expectedSqm: "640.00",
    lost: { daysAgo: 9, reason: "quiet" },
  },
  /*
   * And one given up for a reason nobody had a code for, which is what "Other"
   * is: the column holds the rep's own line. It reads as itself on the project
   * and counts under "Other" on the card — the fold every screen that reads
   * this column has to do (`@/lib/loss-reason`).
   */
  {
    key: "p17",
    company: "s5",
    name: "توسعة فندق العزيزية - الجناح الشرقي",
    expectedSqm: "880.00",
    lost: { daysAgo: 30, reason: "العميل اختار مورّدًا محليًا" },
  },
  // Rawan's own, and the only job on her floor (SPEC §3).
  { key: "p18", company: "r1", name: "واجهة معرض السيارات - طريق الخرج", expectedSqm: "520.00" },
  /*
   * The small one, and the reason it is here at all (P12-10).
   *
   * A workshop buying a few sheets to cut up is the nearest thing this floor
   * has to a sale off the shelf, and it was seeded as a quotation with no job —
   * the only shape in the system that could not be created through a screen.
   * Every quotation belongs to a project (S18), so the job is named for what it
   * is: an order, not a tower. Fifty metres, so it changes no figure anybody
   * reads.
   */
  { key: "p19", company: "f8", name: "ألواح تشكيل - طلبية ورشة", expectedSqm: "50.00" },
  /*
   * The jobs the months behind us were for (P12-10, S18).
   *
   * Every quotation belongs to a project, and the history rows carried none:
   * `project_id` was nullable, no screen in the app could write a quotation
   * without a job, and this file was the only writer in the system that did —
   * twenty-one of them, which is why two thirds of the quotations list read "—"
   * where the job goes. Most of the history hangs off jobs that are already
   * here; these are the six customers that had no job at all.
   *
   * Four are archived, because their story is over: delivered, or given up on.
   * Two are live and stay in the pipeline, because the paper on them is still
   * out — one quoted and never answered, one sent back and never fixed. That
   * difference is the point of seeding them separately: both shapes exist on a
   * real floor and only one of them is somebody's fault.
   */
  {
    key: "h1",
    company: "s3",
    name: "مبنى إداري - حي الملقا",
    expectedSqm: "1500.00",
    fromMonthsBack: 2,
    archivedMonthsBack: 1,
    archivedReason: "سُلِّم المشروع بالكامل",
  },
  {
    key: "h2",
    company: "t3",
    name: "لوحات معرض الظهران",
    expectedSqm: "700.00",
    fromMonthsBack: 2,
    archivedMonthsBack: 1,
    archivedReason: "سُلِّم المشروع بالكامل",
  },
  {
    key: "h3",
    company: "f11",
    name: "Prime Facade Olaya Clinic",
    expectedSqm: "450.00",
    fromMonthsBack: 4,
    archivedMonthsBack: 3,
    archivedReason: "العميل أجّل التنفيذ إلى أجل غير مسمى",
  },
  { key: "h4", company: "t5", name: "مبنى النيل السكني", expectedSqm: "800.00", fromMonthsBack: 3 },
  {
    key: "h5",
    company: "s8",
    name: "Gulf Cladding Showroom",
    expectedSqm: "560.00",
    fromMonthsBack: 3,
  },
  {
    key: "h6",
    company: "s6",
    name: "مدرسة أهلية - حي الروضة",
    expectedSqm: "340.00",
    fromMonthsBack: 2,
    archivedMonthsBack: 1,
    archivedReason: "رست المناقصة على مورّد آخر",
  },
  // Turki's job on the record that turns out to be Faisal's customer (P12-8).
  // It moves onto the record that continues and stays TURKI's, which is the
  // whole of what a fold does and does not do: an item belongs to whoever made
  // it (D147).
  { key: "pd2", company: "d2", name: "واجهة برج مكتبي - طريق الملك عبدالعزيز", expectedSqm: "260.00" },
  /*
   * Marketing's own jobs (SPEC §3 P13, D168): one with paper and a load on it,
   * and one with nothing yet, where a price is asked for.
   */
  { key: "pm1", company: "m1", name: "واجهة مبنى إداري - العليا", expectedSqm: "600.00", daysAgo: 24 },
  { key: "pm2", company: "m2", name: "ديكور داخلي - معرض حي النرجس", expectedSqm: "180.00", daysAgo: 15 },
  // The jobs on the two leads that got as far as a price (P13).
  { key: "pl4", company: "l4", name: "واجهة محل - الخبر", expectedSqm: "90.00", daysAgo: 11 },
  { key: "pl5", company: "l5", name: "مجمع مكاتب العارض", expectedSqm: "1400.00", daysAgo: 10 },
];

// ---- reports ------------------------------------------------------------------

/*
 * A report is one thing that happened with a customer: what kind of thing it
 * was, what came of it, and the rest in the rep's words (SPEC §3 P13, 13.8).
 * All six kinds are on this floor and all six outcomes, because a chip the demo
 * never fills is a filter nobody has seen narrow anything (rules/data.md) — and
 * a few name the quotation or the load they were about, so the line under an
 * entry that says so has been drawn.
 */
export type ActivitySeed = {
  company: string;
  project?: string;
  /** Index into the company's `contacts`. */
  contact?: number;
  text: string;
  channel: Channel;
  outcome: OutcomeName;
  /**
   * The quotation or dispatch it was about, by seed key. Linked once those are
   * seeded, and the entry takes the job they are on (the popup does the same).
   */
  quotation?: string;
  dispatch?: string;
  /** Working days back from today; 0 is the most recent working day. */
  back: number;
  /** Put it on the weekend day just before that working day instead. */
  onWeekend?: boolean;
  /**
   * Unfiled: written against the wrong customer and taken off the floor (D70).
   * It stays in the table and appears in no list and no count, so the exclusion
   * every one of those queries carries is a thing somebody has seen work
   * (rules/data.md).
   */
  unfiled?: boolean;
  /**
   * Calendar days from today. Set ONLY on a company's newest entry, and only
   * where it equals what that company carries in `next_follow_up` — a log entry
   * is one of the two things that sets it (SPEC D9), and two different answers
   * on one company is the drift trap.
   */
  followUpDays?: number;
};

export const ACTIVITIES: ActivitySeed[] = [
  // Faisal — 29
  { company: "f1", project: "p1", contact: 0, channel: "siteVisit", outcome: "Reached", back: 5, text: "زيارة المصنع، شفنا الواجهة الحالية وأخذنا المقاسات" },
  { company: "f1", contact: 0, channel: "whatsapp", outcome: "Reached", back: 2, text: "أرسلت له كتالوج الألوان، اختار 168 فضي" },
  { company: "f1", project: "p1", contact: 0, channel: "siteVisit", outcome: "Wants a quotation", back: 0, followUpDays: 0, text: "زيارة الموقع، طلب عينات 4 مم لون 168" },

  { company: "f2", contact: 0, channel: "call", outcome: "Meeting set", back: 9, text: "اتصال مع مدير المشاريع، عندهم برج مكاتب على طريق الملك فهد" },
  { company: "f2", project: "p2", contact: 1, channel: "meeting", outcome: "Wants a quotation", back: 6, followUpDays: -4, text: "زيارة المكتب، طلبوا عرض سعر للواجهة، 2,400 متر تقريباً" },

  { company: "f3", contact: 0, channel: "meeting", outcome: "Reached", back: 3, text: "زيارة المكتب الاستشاري، اعتمدوا مواصفة A2 للمشاريع الحكومية" },
  // Faisal wrote this against the wrong customer and unfiled it (D70). It is in
  // the table, on no screen, and in no count.
  { company: "f3", channel: "call", outcome: "Reached", back: 4, unfiled: true, text: "اتصال بخصوص طلب المصنع — التسجيل على الشركة الخطأ" },

  { company: "f4", contact: 0, channel: "whatsapp", outcome: "Not now", back: 12, text: "طلب لوحات إعلانية 3 مم، ما عندنا، عرضت عليه 4 مم" },
  { company: "f4", contact: 0, channel: "call", outcome: "No answer", back: 6, text: "ما رد، أعيد الاتصال الأسبوع الجاي" },

  { company: "f5", project: "p4", channel: "meeting", outcome: "Meeting set", back: 8, text: "Met them at the exhibition stand, they are building their HQ in Riyadh" },
  { company: "f5", project: "p4", contact: 0, channel: "call", outcome: "Reached", quotation: "q3", back: 3, text: "Called Ziad, walked him through the HQ quotation" },
  { company: "f5", contact: 0, channel: "whatsapp", outcome: "Not now", back: 1, followUpDays: 3, text: "Sent catalogue, waiting for the consultant" },

  { company: "f6", project: "p5", contact: 0, channel: "siteVisit", outcome: "Wants a quotation", back: 10, text: "زيارة الخرج، مجمع سكني حي الياسمين، 1,850 متر" },
  { company: "f6", contact: 0, channel: "call", outcome: "Lost to someone else", back: 4, text: "العميل قال السعر مرتفع مقارنة بعرض ثاني" },

  { company: "f7", project: "p7", contact: 0, channel: "visit", outcome: "Wants a quotation", back: 9, text: "زيارة المصنع، معرض سيارات جديد على الدائري الشرقي" },
  { company: "f7", contact: 0, channel: "whatsapp", outcome: "Reached", back: 2, text: "أرسلت له مقاسات الألواح المتوفرة" },

  { company: "f8", contact: 0, channel: "whatsapp", outcome: "Wants a quotation", back: 7, text: "طلب أسعار ألواح 4 مم للتشكيل، كمية صغيرة" },
  { company: "f8", contact: 0, channel: "call", outcome: "Not now", back: 2, followUpDays: 9, text: "رجعت له، قال ينتظر موافقة صاحب الورشة" },

  { company: "f9", project: "p6", contact: 0, channel: "meeting", outcome: "Reached", back: 11, text: "اجتماع مع إدارة المحطات، عندهم ست محطات على طريق الخرج" },
  { company: "f9", project: "p6", contact: 2, channel: "call", outcome: "Reached", back: 5, text: "طلبوا جدول تنفيذ لكل محطة على حدة" },

  // One day of telephone work, three working days back — nine entries on it
  // once f3's visit and f5's call are counted (P12-13). Until this the busiest
  // day anybody in the demo had ever had was three, so the line that says a
  // card is not showing the whole day had never been on a screen, and neither
  // had the report card of a rep who actually worked the phone. A day like this
  // is ordinary here: the fabricator rings back, the consultant wants a
  // specification, and half of it is five minutes each.
  { company: "f1", contact: 0, channel: "call", outcome: "Reached", dispatch: "d3", back: 3, text: "اتصل يسأل عن مدة التوريد، قلت له أسبوعين من تاريخ الطلب" },
  { company: "f1", project: "p1", channel: "whatsapp", outcome: "Reached", back: 3, text: "أرسلت له صور تركيب مشابه في مشروع سابق" },
  { company: "f5", contact: 0, channel: "whatsapp", outcome: "Reached", back: 3, text: "Sent the fire rating certificate, they forwarded it to the consultant" },
  { company: "f7", contact: 0, channel: "call", outcome: "Reached", back: 3, text: "المقاول يسأل عن الفرق بين 4 و 5 مم للواجهات العالية" },
  { company: "f7", channel: "other", outcome: "Reached", back: 3, text: "أرسلت له جدول المقاسات المتوفرة بالإيميل" },
  { company: "f8", contact: 0, channel: "call", outcome: "Wants a quotation", back: 3, text: "صاحب الورشة رجع، يبي كمية أقل من المتوفرة" },
  { company: "f8", contact: 0, channel: "whatsapp", outcome: "Reached", back: 3, text: "أرسلت له الأسعار للكمية الصغيرة" },

  { company: "f10", contact: 0, channel: "call", outcome: "Not now", back: 13, text: "اتصال أول، عندهم مشروع سكني بعد شهرين" },

  { company: "f11", contact: 0, channel: "other", outcome: "Wants a quotation", back: 4, text: "Came through the website form, asked for the 4 mm price list" },

  { company: "f12", contact: 0, channel: "call", outcome: "Wants a quotation", back: 7, onWeekend: true, text: "اتصل يوم الجمعة، يبي عرض سعر مستعجل للدرعية" },

  // Saad — 11
  { company: "s1", project: "p8", contact: 0, channel: "siteVisit", outcome: "Wants a quotation", back: 10, text: "زيارة جدة، برج الكورنيش التجاري، 4,200 متر" },
  { company: "s1", contact: 0, channel: "call", outcome: "Reached", quotation: "q6", back: 6, text: "تم إصدار عرض السعر وأرسلته للعميل" },
  { company: "s1", project: "p8", contact: 1, channel: "meeting", outcome: "Reached", dispatch: "d2", back: 1, followUpDays: 2, text: "العميل وافق على العرض، بديت أرتب التوريد" },

  { company: "s2", contact: 0, channel: "whatsapp", outcome: "Wants a quotation", back: 8, text: "طلب أسعار 5 مم كمية 300 متر" },
  { company: "s2", contact: 0, channel: "call", outcome: "Not now", back: 3, text: "ينتظر موافقة الإدارة على الكمية" },

  { company: "s3", contact: 0, channel: "visit", outcome: "Reached", back: 5, text: "زيارة المكتب، عرضنا المواصفات الفنية والشهادات" },

  { company: "s4", project: "p9", contact: 0, channel: "meeting", outcome: "Meeting set", back: 9, text: "Met at the Jeddah expo, they asked about the retail podium" },
  { company: "s4", contact: 1, channel: "call", outcome: "No answer", back: 2, followUpDays: 6, text: "Sent the technical datasheet, waiting for their reply" },

  { company: "s5", project: "p10", contact: 0, channel: "whatsapp", outcome: "Wants a quotation", back: 4, text: "توسعة فندق العزيزية، طلبوا عرض للواجهة الخارجية" },

  { company: "s6", contact: 0, channel: "call", outcome: "Not now", back: 12, text: "اتصال تعريفي، ما عندهم مشاريع حالياً" },

  { company: "s7", contact: 0, channel: "whatsapp", outcome: "Reached", back: 3, onWeekend: true, text: "راسلني السبت، يبي كتالوج الألوان" },

  // Turki — 7
  { company: "t1", project: "p11", contact: 0, channel: "visit", outcome: "Meeting set", back: 7, text: "زيارة الدمام، مبنى مكاتب 760 متر" },
  { company: "t1", contact: 0, channel: "call", outcome: "Wants a quotation", back: 2, followUpDays: 4, text: "طلب عرض سعر بلونين، 168 و1020" },
  // Overdue on purpose: marketing's day is the call list, and a screen with
  // nothing on it shows nothing about the role (P8.9).
  { company: "m1", contact: 0, channel: "call", outcome: "Reached", back: 4, followUpDays: -2, text: "اتصلت بهم بعد المعرض، مهتمين بواجهة مشروع في الملقا" },

  { company: "t2", project: "p12", contact: 0, channel: "siteVisit", outcome: "Reached", back: 11, text: "زيارة الخبر، مركز تجاري كبير، الاستشاري يطلب A2" },
  { company: "t2", contact: 1, channel: "whatsapp", outcome: "Reached", back: 5, text: "أرسلت شهادات مقاومة الحريق" },

  { company: "t3", contact: 0, channel: "call", outcome: "Wants a quotation", back: 3, text: "طلب ألواح للوحات محلات، الكمية 40 متر" },

  { company: "t4", contact: 0, channel: "whatsapp", outcome: "Not now", back: 8, text: "عميل شخصي، يبي يكسي واجهة استراحة" },

  { company: "t5", contact: 0, channel: "other", outcome: "Not now", back: 6, onWeekend: true, text: "Enquiry from the Cairo office, asked about export pricing" },

  // The lead marketing passed him, rung after he acknowledged it: "contacted" on
  // marketing's screen is this row and nothing else (SPEC §3 P13).
  { company: "l3", contact: 0, channel: "call", outcome: "Reached", back: 3, text: "اتصلت بنواف بعد استلام الطلب، ينتظر اعتماد المخطط ليرسل الكميات" },

  // What Turki wrote before anybody knew this was Faisal's customer (P12-8).
  // The fold moves it onto the record that continues, with his name still on
  // it: an entry records who did it, and rewriting that would be rewriting the
  // report (S27).
  { company: "d2", contact: 0, channel: "call", outcome: "Meeting set", back: 9, text: "اتصل يسأل عن كلادينج لبرج مكتبي، طلب زيارة" },
];

/**
 * The pair the manager has already answered (P12-8).
 *
 * He kept Faisal's record — the older one, with the history and the shared
 * floor on it — and shared it, so Turki keeps the customer he found without
 * taking him. The seed folds it through the app's own `foldCompany`, not by
 * hand: a demo that wrote a tombstone itself would be a second answer to what
 * folding IS, and the one that drifts is the one nobody runs against a screen.
 */
export const FOLD = {
  folded: "d2",
  into: "f2",
  ruling: "keptAndShared",
  by: "abdulrahman",
} as const;

// ---- follow-ups ---------------------------------------------------------------
// Faisal's six are the shape the rep home is built to show: exactly two overdue,
// one due today, three still ahead. Every value here is calendar days from today.

export type FollowUpSeed = { company?: string; project?: string; days: number };

export const FOLLOW_UPS: FollowUpSeed[] = [
  // Faisal — 2 overdue. The first is nine days past, which is more than three
  // WORKING days past whatever weekday the demo is read on (D141): at four days
  // it was long overdue by the calendar and never by the clock the manager's
  // screen actually runs, so his "follow-ups long overdue" band was empty in
  // every screenshot ever taken of it.
  { company: "f2", days: -9 },
  { project: "p6", days: -2 },
  // Faisal — 1 today
  { company: "f1", days: 0 },
  // Faisal — 3 ahead
  { company: "f5", days: 3 },
  { project: "p2", days: 5 },
  { company: "f8", days: 9 },
  // Saad
  { project: "p10", days: -1 },
  { company: "s1", days: 2 },
  { company: "s4", days: 6 },
  // Turki
  { project: "p12", days: 1 },
  { company: "t1", days: 4 },
  // Marketing — one lead overdue, and the second one carries no follow-up at
  // all because it has never been contacted. Between them its day shows both
  // bands it can ever have (P8.9).
  { company: "m1", days: -2 },
];

// ---- quotations ---------------------------------------------------------------

export type QuotationItemSeed = {
  colourCode: string;
  /** `suppliers.code`. */
  supplier: string;
  /** `fire_ratings.name`. */
  fireRating: string;
  /** `classes.name`. */
  className: string;
  /** `thicknesses.mm`. */
  thickness: string;
  qty: number;
  width: string;
  length: string;
  pricePerSqm: string;
};

/**
 * A service on a quotation (SPEC §3, P13): which one by its English name, the m²
 * it is done over as the rep typed it, and its price per m².
 */
export type QuotationServiceSeed = {
  /** `services.name_en`. */
  service: string;
  sqm: string;
  pricePerSqm: string;
};

/**
 * One time the coordinator sent it back, and what happened after (D72).
 *
 * The quotation row carries the reason of the LAST return only, so sent back
 * once and sent back three times read identically everywhere except the trail —
 * which is the whole reason the trail exists. The trail is written from here.
 */
export type SentBackSeed = {
  /** Working days back when she sent it back. */
  back: number;
  reason: string;
  /** Working days back when he fixed it and asked again. Absent while it still sits with him. */
  fixedBack?: number;
};

export type QuotationSeed = {
  key: string;
  company: string;
  /** The job it is priced for. Required — every quotation names one (S18). */
  project: string;
  rep: RepKey;
  /**
   * Who it counts for (D148). Absent means the rep who raised it, which is the
   * answer for every job one man works; naming two people splits the metres
   * between them in equal parts.
   */
  creditTo?: RepKey[];
  status: "requested" | "returned" | "issued" | "accepted" | "rejected";
  /**
   * Which store it was priced out of, by its English name (SPEC §3, P12-9).
   * Absent means Riyadh, which is where most of this floor's work ships from and
   * what the form opens on; the rows that name another one are here so that all
   * four are on a screen somebody has actually looked at (rules/data.md).
   */
  warehouse?: string;
  /**
   * The rare second and third store, where the panels for one paper come out of
   * more than one (SPEC §3, P14). One paper on this floor says so, because a
   * field the demo never shows filled is a field nobody has seen work.
   */
  alsoFrom?: string[];
  /**
   * Who at the customer it is addressed to — an index into the company's own
   * `contacts` (P12-9). Absent means nobody, which is a real state: a price for
   * stock is sometimes for the company rather than for a person.
   */
  contact?: number;
  notes?: string;
  smacNumber?: string;
  /**
   * Every time it came back, oldest first. `return_reason` on the row is the
   * last of these and only while it is still `returned` — the seed derives it
   * rather than being told it twice.
   */
  sentBack?: SentBackSeed[];
  decisionReason?: string;
  /** Working days back from today for `issued_at` / `decided_at`. */
  issuedBack?: number;
  decidedBack?: number;
  /** Working days back for `created_at`. */
  createdBack: number;
  /**
   * Raised and issued in one act by the person whose customer it is (SPEC §3).
   * Only the coordinator can do it — she is the desk everybody else asks — and
   * the row carries the flag so the manager reads who did both.
   */
  selfIssued?: boolean;
  /**
   * Who pressed the button, where that is not the person it counts for (SPEC §3
   * P13): the coordinator, raising it on a rep's behalf. Absent means `rep`
   * raised it himself, which is nearly all paper.
   */
  raisedBy?: RepKey;
  /** A revision copies the parent's number and its lines (SPEC D10). */
  revisionOf?: string;
  revision?: number;
  items: QuotationItemSeed[];
  /**
   * Its services, in their own section (SPEC §3, P13). Absent on most paper, as
   * on a real floor; present on three rows — one issued, one waiting, and the
   * revision of the issued one at a new price — so the section, its subtotal and
   * the "what changed" line for a service are all on a screen somebody has seen
   * (rules/data.md).
   */
  services?: QuotationServiceSeed[];
};

export const QUOTATIONS: QuotationSeed[] = [
  {
    key: "q1",
    company: "f2",
    project: "p2",
    rep: "faisal",
    status: "requested",
    contact: 0,
    /*
     * Four working days back, which is past the line (S53, D59): this is the one
     * row in the dataset that makes the manager's "requests waiting" figure and
     * the coordinator's own late caption say something other than nought. It was
     * one working day, so both of those figures were zero on every screenshot
     * ever taken of this app, and a figure that is always zero in the demo is a
     * figure nobody has ever seen work.
     */
    createdBack: 4,
    notes: "العميل مستعجل، الواجهة الرئيسية فقط في هذه المرحلة",
    items: [
      { colourCode: "168", supplier: "N", fireRating: "B1", className: "A", thickness: "4.0", qty: 90, width: "1.24", length: "5.8", pricePerSqm: "112.00" },
      { colourCode: "1020", supplier: "N", fireRating: "B1", className: "A", thickness: "4.0", qty: 35, width: "1.5", length: "3.2", pricePerSqm: "118.00" },
    ],
    // Waiting in the queue with a service on it, so the coordinator prices one
    // before it is issued, not only after.
    services: [{ service: "Denting", sqm: "64.50", pricePerSqm: "18.00" }],
  },
  {
    key: "q2",
    company: "f8",
    project: "p19",
    rep: "faisal",
    status: "returned",
    warehouse: "Malham",
    contact: 0,
    createdBack: 6,
    /*
     * Sent back twice. Nothing on the row says so — it keeps the last reason and
     * nothing else — so before the trail was read back, a quotation that had
     * come back twice and one that had come back once looked the same on every
     * screen (9A item 5, D72). This is the row that makes the count say two.
     */
    sentBack: [
      { back: 5, reason: "المقاسات ناقصة — أحتاج الطول والعرض لكل بند قبل الإصدار", fixedBack: 4 },
      { back: 3, reason: "الكمية لا تغطي الواجهة في المخطط — راجع الكشف مع الاستشاري" },
    ],
    items: [
      { colourCode: "RAL 9016", supplier: "K", fireRating: "Normal", className: "B", thickness: "4.0", qty: 12, width: "1.24", length: "3.2", pricePerSqm: "98.00" },
    ],
  },
  {
    key: "q3",
    company: "f5",
    project: "p4",
    rep: "faisal",
    status: "issued",
    contact: 1,
    createdBack: 7,
    // Came back once and went out the next day: the ordinary case, and the one
    // that proves a trail can carry rework and still end well.
    sentBack: [{ back: 7, reason: "ينقص كود اللون للبند الثالث", fixedBack: 6 }],
    issuedBack: 6,
    smacNumber: "4512",
    notes: "Consultant asked for A2 on every elevation",
    items: [
      { colourCode: "168", supplier: "C", fireRating: "A2", className: "A2G1", thickness: "4.0", qty: 120, width: "1.24", length: "5.8", pricePerSqm: "134.00" },
      { colourCode: "1020", supplier: "C", fireRating: "A2", className: "A2G1", thickness: "4.0", qty: 60, width: "1.5", length: "5.8", pricePerSqm: "136.00" },
      { colourCode: "RAL 9016", supplier: "C", fireRating: "A2", className: "A2G2", thickness: "5.0", qty: 25, width: "2.0", length: "3.2", pricePerSqm: "140.00" },
    ],
    // Issued with two services: the podium's panels cut on the CNC, and the
    // canopy returns fabricated. The m² is the area each is done over, typed,
    // and neither counts toward anybody's month (D173).
    services: [
      { service: "CNC cutting", sqm: "180.00", pricePerSqm: "22.00" },
      { service: "Fabrication", sqm: "42.75", pricePerSqm: "65.00" },
    ],
  },
  {
    key: "q4",
    company: "f1",
    project: "p1",
    rep: "faisal",
    status: "accepted",
    contact: 0,
    createdBack: 9,
    issuedBack: 8,
    decidedBack: 5,
    smacNumber: "4519",
    items: [
      { colourCode: "168", supplier: "N", fireRating: "B1", className: "A", thickness: "4.0", qty: 80, width: "1.24", length: "5.8", pricePerSqm: "108.00" },
      { colourCode: "1020", supplier: "N", fireRating: "B1", className: "A", thickness: "4.0", qty: 60, width: "1.5", length: "3.2", pricePerSqm: "115.00" },
    ],
  },
  {
    key: "q5",
    company: "f6",
    project: "p5",
    rep: "faisal",
    status: "rejected",
    warehouse: "Dammam",
    contact: 1,
    createdBack: 11,
    issuedBack: 10,
    decidedBack: 4,
    smacNumber: "4523",
    decisionReason: "العميل اختار مورد آخر، الفرق حوالي 8 ريال للمتر",
    items: [
      { colourCode: "168", supplier: "D", fireRating: "B1", className: "B", thickness: "4.0", qty: 110, width: "1.24", length: "5.8", pricePerSqm: "95.00" },
      { colourCode: "RAL 9016", supplier: "D", fireRating: "Normal", className: "B", thickness: "4.0", qty: 40, width: "1.5", length: "3.2", pricePerSqm: "99.00" },
    ],
  },
  {
    key: "q3r2",
    company: "f5",
    project: "p4",
    rep: "faisal",
    status: "requested",
    createdBack: 0,
    revisionOf: "q3",
    revision: 2,
    notes: "Consultant moved the podium to 5 mm — same colours, same areas",
    items: [
      { colourCode: "168", supplier: "C", fireRating: "A2", className: "A2G1", thickness: "5.0", qty: 120, width: "1.24", length: "5.8", pricePerSqm: "138.00" },
      { colourCode: "1020", supplier: "C", fireRating: "A2", className: "A2G1", thickness: "5.0", qty: 60, width: "1.5", length: "5.8", pricePerSqm: "139.00" },
      { colourCode: "RAL 9016", supplier: "C", fireRating: "A2", className: "A2G2", thickness: "5.0", qty: 25, width: "2.0", length: "3.2", pricePerSqm: "140.00" },
    ],
    // Thicker sheet, dearer cutting: the CNC price moves with the 5 mm and the
    // fabrication stays as it was, so "what changed" names one service.
    services: [
      { service: "CNC cutting", sqm: "180.00", pricePerSqm: "26.00" },
      { service: "Fabrication", sqm: "42.75", pricePerSqm: "65.00" },
    ],
  },
  {
    // Saad's, so his approved dispatch below hangs off his own company.
    key: "q6",
    company: "s1",
    project: "p8",
    rep: "saad",
    status: "accepted",
    contact: 2,
    createdBack: 8,
    issuedBack: 6,
    decidedBack: 2,
    smacNumber: "4527",
    items: [
      { colourCode: "168", supplier: "N", fireRating: "A2", className: "A2G1", thickness: "4.0", qty: 100, width: "1.24", length: "5.8", pricePerSqm: "129.00" },
      { colourCode: "1020", supplier: "N", fireRating: "A2", className: "A2G1", thickness: "4.0", qty: 45, width: "1.5", length: "5.8", pricePerSqm: "131.00" },
    ],
  },
  {
    // Issued, latest revision, nothing sent against it yet — the ordinary state
    // of a quotation the customer has just been given, and where the dispatch
    // chain starts (S38). Every other issued quotation in here has either been
    // revised or already partly dispatched.
    //
    // Issued TODAY, with d4 refused the same morning, because the coordinator's
    // "answered today" turns green only when she is level with what came in and
    // the demo had her answering nothing at all — three bands on her screen and
    // one of them never on it (rules/data.md). Two arrive today and she answers
    // two, which is the ordinary shape of her morning.
    key: "q7",
    company: "f3",
    project: "p3",
    rep: "faisal",
    status: "issued",
    contact: 0,
    createdBack: 5,
    issuedBack: 0,
    smacNumber: "4531",
    items: [
      { colourCode: "168", supplier: "N", fireRating: "B1", className: "A", thickness: "4.0", qty: 100, width: "1.24", length: "5.8", pricePerSqm: "121.00" },
      { colourCode: "RAL 9016", supplier: "K", fireRating: "Normal", className: "B", thickness: "4.0", qty: 40, width: "1.5", length: "3.2", pricePerSqm: "104.00" },
    ],
  },
  {
    /*
     * Raised before its project was marked lost, and still waiting (D138). It
     * is deliberately younger than q1, which stays the longest wait on the
     * desk and the one the late caption is about.
     */
    key: "q8",
    company: "t1",
    project: "p13",
    rep: "turki",
    status: "requested",
    warehouse: "Khamis Mushait",
    contact: 1,
    createdBack: 3,
    notes: "العميل طلب السعر قبل قرار الترسية",
    items: [
      { colourCode: "1020", supplier: "N", fireRating: "A2", className: "A2G1", thickness: "4.0", qty: 60, width: "1.24", length: "5.8", pricePerSqm: "127.00" },
    ],
  },
  {
    /*
     * The one piece of paper two reps share (SPEC §3, D148).
     *
     * Saad works the Anmaa tower with Faisal — p2 is the shared job and f2 the
     * shared customer — so he raised this one himself on another rep's company,
     * which sharing exists for, and said it counts for them both. Without a row
     * like this the split is a branch only a test has ever taken: every screen
     * that says who was credited what would have shown one name on every row
     * since the day it was built.
     *
     * One line, and its quantity is chosen so the division is not clean: 21
     * sheets of 1.24 × 5.8 are 151.03 m², which halves to 75.51 and 75.52. A
     * demo where every split comes out even proves nothing about the rounding
     * rule underneath it.
     */
    key: "q9",
    company: "f2",
    project: "p2",
    rep: "saad",
    creditTo: ["faisal", "saad"],
    status: "accepted",
    contact: 0,
    createdBack: 7,
    issuedBack: 6,
    decidedBack: 5,
    smacNumber: "4535",
    // Thirty quoted and twenty-one sent, so the tower still has sheets left on
    // it: a quotation with nothing left offers no Send button, and the walk
    // that opens the credit question would have had nothing to open.
    items: [
      { colourCode: "168", supplier: "N", fireRating: "B1", className: "A", thickness: "4.0", qty: 30, width: "1.24", length: "5.8", pricePerSqm: "119.00" },
    ],
  },
  /*
   * Rawan's own paper, asked for and issued by her in one act (SPEC §3, P12-5).
   * There is nobody behind the desk to ask, so the request and the issue are the
   * same press and the row is flagged — the founder's clause is that nobody
   * issues their own work unseen, and the flag is what makes it seen.
   *
   * Accepted, so there is a dispatch under it and her month is metres rather
   * than a permanent nought on the manager's table: a figure that is always
   * zero in the demo is a figure nobody has ever seen work.
   */
  {
    key: "q10",
    company: "r1",
    project: "p18",
    rep: "rawan",
    status: "accepted",
    selfIssued: true,
    smacNumber: "24-1189",
    createdBack: 6,
    issuedBack: 6,
    decidedBack: 4,
    notes: "العميل يريد التوريد على دفعتين",
    items: [
      { colourCode: "RAL 9007", supplier: "C", fireRating: "B1", className: "A", thickness: "4.0", qty: 60, width: "1.24", length: "5.8", pricePerSqm: "115.00" },
    ],
  },
  /*
   * A showroom's facades, accepted, with services on it — and a load against it
   * waiting on the desk that is not what the paper says (SPEC §3, P13). The
   * price on the first line was agreed down on the phone and the CNC cutting
   * came out at half the area, so the queue row carries its "differs" chip and
   * the drawer names both changes. Plenty left on both lines, so a rep raising
   * another load against it is prefilled with something.
   */
  {
    key: "q11",
    company: "f7",
    project: "p7",
    rep: "faisal",
    status: "accepted",
    // The one paper on this floor whose panels come out of two stores: the
    // grey is in Riyadh and the white in Malham (SPEC §3, P14).
    alsoFrom: ["Malham"],
    contact: 0,
    createdBack: 8,
    issuedBack: 7,
    decidedBack: 3,
    smacNumber: "4541",
    items: [
      { colourCode: "RAL 7016", supplier: "N", fireRating: "B1", className: "A", thickness: "4.0", qty: 160, width: "1.24", length: "5.8", pricePerSqm: "118.00" },
      { colourCode: "RAL 9006", supplier: "N", fireRating: "B1", className: "A", thickness: "4.0", qty: 90, width: "1.5", length: "5.8", pricePerSqm: "124.00" },
    ],
    services: [
      { service: "CNC cutting", sqm: "120.00", pricePerSqm: "20.00" },
      { service: "Fabrication", sqm: "30.00", pricePerSqm: "60.00" },
    ],
  },
  /*
   * Marketing's own paper (SPEC §3 P13: "a rep in everything"): asked for, issued
   * by the desk and accepted, with a load approved this month below it — so its
   * metres are real metres on its day and on the manager's table (D168).
   */
  {
    key: "qm1",
    company: "m1",
    project: "pm1",
    rep: "marketing",
    status: "accepted",
    contact: 0,
    createdBack: 9,
    issuedBack: 8,
    decidedBack: 6,
    smacNumber: "4545",
    items: [
      { colourCode: "168", supplier: "N", fireRating: "A2", className: "A2G1", thickness: "4.0", qty: 50, width: "1.24", length: "5.8", pricePerSqm: "126.00" },
    ],
  },
  /*
   * The two leads that got to a price (SPEC §3 P13): one issued and waiting on
   * the customer, one the customer accepted. Neither has a load yet, so neither
   * moves anybody's month, and both read Quoted (D182).
   */
  {
    key: "q12",
    company: "l4",
    project: "pl4",
    rep: "turki",
    status: "issued",
    contact: 0,
    createdBack: 6,
    issuedBack: 5,
    smacNumber: "4548",
    items: [
      { colourCode: "RAL 9016", supplier: "K", fireRating: "Normal", className: "B", thickness: "4.0", qty: 14, width: "1.24", length: "3.2", pricePerSqm: "101.00" },
      { colourCode: "7016", supplier: "K", fireRating: "Normal", className: "B", thickness: "4.0", qty: 8, width: "1.24", length: "3.2", pricePerSqm: "101.00" },
    ],
  },
  {
    key: "q13",
    company: "l5",
    project: "pl5",
    rep: "faisal",
    status: "accepted",
    contact: 0,
    createdBack: 7,
    issuedBack: 6,
    decidedBack: 3,
    smacNumber: "4552",
    items: [
      { colourCode: "168", supplier: "C", fireRating: "A2", className: "A2G1", thickness: "4.0", qty: 120, width: "1.24", length: "5.8", pricePerSqm: "132.00" },
    ],
  },
  /*
   * Paper the coordinator raised on a rep's behalf (SPEC §3 P13), spread over the
   * last month: two for Faisal — one the customer turned down, one accepted with
   * a load waiting on her desk below it — and one for Saad still with the
   * customer. Each counts for the rep, carries her as the raiser, and was issued
   * in the same act, as her own paper is (q10 is hers, under Internal Sales).
   *
   * At the end of the list so no other quotation's number moves.
   */
  {
    key: "fr1",
    company: "f6",
    project: "p5",
    rep: "faisal",
    raisedBy: "rawan",
    selfIssued: true,
    status: "rejected",
    contact: 0,
    createdBack: 17,
    issuedBack: 17,
    decidedBack: 12,
    smacNumber: "4561",
    decisionReason: "المشروع تأجل إلى السنة القادمة",
    notes: "فيصل في موقع جدة، طلب رفعه نيابةً عنه",
    items: [
      { colourCode: "RAL 9016", supplier: "N", fireRating: "B1", className: "A", thickness: "4.0", qty: 70, width: "1.24", length: "5.8", pricePerSqm: "112.00" },
    ],
  },
  {
    key: "fr2",
    company: "f9",
    project: "p6",
    rep: "faisal",
    raisedBy: "rawan",
    selfIssued: true,
    status: "accepted",
    contact: 0,
    createdBack: 7,
    issuedBack: 7,
    decidedBack: 5,
    smacNumber: "4563",
    items: [
      { colourCode: "RAL 7016", supplier: "C", fireRating: "A2", className: "A2G1", thickness: "4.0", qty: 90, width: "1.24", length: "5.8", pricePerSqm: "128.00" },
    ],
  },
  {
    key: "sr1",
    company: "s5",
    project: "p10",
    rep: "saad",
    raisedBy: "rawan",
    selfIssued: true,
    status: "issued",
    createdBack: 12,
    issuedBack: 12,
    smacNumber: "4565",
    items: [
      { colourCode: "168", supplier: "K", fireRating: "B1", className: "B", thickness: "4.0", qty: 40, width: "1.5", length: "5.8", pricePerSqm: "104.00" },
    ],
  },
  /*
   * And the other side of the line (rules/data.md: a threshold needs a row on
   * each side of it). Turki, the newest rep, leans on the desk: three of his
   * papers in the window were hers, which is a habit on the reliance card by
   * the rule in src/lib/reliance.ts, where Faisal's and Saad's are occasional.
   */
  {
    key: "tr1",
    company: "t2",
    project: "p12",
    rep: "turki",
    raisedBy: "rawan",
    selfIssued: true,
    status: "accepted",
    createdBack: 13,
    issuedBack: 13,
    decidedBack: 3,
    smacNumber: "4567",
    items: [
      { colourCode: "RAL 9006", supplier: "C", fireRating: "B1", className: "A", thickness: "4.0", qty: 55, width: "1.24", length: "5.8", pricePerSqm: "109.00" },
    ],
  },
  {
    key: "tr3",
    company: "t2",
    project: "p12",
    rep: "turki",
    raisedBy: "rawan",
    selfIssued: true,
    status: "rejected",
    createdBack: 10,
    issuedBack: 10,
    decidedBack: 8,
    smacNumber: "4569",
    decisionReason: "العميل طلب لونًا غير متوفر",
    items: [
      { colourCode: "RAL 3020", supplier: "N", fireRating: "Normal", className: "B", thickness: "4.0", qty: 24, width: "1.24", length: "3.2", pricePerSqm: "96.00" },
    ],
  },
  {
    key: "tr2",
    company: "t1",
    project: "p11",
    rep: "turki",
    raisedBy: "rawan",
    selfIssued: true,
    status: "issued",
    createdBack: 6,
    issuedBack: 6,
    smacNumber: "4571",
    items: [
      { colourCode: "7016", supplier: "K", fireRating: "B1", className: "A", thickness: "4.0", qty: 36, width: "1.24", length: "5.8", pricePerSqm: "107.00" },
    ],
  },
];

// ---- dispatches ---------------------------------------------------------------

export type DispatchSeed = {
  key: string;
  /**
   * The quotation it was prefilled from. Absent is a DIRECT dispatch (SPEC §3,
   * P13): a customer, its own lines with a price on each (D169), and no paper.
   */
  quotation?: string;
  /** A direct dispatch's customer; one against a quotation takes the paper's. */
  company?: string;
  rep: RepKey;
  /** Who pressed the button, where that is not `rep` — as on a quotation (SPEC §3 P13). */
  raisedBy?: RepKey;
  /**
   * Who it counts for (D148). Absent means the rep who raised it, which is the
   * answer for every job one man works; naming two people splits the metres
   * between them in equal parts.
   */
  creditTo?: RepKey[];
  status: "submitted" | "approved" | "refused";
  /** The desk's reason, for a refused one — in her words (S28). */
  refuseReason?: string;
  /** `shipment_methods.code`. */
  shipmentMethod: string;
  /**
   * Which store the load leaves from, by its English name (SPEC §3, P12-9).
   * Absent means the quotation's own — every store on it, where it names more
   * than one — which is what the dialog opens on (P14).
   */
  warehouse?: string;
  /** And the rare second and third it leaves from as well (SPEC §3, P14). */
  alsoFrom?: string[];
  destination: string;
  /**
   * How it is being paid for (SPEC §3, P12-10): the choice, the second answer
   * where the choice asks for one, and the note the two finance reviews need.
   *
   * All three ways to pay are on this floor, and both answers to each of the two
   * questions, because a choice the demo never shows is a choice nobody has
   * seen work (rules/data.md).
   */
  paymentTerms: PaymentTerms;
  paymentDetail?: PaymentDetail;
  paymentNote?: string;
  smacDispatchNumber?: string;
  /** Day of THIS month for `approved_at`, clamped to today. */
  approvedOnDayOfMonth?: number;
  createdBack: number;
  /**
   * Item index into the quotation's `items`, how many of them go now, and a
   * price agreed away from the paper where there was one — which the dispatch
   * then records as a difference, the way the app does (SPEC §3, P13).
   */
  items?: { item: number; qty: number; pricePerSqm?: string }[];
  /** A direct dispatch's lines, numbered 1, 2 … in this order. */
  lines?: QuotationItemSeed[];
  /**
   * A load against a quotation carries every one of its services, as the dialog
   * opens it; this changes one of them, by index into the paper's `services`.
   */
  serviceChanges?: { service: number; sqm?: string; pricePerSqm?: string }[];
  /** A direct dispatch's services, which it types for itself. */
  services?: QuotationServiceSeed[];
};

export const DISPATCHES: DispatchSeed[] = [
  {
    key: "d1",
    quotation: "q4",
    rep: "faisal",
    status: "approved",
    shipmentMethod: "ct",
    destination: "موقع المشروع — طريق الملك فهد، الرياض",
    paymentTerms: "bankTransfer",
    paymentDetail: "partAmount",
    smacDispatchNumber: "8871",
    approvedOnDayOfMonth: 2,
    createdBack: 3,
    items: [
      { item: 0, qty: 50 },
      { item: 1, qty: 40 },
    ],
  },
  {
    key: "d2",
    quotation: "q6",
    rep: "saad",
    status: "approved",
    shipmentMethod: "tt",
    destination: "جدة — حي الشاطئ، بوابة الموقع الشمالية",
    paymentTerms: "credit",
    paymentNote: "تحويل بنكي خلال 30 يومًا من تاريخ التسليم",
    smacDispatchNumber: "8874",
    approvedOnDayOfMonth: 3,
    createdBack: 2,
    items: [{ item: 0, qty: 25 }],
  },
  {
    key: "d3",
    quotation: "q4",
    rep: "faisal",
    status: "submitted",
    shipmentMethod: "cargo",
    destination: "الرياض — مستودع العميل، المصفاة",
    paymentTerms: "cash",
    paymentDetail: "onDelivery",
    createdBack: 0,
    items: [
      { item: 0, qty: 20 },
      { item: 1, qty: 15 },
    ],
  },
  // The state the demo never showed (P11A finding 37, D99): a dispatch the desk
  // refused, with her reason, waiting on the rep the way a returned quotation
  // does. Against Faisal's accepted quotation, raised yesterday and refused this
  // morning; the audit rows carry both instants, and the refusal is one of the
  // two answers that put her figure level with her morning.
  {
    key: "d4",
    quotation: "q4",
    rep: "faisal",
    status: "refused",
    refuseReason: "الكمية المطلوبة أكبر مما تبقّى في عرض السعر — يُراجع البند الثاني ثم يُعاد الطلب.",
    shipmentMethod: "ct",
    destination: "موقع المشروع — طريق الملك فهد، الرياض",
    paymentTerms: "bankTransfer",
    paymentDetail: "fullAmount",
    createdBack: 1,
    items: [{ item: 1, qty: 10 }],
  },
  {
    /*
     * The metres two reps split (D148). Every sheet of q9 goes out at once and
     * the credit rides with it: 151.03 m² becomes 75.51 to Faisal and 75.52 to
     * Saad, the odd hundredth going to the last of them in the fixed order so
     * the two shares add back to the dispatch exactly.
     *
     * Approved this month, so the manager's table, both reps' month cards and
     * the metrics all show a row that is not one person's — which is the only
     * way anybody sees the feature before the pilot.
     */
    key: "d5",
    quotation: "q9",
    rep: "saad",
    creditTo: ["faisal", "saad"],
    status: "approved",
    shipmentMethod: "ct",
    destination: "موقع البرج — طريق الملك فهد، الرياض",
    paymentTerms: "cash",
    paymentDetail: "atOffice",
    smacDispatchNumber: "8877",
    approvedOnDayOfMonth: 4,
    createdBack: 3,
    items: [{ item: 0, qty: 21 }],
  },
  /*
   * Half of her customer's order, out this month: the coordinator's row on the
   * manager's table is figures rather than dashes, and it lands between the
   * bands rather than at either end of them.
   */
  {
    key: "d6",
    quotation: "q10",
    rep: "rawan",
    status: "approved",
    shipmentMethod: "ct",
    destination: "الرياض — طريق الخرج، موقع المعرض",
    // Credit and tasaheel are one option (SPEC §3, P13); the words say which.
    paymentTerms: "credit",
    paymentNote: "تمويل عبر تساهيل، الدفعة الأولى عند التوقيع",
    smacDispatchNumber: "8879",
    approvedOnDayOfMonth: 5,
    createdBack: 2,
    items: [{ item: 0, qty: 30 }],
  },
  /*
   * The load that is not what its paper said (SPEC §3, P13), waiting on the desk:
   * the first line at 112 where q11 says 118, the CNC cutting over 60 m² where
   * it says 120, and the whole load out of Malham where the paper named Riyadh
   * and Malham (P14). Three differences, recorded; the second line and the
   * fabrication are simply not in this load, which is a partial load and not a
   * difference at all.
   */
  {
    key: "d7",
    quotation: "q11",
    rep: "faisal",
    status: "submitted",
    // Out of Malham alone, where the paper named Riyadh and Malham: the third
    // thing this load differs from its paper by, and the one the founder asked
    // the flag to start saying (SPEC §3, P14).
    warehouse: "Malham",
    shipmentMethod: "tt",
    destination: "الرياض — طريق الملك عبدالله، موقع المعرض",
    paymentTerms: "bankTransfer",
    paymentDetail: "partAmount",
    createdBack: 1,
    items: [{ item: 0, qty: 40, pricePerSqm: "112.00" }],
    serviceChanges: [{ service: 0, sqm: "60.00" }],
  },
  /*
   * Direct, and approved: a sign-maker buying ten sheets to cut up, with no
   * quotation and no job behind it (SPEC §3, P13). Its metres count for Faisal
   * through the dispatch's own customer, and every list says "Direct" where a
   * quotation number would be.
   */
  {
    key: "d8",
    company: "f4",
    rep: "faisal",
    status: "approved",
    // Ten sheets, and the last two came off the rack in Malham: the load out of
    // two stores, on the one kind of load where that says nothing about a paper
    // (SPEC §3, P14). A field the demo never shows filled is a field nobody has
    // seen work (rules/data.md).
    alsoFrom: ["Malham"],
    shipmentMethod: "cargo",
    destination: "الرياض — حي السلي، ورشة المؤسسة",
    paymentTerms: "cash",
    paymentDetail: "atOffice",
    smacDispatchNumber: "8883",
    approvedOnDayOfMonth: 6,
    createdBack: 4,
    lines: [
      { colourCode: "RAL 9010", supplier: "N", fireRating: "B1", className: "A", thickness: "4.0", qty: 10, width: "1.24", length: "5.8", pricePerSqm: "125.00" },
    ],
  },
  /*
   * Direct, and waiting on the desk — with a service of its own, typed for this
   * load, so a direct dispatch's services section is on a screen too.
   */
  {
    key: "d9",
    company: "f12",
    rep: "faisal",
    status: "submitted",
    shipmentMethod: "ct",
    destination: "الدرعية — موقع مؤسسة ركائز البناء",
    paymentTerms: "credit",
    paymentNote: "تساهيل — ثلاث دفعات شهرية بعد التسليم",
    createdBack: 0,
    lines: [
      { colourCode: "7016", supplier: "K", fireRating: "Normal", className: "B", thickness: "4.0", qty: 6, width: "1.5", length: "3.2", pricePerSqm: "99.00" },
    ],
    services: [{ service: "CNC cutting", sqm: "12.00", pricePerSqm: "25.00" }],
  },
  /*
   * Marketing's load, approved this month (SPEC §3 P13, D168): thirty of fifty
   * sheets of qm1, 215.76 m², counted to marketing exactly as a rep's would be.
   */
  {
    key: "dm1",
    quotation: "qm1",
    rep: "marketing",
    status: "approved",
    shipmentMethod: "ct",
    destination: "الرياض — العليا، موقع المبنى الإداري",
    paymentTerms: "bankTransfer",
    paymentDetail: "fullAmount",
    smacDispatchNumber: "8886",
    approvedOnDayOfMonth: 7,
    createdBack: 4,
    items: [{ item: 0, qty: 30 }],
  },
  /*
   * A load the coordinator raised for Faisal against the paper she raised for
   * him (SPEC §3 P13): waiting on her own desk like any other, counted for him,
   * with her name as the raiser. Not raised today, so the desk's "arrived today"
   * says what it said before.
   */
  {
    key: "fd1",
    quotation: "fr2",
    rep: "faisal",
    raisedBy: "rawan",
    status: "submitted",
    shipmentMethod: "ct",
    destination: "الخرج — المحطة الثالثة",
    paymentTerms: "bankTransfer",
    paymentDetail: "fullAmount",
    createdBack: 2,
    items: [{ item: 0, qty: 30 }],
  },
];

// ---- the months before this one ------------------------------------------------

/*
 * Business that already happened (D61).
 *
 * Every month before the current one was empty in this dataset, so the moment a
 * screen showed a month before this one it showed five empty bars and one full
 * one — and nobody would ever have seen the feature work (rules/data.md). These
 * are the metres each rep actually moved in each of the five months behind us.
 *
 * One accepted quotation and one approved dispatch per entry, all of it inside
 * that month, so the history is made of the same records the current month is
 * made of rather than of numbers written into a table. Every figure on every
 * screen reads it the same way it reads today's.
 *
 * The shape says something on purpose: Faisal and Saad trade the lead month to
 * month, and Turki appears only in the last two — he is the newest rep, and a
 * bar chart that starts him at zero is telling the truth about that.
 */
export type HistorySeed = {
  /** Calendar months back from this one. 1 is last month. */
  monthsBack: number;
  rep: RepKey;
  company: string;
  /** The job it was for — every quotation belongs to one (S18, P12-10). */
  project: string;
  /** Sheets of 1.24 × 5.80 m. The m² is computed the way the app computes it. */
  sheets: number;
};

export const HISTORY: HistorySeed[] = [
  { monthsBack: 5, rep: "faisal", company: "f2", project: "p2", sheets: 150 },
  { monthsBack: 5, rep: "saad", company: "s1", project: "p8", sheets: 120 },
  { monthsBack: 4, rep: "faisal", company: "f6", project: "p5", sheets: 170 },
  { monthsBack: 4, rep: "saad", company: "s5", project: "p10", sheets: 140 },
  { monthsBack: 3, rep: "faisal", company: "f2", project: "p2", sheets: 120 },
  { monthsBack: 3, rep: "saad", company: "s1", project: "p8", sheets: 190 },
  // The last two months sell to five kinds of customer rather than one, and the
  // sheets are untouched: every rep's month, every bar on the six-month card and
  // every pace band is exactly what it was. What changes is WHOSE they are.
  //
  // Before this, every approved metre in the quarter but one had gone to a
  // contractor, so the metrics tab's "where the metres went" — the founder's own
  // question, and the reason that card exists — drew two bars, one of them 96%.
  // A card whose shape the demo never shows is a card nobody has seen work
  // (rules/data.md), and a business that sells to stations, consultants,
  // factories and sign-makers as well as contractors is also the truer picture
  // of this floor. Each row stays on a company its own rep holds.
  { monthsBack: 2, rep: "faisal", company: "f9", project: "p6", sheets: 200 },
  { monthsBack: 2, rep: "saad", company: "s5", project: "p10", sheets: 160 },
  { monthsBack: 2, rep: "turki", company: "t1", project: "p11", sheets: 60 },
  { monthsBack: 1, rep: "faisal", company: "f2", project: "p2", sheets: 185 },
  { monthsBack: 1, rep: "saad", company: "s3", project: "h1", sheets: 210 },
  { monthsBack: 1, rep: "turki", company: "t3", project: "h2", sheets: 95 },
];

/*
 * And the ones that did not land (D62).
 *
 * The history above is twelve quotations that were all accepted, which made the
 * "where do quotations die" cohort read 63% won — a number no cladding business
 * has ever had, and a funnel with one fat stage is a funnel nobody learns
 * anything from. These raise the denominator the way real ones do: a customer
 * who said no, one who never answered, a request the rep took back, and one the
 * coordinator sent back that was never asked again. None of them carries a
 * dispatch, so none of them moves a metre and the month bars are unchanged.
 */
export type LostSeed = {
  monthsBack: number;
  rep: RepKey;
  company: string;
  /** The job it was for — every quotation belongs to one (S18, P12-10). */
  project: string;
  sheets: number;
  status: "rejected" | "cancelled" | "returned" | "issued";
  reason?: string;
};

export const HISTORY_LOST: LostSeed[] = [
  {
    monthsBack: 4,
    rep: "faisal",
    company: "f5",
    project: "p4",
    sheets: 90,
    status: "rejected",
    reason: "السعر أعلى من عرض منافس بحوالي 8%",
  },
  {
    monthsBack: 3,
    rep: "saad",
    company: "s4",
    project: "p9",
    sheets: 130,
    status: "rejected",
    reason: "أجّل العميل المشروع إلى السنة القادمة",
  },
  { monthsBack: 3, rep: "faisal", company: "f11", project: "h3", sheets: 60, status: "cancelled" },
  { monthsBack: 2, rep: "turki", company: "t5", project: "h4", sheets: 110, status: "issued" },
  {
    monthsBack: 2,
    rep: "saad",
    company: "s8",
    project: "h5",
    sheets: 75,
    status: "returned",
    reason: "المقاسات غير مكتملة — أحتاج الطول والعرض لكل بند",
  },
  {
    monthsBack: 1,
    rep: "faisal",
    company: "f9",
    project: "p6",
    sheets: 140,
    status: "rejected",
    reason: "اختار العميل مورّدًا آخر بمدة تسليم أقصر",
  },
  { monthsBack: 1, rep: "turki", company: "t1", project: "p11", sheets: 80, status: "issued" },
  { monthsBack: 1, rep: "saad", company: "s6", project: "h6", sheets: 45, status: "cancelled" },
];

/** The one line every history quotation carries. */
export const HISTORY_ITEM = {
  colourCode: "RAL 9006",
  supplier: "N",
  fireRating: "B1",
  className: "A",
  thickness: "4.0",
  width: "1.24",
  length: "5.8",
  pricePerSqm: "108.00",
};

// ---- targets ------------------------------------------------------------------

/** m² per rep, this month and last (SPEC §1: no personal target above rep). */
export const REP_TARGET_THIS_MONTH = "1500.00";
export const REP_TARGET_LAST_MONTH = "1200.00";
/*
 * And the coordinator's own, which SPEC §3 gave her: a fraction of a rep's,
 * because selling is the smaller half of her day and a target she could never
 * meet is a number that says the wrong thing every month.
 */
export const DESK_TARGET_THIS_MONTH = "400.00";
export const DESK_TARGET_LAST_MONTH = "320.00";
/*
 * And marketing's, since SPEC §3 P13 made it a rep in everything (D168): its own
 * box, a fraction of a rep's for the reason the desk's is — finding customers
 * and handing them on is still most of its day.
 */
export const MARKETING_TARGET_THIS_MONTH = "500.00";
export const MARKETING_TARGET_LAST_MONTH = "400.00";
// Near what the floor actually approves, and not above all six months of it.
// At 4,500 every finished month on the manager's card was the same red, so the
// amber and the green bands existed in the code and nowhere a person could see
// them — the same defect as a figure that is always zero (D66).
export const COMPANY_TARGET_THIS_MONTH = "3200.00";
export const COMPANY_TARGET_LAST_MONTH = "2600.00";

/*
 * The earlier months are read on the admin's targets screen, a month to a row
 * and a person to a column (SPEC §3 P13), and a history in which everybody had
 * the same figure every month is a table nobody has seen do its two jobs: a
 * dash where somebody had no target, and a column for somebody who no longer
 * carries metres (rules/data.md: every band gets a row on the wrong side of it).
 */

/** Months ago of each person's FIRST target, where it is not the oldest month seeded. */
export const FIRST_TARGET_MONTHS_AGO: Partial<Record<RepKey, number>> = {
  // Turki was added in a hurry (no Arabic name) and had no number in the month
  // he started, so the oldest month shows his dash.
  turki: 4,
};

/**
 * Who is support this month, and not sales (P14, founder: "a rep with no target
 * is support, not sales: they may raise work without it counting").
 *
 * A rule with nobody on the wrong side of it is a rule nobody has seen work
 * (rules/data.md). Turki has no target this month: he is covering the floor
 * while the others sell, so the manager's table shows his dash, a paper raised
 * for him says in words that it counts for nobody, and the tick on the admin's
 * targets screen is the one press that changes it back.
 *
 * His earlier months keep their figures — he was selling then — and so do the
 * metres already credited to him on papers raised before today.
 */
export const SUPPORT_THIS_MONTH: RepKey[] = ["turki"];

/**
 * A rep who has left. His account is deactivated, never deleted (S7), so the
 * months he was measured against keep his name in the history — while the
 * boxes for this month, which list only people who carry metres now, have none
 * for him. Not one of README's seven: nobody signs in as him.
 */
export const FORMER_REP: UserSeed = {
  key: "hamad",
  name: "Hamad Al-Enezi",
  nameAr: "حمد العنزي",
  email: "hamad@technopanel.com.sa",
  role: "rep",
  locale: "en",
  lastSeenDaysAgo: 68,
};
/** The months ago he carried a target: the three before he left. */
export const FORMER_REP_TARGET_MONTHS_AGO = [3, 4, 5];

// ---- notifications ------------------------------------------------------------

export type NotificationSeed = {
  user: string;
  /** One of the real kinds — the vocabulary is src/lib/notify.ts, not a string. */
  kind: NotificationKind;
  /** The quotation whose id goes into the link and whose subject column it is. */
  quotation: string;
  params: Record<string, string | number>;
  /**
   * Whose name goes in the sentence, as a person rather than as a word: the
   * screen names him in the reader's script at read time (D68, D79), so the row
   * carries the key and never the name.
   */
  rep?: string;
  /** `?open=` is appended with the quotation's id. */
  linkBase: string;
  read: boolean;
  /** Working days back for `created_at`. */
  back: number;
};

export const NOTIFICATIONS: NotificationSeed[] = [
  /*
   * Every one of these is still TRUE of the quotation it is about, and that is
   * now a rule rather than a coincidence: a notice is cleared by the transition
   * that settles it, so a dataset carrying one about a request already answered
   * would be showing a row the app promises cannot exist (D79). There was one —
   * "Q-4 is issued" against a quotation the customer had accepted two days
   * earlier — and it is the acceptance below instead.
   */
  {
    user: "rawan",
    kind: "quotationRequested",
    quotation: "q1",
    params: { label: "Q-1" },
    rep: "faisal",
    linkBase: "/queue",
    read: false,
    // The same four working days as the request it is about: a notice dated
    // after the thing it announces is a small lie the seed has no reason to tell.
    back: 4,
  },
  {
    user: "rawan",
    kind: "quotationRequested",
    quotation: "q3r2",
    params: { label: "Q-3/2" },
    rep: "faisal",
    linkBase: "/queue",
    read: false,
    back: 0,
  },
  {
    user: "faisal",
    kind: "quotationIssued",
    quotation: "q3",
    params: { label: "Q-3", smacNumber: "4512" },
    linkBase: "/quotations",
    // Read, and still on his screen: it is waiting on the customer, and work
    // that is still open does not leave because somebody has looked at it (D79).
    read: true,
    back: 6,
  },
  {
    // The other half of the same rule. Q-2 is sent back and still sent back, so
    // this is the row the rep clears by fixing it rather than by reading it —
    // the case the demo had no example of at all.
    user: "faisal",
    kind: "quotationReturned",
    quotation: "q2",
    params: {
      label: "Q-2",
      reason: "الكمية لا تغطي الواجهة في المخطط — راجع الكشف مع الاستشاري",
    },
    linkBase: "/quotations",
    read: false,
    back: 3,
  },
  {
    // A finished fact, which is the kind that goes when it is read: there is
    // nothing at the end of it to do, and the quotation it names is accepted.
    user: "rawan",
    kind: "quotationAccepted",
    quotation: "q4",
    params: { label: "Q-4" },
    linkBase: "/quotations",
    read: false,
    back: 6,
  },
];

// ---- non-working days ---------------------------------------------------------

/*
 * A note on a day off is free text, typed by whoever entered it — the app shows
 * it as written and never translates it, the same as a company's name or a
 * rep's log entry. So the demo writes what a Riyadh admin would actually type,
 * which is Arabic. Seeding English made every Arabic screenshot of the holidays
 * screen look like a missing translation when nothing was missing.
 */
export const HOLIDAY_NOTE = "اليوم الوطني";
export const LEAVE_NOTE = "إجازة سنوية";
/**
 * Day of next month the company holiday falls on — or the first working day
 * after it, which the seed decides, for the reason Saad's leave does (D75): the
 * twenty-third is a Friday one year in seven, and a holiday on a Friday costs
 * the office nothing. The screen and the leave file would then both say it is
 * worth nought working days, which is a figure nobody has ever seen work
 * (rules/data.md), and the fortnight it sits inside would quietly stop being a
 * fortnight with a holiday in it.
 */
export const HOLIDAY_DAY_OF_MONTH = 23;
/** Calendar days from today for Turki's leave — a day still ahead of us. */
export const LEAVE_DAYS_AHEAD = 7;

/*
 * And Saad is away TODAY, for three working days.
 *
 * Leave was in this dataset from the beginning and always in the future, so
 * every screen that knows about it — the pace arithmetic, the daily report's
 * "off" state, and from P9.6e the team row and the manager's uncovered band —
 * has been showing the same thing every day since P6: nobody is ever away. A
 * state the demo never reaches is a state nobody has seen work (rules/data.md).
 *
 * Saad because his floor has work falling due while he is out: one follow-up a
 * day old and one due in two days, so the manager's screen has something on it
 * to cover rather than an empty heading. It also puts leave inside somebody's
 * current month, which is what the per-person pace was built for and had never
 * been given.
 */
export const AWAY_REP: RepKey = "saad";
export const AWAY_WORKING_DAYS = 3;

/*
 * And Turki takes a fortnight next month.
 *
 * Leave is stored a row a day and read as a period (P14, D210), and the longest
 * stretch this floor had was Saad's three days — so the screen that groups them
 * had never grouped more than three, and the sentence the founder asked for
 * ("thirty days off is one entry with its dates and its length") was a sentence
 * about a state the demo never reached. Fourteen calendar days from the twelfth:
 * two weekends inside it, and the company holiday inside it as well, so the
 * entry reads nine working days rather than fourteen and the one arithmetic
 * nobody would check by hand is on a screen somebody has looked at
 * (rules/data.md).
 */
export const FORTNIGHT_REP: RepKey = "turki";
export const FORTNIGHT_START_DAY_OF_MONTH = 12;
export const FORTNIGHT_CALENDAR_DAYS = 14;
