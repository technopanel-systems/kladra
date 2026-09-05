/**
 * `npx tsx scripts/seed-volume.ts` — the demo dataset at the founder's scale.
 *
 * Development only, and NOT a feature: it runs AFTER `npm run seed:demo` and
 * adds rows on top of it, so the twelve companies every screenshot was taken of
 * are still there, still first, still saying what they said. What it adds is
 * everything behind them — the eight hundred a real floor carries, the projects
 * and quotations and dispatches those companies would have raised, and the
 * follow-ups that make a day screen look like a day rather than a demo.
 *
 * Why it exists: every cap in this app (D80) bites at twenty, twenty-five or two
 * hundred rows, and the seeded floor is twelve — so the lists, the bands, the
 * stuck groups and the line that says what was left out have never once been
 * seen doing their job. Neither has anything else at this size. The pilot in
 * WORKFLOW §0 is a run through the acceptance scripts at volumes the founder
 * would recognise, and this is what makes those volumes.
 *
 * Everything is written relative to Riyadh's today, like the demo seed, so a
 * floor generated last week still reads as a floor being worked this week.
 */
import { sql } from "drizzle-orm";
import { loadEnv } from "../src/lib/env";
import { addDays, todayRiyadh, type Day } from "../src/lib/dates";
import { normalizePhone } from "../src/lib/phone";

loadEnv();

const { db } = await import("../src/db");
const {
  activities,
  companies,
  contacts,
  dispatchItems,
  dispatches,
  projects,
  quotationItems,
  quotations,
  users,
} = await import("../src/db/schema");

/** How much of each: about a year of a floor this size. */
const COMPANY_COUNT = 800;
const PROJECT_COUNT = 420;
const QUOTATION_COUNT = 320;
const DISPATCH_COUNT = 240;

/** Deterministic, so two runs of the pilot are the same pilot. */
let seed = 20260905;
function rand(): number {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
}
const pick = <T,>(list: readonly T[]): T => list[Math.floor(rand() * list.length)];
const between = (low: number, high: number) => low + Math.floor(rand() * (high - low + 1));

const FIRST = ["شركة", "مؤسسة", "مجموعة"];
const MIDDLE = [
  "الواجهات",
  "البناء",
  "الإنشاء",
  "المقاولات",
  "التطوير",
  "الديكور",
  "الهندسة",
  "التشييد",
  "الأنظمة",
  "المعمار",
];
const LAST = [
  "الحديثة",
  "المتقدمة",
  "الوطنية",
  "العالمية",
  "الخليجية",
  "الأولى",
  "المتكاملة",
  "الرائدة",
];
const PEOPLE = ["أحمد", "خالد", "سعود", "ماجد", "نايف", "بدر", "طلال", "ريان", "مشعل", "فهد"];
const FAMILIES = ["الحربي", "القحطاني", "الشمري", "العتيبي", "الدوسري", "الزهراني", "المطيري"];
const NOTES = [
  "طلب كتالوج الألوان",
  "زيارة الموقع الأسبوع القادم",
  "أرسلت شهادات مقاومة الحريق",
  "ينتظر اعتماد الاستشاري",
  "يريد عينات 4 مم",
];

async function main(): Promise<void> {
  const today = todayRiyadh();

  const reps = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`${users.role} = 'rep' and ${users.active} = true`);
  if (reps.length === 0) throw new Error("seed-volume: no reps — run seed:demo first");

  const saudi = await db.execute<{ id: number }>(
    sql`select id from countries where iso2 = 'SA' limit 1`,
  );
  const saudiId = Number(saudi.rows[0]?.id);
  const cityRows = await db.execute<{ id: number }>(
    sql`select id from cities where country_id = ${saudiId} limit 40`,
  );
  const categoryRows = await db.execute<{ id: number }>(sql`select id from company_categories`);
  const sourceRows = await db.execute<{ id: number }>(sql`select id from lead_sources`);
  const supplierRows = await db.execute<{ id: number }>(sql`select id from suppliers limit 5`);
  const ratingRows = await db.execute<{ id: number }>(sql`select id from fire_ratings limit 5`);
  const classRows = await db.execute<{ id: number }>(sql`select id from panel_classes limit 5`);
  const thicknessRows = await db.execute<{ id: number }>(sql`select id from thicknesses limit 5`);
  const methodRows = await db.execute<{ id: number }>(sql`select id from shipment_methods limit 5`);

  const cityIds = cityRows.rows.map((row) => Number(row.id));
  const categoryIds = categoryRows.rows.map((row) => Number(row.id));
  const sourceIds = sourceRows.rows.map((row) => Number(row.id));
  const supplierIds = supplierRows.rows.map((row) => Number(row.id));
  const ratingIds = ratingRows.rows.map((row) => Number(row.id));
  const classIds = classRows.rows.map((row) => Number(row.id));
  const thicknessIds = thicknessRows.rows.map((row) => Number(row.id));
  const methodIds = methodRows.rows.map((row) => Number(row.id));

  /** A Riyadh day this many days back. */
  const back = (days: number): Day => addDays(today, -days);
  /** The same day as an instant, half past nine in the morning in Riyadh. */
  const at = (day: Day) =>
    sql`${day}::date::timestamp at time zone 'Asia/Riyadh' + interval '9.5 hours'` as unknown as Date;

  console.log(`seed-volume — ${COMPANY_COUNT} companies`);
  const companyIds: string[] = [];
  for (let i = 0; i < COMPANY_COUNT; i += 1) {
    const created = back(between(20, 420));
    // A fifth of the floor is due or overdue, a quarter is ahead of itself, and
    // the rest has no next step at all — the shape the five days found (D63).
    const step = rand();
    const followUp =
      step < 0.12
        ? back(between(1, 30))
        : step < 0.2
          ? today
          : step < 0.45
            ? addDays(today, between(1, 45))
            : null;

    const [row] = await db
      .insert(companies)
      .values({
        name: `${pick(FIRST)} ${pick(MIDDLE)} ${pick(LAST)} ${i + 1}`,
        repId: pick(reps).id,
        countryId: saudiId,
        cityId: pick(cityIds),
        categoryId: pick(categoryIds),
        leadSourceId: pick(sourceIds),
        nextFollowUp: followUp,
        createdAt: at(created),
        updatedAt: at(created),
      })
      .returning({ id: companies.id });
    companyIds.push(row.id);

    const typed = `05${String(50000000 + i).slice(0, 8)}`;
    await db.insert(contacts).values({
      companyId: row.id,
      name: `${pick(PEOPLE)} ${pick(FAMILIES)}`,
      phone: typed,
      phoneNormalized: normalizePhone(typed) ?? typed,
      isMain: true,
    });

    // Two thirds have been spoken to; the rest are the never-contacted band.
    if (rand() < 0.66) {
      const when = back(between(1, 120));
      await db.insert(activities).values({
        companyId: row.id,
        userId: pick(reps).id,
        channel: pick(["visit", "call", "whatsapp", "other"] as const),
        happenedOn: when,
        text: pick(NOTES),
        createdAt: at(when),
        updatedAt: at(when),
      });
    }
  }

  console.log(`seed-volume — ${PROJECT_COUNT} projects`);
  const built: { id: string; companyId: string }[] = [];
  for (let i = 0; i < PROJECT_COUNT; i += 1) {
    const companyId = pick(companyIds);
    const [row] = await db
      .insert(projects)
      .values({
        companyId,
        name: `${pick(["واجهة", "مشروع", "مبنى", "مجمع"])} ${pick(LAST)} ${i + 1}`,
        expectedSqm: `${between(200, 6000)}.00`,
      })
      .returning({ id: projects.id });
    built.push({ id: row.id, companyId });
  }

  console.log(`seed-volume — ${QUOTATION_COUNT} quotations`);
  const live: { id: string; itemId: string; qty: number }[] = [];
  for (let i = 0; i < QUOTATION_COUNT; i += 1) {
    const project = pick(built);
    const created = back(between(1, 300));
    const status = pick([
      "requested",
      "issued",
      "issued",
      "accepted",
      "accepted",
      "rejected",
      "returned",
    ] as const);
    const answered = status !== "requested" && status !== "returned";
    const numbered = await db.execute<{ n: number }>(
      sql.raw("select nextval('quotation_numbers')::int as n"),
    );
    const number = Number(numbered.rows[0].n);

    const [row] = await db
      .insert(quotations)
      .values({
        number,
        revision: 1,
        companyId: project.companyId,
        projectId: project.id,
        repId: pick(reps).id,
        status,
        smacNumber: answered ? `V${number}` : null,
        issuedAt: answered ? at(created) : null,
        decidedAt: status === "accepted" || status === "rejected" ? at(created) : null,
        returnReason: status === "returned" ? "المقاسات ناقصة" : null,
        createdAt: at(created),
        updatedAt: at(created),
      })
      .returning({ id: quotations.id });

    const qty = between(20, 200);
    const [item] = await db
      .insert(quotationItems)
      .values({
        quotationId: row.id,
        position: 1,
        colourCode: pick(["168", "1020", "RAL 9016", "7016"]),
        supplierId: pick(supplierIds),
        fireRatingId: pick(ratingIds),
        classId: pick(classIds),
        thicknessId: pick(thicknessIds),
        qty,
        width: "1.24",
        length: "5.80",
        pricePerSqm: `${between(95, 150)}.00`,
      })
      .returning({ id: quotationItems.id });

    if (status === "issued" || status === "accepted") {
      live.push({ id: row.id, itemId: item.id, qty });
    }
  }

  console.log(`seed-volume — ${DISPATCH_COUNT} dispatches`);
  for (let i = 0; i < DISPATCH_COUNT && live.length > 0; i += 1) {
    const source = live[i % live.length];
    const created = back(between(1, 200));
    const status = pick(["submitted", "approved", "approved", "refused"] as const);
    const numbered = await db.execute<{ n: number }>(
      sql.raw("select nextval('dispatch_numbers')::int as n"),
    );
    const number = Number(numbered.rows[0].n);

    const [row] = await db
      .insert(dispatches)
      .values({
        number,
        quotationId: source.id,
        repId: pick(reps).id,
        shipmentMethodId: pick(methodIds),
        destination: `${pick(["الرياض", "جدة", "الدمام"])} — موقع المشروع`,
        paymentTerms: pick(["تحويل بنكي 30 يوم", "50% مقدم", "نقدًا عند التسليم"]),
        status,
        smacDispatchNumber: status === "approved" ? `VD${number}` : null,
        approvedAt: status === "approved" ? at(created) : null,
        refuseReason: status === "refused" ? "الكمية أكبر من المتبقي" : null,
        createdAt: at(created),
        updatedAt: at(created),
      })
      .returning({ id: dispatches.id });

    await db.insert(dispatchItems).values({
      dispatchId: row.id,
      quotationItemId: source.itemId,
      qty: Math.max(1, Math.floor(source.qty / 4)),
    });
  }

  const counted = await db.execute<{ companies: number; quotations: number }>(sql`
    select (select count(*)::int from companies) as companies,
           (select count(*)::int from quotations) as quotations
  `);
  const row = counted.rows[0];
  console.log(
    `seed-volume — done. ${row?.companies} companies and ${row?.quotations} quotations on the floor.`,
  );
  process.exit(0);
}

await main();
