import type { NotificationKind } from "../../src/lib/notify";

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

export type RepKey = "faisal" | "saad" | "turki" | "marketing";
export type Channel = "visit" | "call" | "whatsapp" | "other";

// ---- users -------------------------------------------------------------------

export type UserSeed = {
  key: string;
  name: string;
  email: string;
  role: "rep" | "marketing" | "coordinator" | "manager" | "admin";
  locale: "en" | "ar";
};

/**
 * The seven from README.md. Rawan and marketing read Arabic; the rest English.
 *
 * Marketing is a role account rather than a person, because Jerom has not named
 * who holds it (SPEC §1, D50). It owns two leads and no target: what it exists
 * to do is find a customer and hand him to a rep.
 */
export const USERS: UserSeed[] = [
  { key: "jerom", name: "Jerom", email: "jerom@technopanel.com.sa", role: "admin", locale: "en" },
  {
    key: "abdulrahman",
    name: "Abdulrahman Al-Zahrani",
    email: "abdulrahman@technopanel.com.sa",
    role: "manager",
    locale: "en",
  },
  { key: "rawan", name: "Rawan", email: "rawan@technopanel.com.sa", role: "coordinator", locale: "ar" },
  { key: "faisal", name: "Faisal Al-Harbi", email: "faisal@technopanel.com.sa", role: "rep", locale: "en" },
  { key: "saad", name: "Saad Al-Qahtani", email: "saad@technopanel.com.sa", role: "rep", locale: "en" },
  { key: "turki", name: "Turki Al-Shammari", email: "turki@technopanel.com.sa", role: "rep", locale: "en" },
  {
    key: "marketing",
    name: "Marketing",
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
  /** The first one is the main contact (SPEC D18). */
  contacts: ContactSeed[];
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
      { name: "سعود المطرفي", phone: "0551204477", position: "Procurement", email: "s.almutarfi@example.sa" },
      { name: "م. خالد الدوسري", phone: "055 331 8842", position: "Engineer" },
    ],
  },
  {
    key: "f2",
    name: "شركة أنماء للمقاولات",
    rep: "faisal",
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
    contacts: [
      { name: "Ziad Nassar", phone: "0566712093", position: "General manager", email: "ziad@example.com" },
      { name: "Hassan Odeh", phone: "0561120934", position: "Procurement" },
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
    ],
  },
  {
    key: "f7",
    name: "مصنع نجد للكلادينج",
    rep: "faisal",
    category: "Factory",
    source: "Direct contact",
    city: "Riyadh",
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

  // ---- Marketing — leads waiting to be handed to a rep (2) -------------------
  {
    key: "m1",
    name: "شركة واجهات الرياض للمقاولات",
    rep: "marketing",
    category: "Contractor",
    source: "Exhibition",
    city: "Riyadh",
    notes: "من معرض البناء، طلبوا كتالوج وأسعار",
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
    notes: "وصلت من الموقع، لم يتم التواصل بعد",
    contacts: [{ name: "ماجد الزهراني", phone: "0501129983", position: "Owner" }],
  },
];

// ---- projects -----------------------------------------------------------------

export type ProjectSeed = {
  key: string;
  company: string;
  name: string;
  /** numeric(12,2) — a string, always, so nothing rounds on the way in. */
  expectedSqm: string;
  notes?: string;
};

export const PROJECTS: ProjectSeed[] = [
  { key: "p1", company: "f1", name: "واجهة مبنى الإدارة", expectedSqm: "480.00" },
  {
    key: "p2",
    company: "f2",
    name: "برج مكاتب طريق الملك فهد",
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
];

// ---- the log ------------------------------------------------------------------

export type ActivitySeed = {
  company: string;
  project?: string;
  /** Index into the company's `contacts`. */
  contact?: number;
  text: string;
  channel: Channel;
  /** Working days back from today; 0 is the most recent working day. */
  back: number;
  /** Put it on the weekend day just before that working day instead. */
  onWeekend?: boolean;
  /**
   * Calendar days from today. Set ONLY on a company's newest entry, and only
   * where it equals what that company carries in `next_follow_up` — a log entry
   * is one of the two things that sets it (SPEC D9), and two different answers
   * on one company is the drift trap.
   */
  followUpDays?: number;
};

export const ACTIVITIES: ActivitySeed[] = [
  // Faisal — 22
  { company: "f1", project: "p1", contact: 0, channel: "visit", back: 5, text: "زيارة المصنع، شفنا الواجهة الحالية وأخذنا المقاسات" },
  { company: "f1", contact: 0, channel: "whatsapp", back: 2, text: "أرسلت له كتالوج الألوان، اختار 168 فضي" },
  { company: "f1", project: "p1", contact: 0, channel: "visit", back: 0, followUpDays: 0, text: "زيارة الموقع، طلب عينات 4 مم لون 168" },

  { company: "f2", contact: 0, channel: "call", back: 9, text: "اتصال مع مدير المشاريع، عندهم برج مكاتب على طريق الملك فهد" },
  { company: "f2", project: "p2", contact: 1, channel: "visit", back: 6, followUpDays: -4, text: "زيارة المكتب، طلبوا عرض سعر للواجهة، 2,400 متر تقريباً" },

  { company: "f3", contact: 0, channel: "visit", back: 3, text: "زيارة المكتب الاستشاري، اعتمدوا مواصفة A2 للمشاريع الحكومية" },

  { company: "f4", contact: 0, channel: "whatsapp", back: 12, text: "طلب لوحات إعلانية 3 مم، ما عندنا، عرضت عليه 4 مم" },
  { company: "f4", contact: 0, channel: "call", back: 6, text: "ما رد، أعيد الاتصال الأسبوع الجاي" },

  { company: "f5", project: "p4", channel: "other", back: 8, text: "Met them at the exhibition stand, they are building their HQ in Riyadh" },
  { company: "f5", project: "p4", contact: 0, channel: "call", back: 3, text: "Called Ziad, walked him through the HQ quotation" },
  { company: "f5", contact: 0, channel: "whatsapp", back: 1, followUpDays: 3, text: "Sent catalogue, waiting for the consultant" },

  { company: "f6", project: "p5", contact: 0, channel: "visit", back: 10, text: "زيارة الخرج، مجمع سكني حي الياسمين، 1,850 متر" },
  { company: "f6", contact: 0, channel: "call", back: 4, text: "العميل قال السعر مرتفع مقارنة بعرض ثاني" },

  { company: "f7", project: "p7", contact: 0, channel: "visit", back: 9, text: "زيارة المصنع، معرض سيارات جديد على الدائري الشرقي" },
  { company: "f7", contact: 0, channel: "whatsapp", back: 2, text: "أرسلت له مقاسات الألواح المتوفرة" },

  { company: "f8", contact: 0, channel: "whatsapp", back: 7, text: "طلب أسعار ألواح 4 مم للتشكيل، كمية صغيرة" },
  { company: "f8", contact: 0, channel: "call", back: 2, followUpDays: 9, text: "رجعت له، قال ينتظر موافقة صاحب الورشة" },

  { company: "f9", project: "p6", contact: 0, channel: "visit", back: 11, text: "اجتماع مع إدارة المحطات، عندهم ست محطات على طريق الخرج" },
  { company: "f9", project: "p6", contact: 2, channel: "call", back: 5, text: "طلبوا جدول تنفيذ لكل محطة على حدة" },

  { company: "f10", contact: 0, channel: "call", back: 13, text: "اتصال أول، عندهم مشروع سكني بعد شهرين" },

  { company: "f11", contact: 0, channel: "other", back: 4, text: "Came through the website form, asked for the 4 mm price list" },

  { company: "f12", contact: 0, channel: "call", back: 7, onWeekend: true, text: "اتصل يوم الجمعة، يبي عرض سعر مستعجل للدرعية" },

  // Saad — 11
  { company: "s1", project: "p8", contact: 0, channel: "visit", back: 10, text: "زيارة جدة، برج الكورنيش التجاري، 4,200 متر" },
  { company: "s1", contact: 0, channel: "call", back: 6, text: "تم إصدار عرض السعر وأرسلته للعميل" },
  { company: "s1", project: "p8", contact: 1, channel: "visit", back: 1, followUpDays: 2, text: "العميل وافق على العرض، بديت أرتب التوريد" },

  { company: "s2", contact: 0, channel: "whatsapp", back: 8, text: "طلب أسعار 5 مم كمية 300 متر" },
  { company: "s2", contact: 0, channel: "call", back: 3, text: "ينتظر موافقة الإدارة على الكمية" },

  { company: "s3", contact: 0, channel: "visit", back: 5, text: "زيارة المكتب، عرضنا المواصفات الفنية والشهادات" },

  { company: "s4", project: "p9", contact: 0, channel: "other", back: 9, text: "Met at the Jeddah expo, they asked about the retail podium" },
  { company: "s4", contact: 1, channel: "call", back: 2, followUpDays: 6, text: "Sent the technical datasheet, waiting for their reply" },

  { company: "s5", project: "p10", contact: 0, channel: "whatsapp", back: 4, text: "توسعة فندق العزيزية، طلبوا عرض للواجهة الخارجية" },

  { company: "s6", contact: 0, channel: "call", back: 12, text: "اتصال تعريفي، ما عندهم مشاريع حالياً" },

  { company: "s7", contact: 0, channel: "whatsapp", back: 3, onWeekend: true, text: "راسلني السبت، يبي كتالوج الألوان" },

  // Turki — 7
  { company: "t1", project: "p11", contact: 0, channel: "visit", back: 7, text: "زيارة الدمام، مبنى مكاتب 760 متر" },
  { company: "t1", contact: 0, channel: "call", back: 2, followUpDays: 4, text: "طلب عرض سعر بلونين، 168 و1020" },
  // Overdue on purpose: marketing's day is the call list, and a screen with
  // nothing on it shows nothing about the role (P8.9).
  { company: "m1", contact: 0, channel: "call", back: 4, followUpDays: -2, text: "اتصلت بهم بعد المعرض، مهتمين بواجهة مشروع في الملقا" },

  { company: "t2", project: "p12", contact: 0, channel: "visit", back: 11, text: "زيارة الخبر، مركز تجاري كبير، الاستشاري يطلب A2" },
  { company: "t2", contact: 1, channel: "whatsapp", back: 5, text: "أرسلت شهادات مقاومة الحريق" },

  { company: "t3", contact: 0, channel: "call", back: 3, text: "طلب ألواح للوحات محلات، الكمية 40 متر" },

  { company: "t4", contact: 0, channel: "whatsapp", back: 8, text: "عميل شخصي، يبي يكسي واجهة استراحة" },

  { company: "t5", contact: 0, channel: "other", back: 6, onWeekend: true, text: "Enquiry from the Cairo office, asked about export pricing" },
];

// ---- follow-ups ---------------------------------------------------------------
// Faisal's six are the shape the rep home is built to show: exactly two overdue,
// one due today, three still ahead. Every value here is calendar days from today.

export type FollowUpSeed = { company?: string; project?: string; days: number };

export const FOLLOW_UPS: FollowUpSeed[] = [
  // Faisal — 2 overdue
  { company: "f2", days: -4 },
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

export type QuotationSeed = {
  key: string;
  company: string;
  project?: string;
  rep: RepKey;
  status: "requested" | "returned" | "issued" | "accepted" | "rejected";
  notes?: string;
  smacNumber?: string;
  returnReason?: string;
  decisionReason?: string;
  /** Working days back from today for `issued_at` / `decided_at`. */
  issuedBack?: number;
  decidedBack?: number;
  /** Working days back for `created_at`. */
  createdBack: number;
  /** A revision copies the parent's number and its lines (SPEC D10). */
  revisionOf?: string;
  revision?: number;
  items: QuotationItemSeed[];
};

export const QUOTATIONS: QuotationSeed[] = [
  {
    key: "q1",
    company: "f2",
    project: "p2",
    rep: "faisal",
    status: "requested",
    createdBack: 1,
    notes: "العميل مستعجل، الواجهة الرئيسية فقط في هذه المرحلة",
    items: [
      { colourCode: "168", supplier: "N", fireRating: "B1", className: "A", thickness: "4.0", qty: 90, width: "1.24", length: "5.8", pricePerSqm: "112.00" },
      { colourCode: "1020", supplier: "N", fireRating: "B1", className: "A", thickness: "4.0", qty: 35, width: "1.5", length: "3.2", pricePerSqm: "118.00" },
    ],
  },
  {
    key: "q2",
    company: "f8",
    rep: "faisal",
    status: "returned",
    createdBack: 4,
    returnReason: "المقاسات ناقصة — أحتاج الطول والعرض لكل بند قبل الإصدار",
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
    createdBack: 7,
    issuedBack: 6,
    smacNumber: "4512",
    notes: "Consultant asked for A2 on every elevation",
    items: [
      { colourCode: "168", supplier: "C", fireRating: "A2", className: "A2G1", thickness: "4.0", qty: 120, width: "1.24", length: "5.8", pricePerSqm: "134.00" },
      { colourCode: "1020", supplier: "C", fireRating: "A2", className: "A2G1", thickness: "4.0", qty: 60, width: "1.5", length: "5.8", pricePerSqm: "136.00" },
      { colourCode: "RAL 9016", supplier: "C", fireRating: "A2", className: "A2G2", thickness: "5.0", qty: 25, width: "2.0", length: "3.2", pricePerSqm: "140.00" },
    ],
  },
  {
    key: "q4",
    company: "f1",
    project: "p1",
    rep: "faisal",
    status: "accepted",
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
  },
  {
    // Saad's, so his approved dispatch below hangs off his own company.
    key: "q6",
    company: "s1",
    project: "p8",
    rep: "saad",
    status: "accepted",
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
    key: "q7",
    company: "f3",
    project: "p3",
    rep: "faisal",
    status: "issued",
    createdBack: 5,
    issuedBack: 3,
    smacNumber: "4531",
    items: [
      { colourCode: "168", supplier: "N", fireRating: "B1", className: "A", thickness: "4.0", qty: 100, width: "1.24", length: "5.8", pricePerSqm: "121.00" },
      { colourCode: "RAL 9016", supplier: "K", fireRating: "Normal", className: "B", thickness: "4.0", qty: 40, width: "1.5", length: "3.2", pricePerSqm: "104.00" },
    ],
  },
];

// ---- dispatches ---------------------------------------------------------------

export type DispatchSeed = {
  key: string;
  quotation: string;
  rep: RepKey;
  status: "submitted" | "approved";
  /** `shipment_methods.code`. */
  shipmentMethod: string;
  destination: string;
  paymentTerms: string;
  smacDispatchNumber?: string;
  /** Day of THIS month for `approved_at`, clamped to today. */
  approvedOnDayOfMonth?: number;
  createdBack: number;
  /** Item index into the quotation's `items`, and how many of them go now. */
  items: { item: number; qty: number }[];
};

export const DISPATCHES: DispatchSeed[] = [
  {
    key: "d1",
    quotation: "q4",
    rep: "faisal",
    status: "approved",
    shipmentMethod: "ct",
    destination: "موقع المشروع — طريق الملك فهد، الرياض",
    paymentTerms: "50% مقدم والباقي عند التسليم",
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
    paymentTerms: "تحويل بنكي خلال 30 يوم من تاريخ التسليم",
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
    paymentTerms: "نقداً عند الاستلام",
    createdBack: 0,
    items: [
      { item: 0, qty: 20 },
      { item: 1, qty: 15 },
    ],
  },
];

// ---- targets ------------------------------------------------------------------

/** m² per rep, this month and last (SPEC §1: no personal target above rep). */
export const REP_TARGET_THIS_MONTH = "1500.00";
export const REP_TARGET_LAST_MONTH = "1200.00";
export const COMPANY_TARGET_THIS_MONTH = "5000.00";
export const COMPANY_TARGET_LAST_MONTH = "4500.00";

// ---- notifications ------------------------------------------------------------

export type NotificationSeed = {
  user: string;
  /** One of the real kinds — the vocabulary is src/lib/notify.ts, not a string. */
  kind: NotificationKind;
  /** The quotation whose id goes into the link and whose label goes into params. */
  quotation: string;
  params: Record<string, string | number>;
  /** `?open=` is appended with the quotation's id. */
  linkBase: string;
  read: boolean;
  /** Working days back for `created_at`. */
  back: number;
};

export const NOTIFICATIONS: NotificationSeed[] = [
  {
    user: "rawan",
    kind: "quotationRequested",
    quotation: "q1",
    params: { label: "Q-1", rep: "Faisal Al-Harbi" },
    linkBase: "/queue",
    read: false,
    back: 1,
  },
  {
    user: "rawan",
    kind: "quotationRequested",
    quotation: "q3r2",
    params: { label: "Q-3/2", rep: "Faisal Al-Harbi" },
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
    read: true,
    back: 6,
  },
  {
    user: "faisal",
    kind: "quotationIssued",
    quotation: "q4",
    params: { label: "Q-4", smacNumber: "4519" },
    linkBase: "/quotations",
    read: false,
    back: 8,
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
/** Day of next month the company holiday falls on. */
export const HOLIDAY_DAY_OF_MONTH = 23;
/** Calendar days from today for Turki's leave. */
export const LEAVE_DAYS_AHEAD = 7;
