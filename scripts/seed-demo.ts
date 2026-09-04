/**
 * `npm run seed:demo` — the demo dataset. Development only; NOT a feature.
 *
 * It CLEARS first and then rebuilds, so running it twice leaves the database in
 * exactly the state one run leaves it in. That is the whole idempotence story:
 * no upserts, no "insert if missing", no drift between the first run and the
 * fortieth. There is no production data anywhere (CLAUDE.md), so truncating is
 * the honest thing to do — and because `quotation_numbers` and `dispatch_numbers`
 * are standalone sequences rather than identity columns, `truncate … restart
 * identity` does NOT touch them; they are restarted by name.
 *
 * Everything is written relative to Riyadh's today (`src/lib/dates.ts`), so the
 * dataset that showed two overdue follow-ups the day it was written shows two
 * overdue follow-ups the day it is run.
 *
 * Names, texts and quantities live in `scripts/seed/demo-data.ts`; the lookup
 * lists in `scripts/seed/lookups.ts`; the country list in
 * `scripts/seed/countries-iso.ts`. This file is the writer and nothing else.
 */
import { hash } from "bcryptjs";
import { sql } from "drizzle-orm";

import { loadEnv } from "../src/lib/env";
import {
  addDays,
  addMonths,
  type Day,
  firstOfMonth,
  parseDay,
  todayRiyadh,
} from "../src/lib/dates";
import { normalizePhone } from "../src/lib/phone";
import { isWeekend, nextWorkingDay } from "../src/lib/workdays";
import {
  CITIES,
  COMPANY_CATEGORIES,
  COUNTRIES_FACET,
  CLASSES,
  FIRE_RATINGS,
  LEAD_SOURCES,
  PINNED_CITIES,
  PINNED_COUNTRIES,
  POSITIONS,
  SHIPMENT_METHODS,
  SUPPLIERS,
  THICKNESSES,
} from "./seed/lookups";
import { buildCountries } from "./seed/countries-iso";
import {
  ACTIVITIES,
  COMPANIES,
  COMPANY_TARGET_LAST_MONTH,
  COMPANY_TARGET_THIS_MONTH,
  DISPATCHES,
  FOLLOW_UPS,
  HOLIDAY_DAY_OF_MONTH,
  HOLIDAY_NOTE,
  LEAVE_DAYS_AHEAD,
  LEAVE_NOTE,
  NOTIFICATIONS,
  PROJECTS,
  QUOTATIONS,
  REP_TARGET_LAST_MONTH,
  REP_TARGET_THIS_MONTH,
  USERS,
} from "./seed/demo-data";

loadEnv();

if (process.env.NODE_ENV === "production") {
  console.error("seed:demo refuses to run with NODE_ENV=production.");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set (copy .env.example to .env).");
  process.exit(1);
}

// The pool reads DATABASE_URL when the module is first evaluated, so it is
// imported after loadEnv() has run.
const { db, pool } = await import("../src/db/index");
const {
  activities,
  cities,
  classes,
  companies,
  companyCategories,
  companyTargets,
  contacts,
  countries,
  dispatchItems,
  dispatches,
  fireRatings,
  leadSources,
  nonWorkingDays,
  notifications,
  positions,
  projects,
  quotationItems,
  quotations,
  shipmentMethods,
  suppliers,
  targets,
  thicknesses,
  users,
} = await import("../src/db/schema");

// ---- time ---------------------------------------------------------------------

const TODAY: Day = todayRiyadh();
const NOW = new Date();
const PASSWORD = process.env.SEED_PASSWORD ?? "kladra2026";

/**
 * A Riyadh wall-clock instant. Riyadh is UTC+03:00 all year — no DST — so the
 * arithmetic is exact, and the result is clamped a minute behind now so nothing
 * in the dataset claims to have happened in the future.
 */
function instant(day: Day, hour: number, minute = 0): Date {
  const { y, m, d } = parseDay(day);
  const t = Date.UTC(y, m - 1, d, hour - 3, minute);
  return new Date(Math.min(t, NOW.getTime() - 60_000));
}

/** The last `count` Riyadh working days, newest first; index 0 is `back: 0`. */
function workingDaysBack(count: number): Day[] {
  const out: Day[] = [];
  let d = TODAY;
  while (out.length < count) {
    if (!isWeekend(d)) out.push(d);
    d = addDays(d, -1);
  }
  return out;
}
const WORKDAYS = workingDaysBack(30);
const back = (n: number): Day => WORKDAYS[Math.min(n, WORKDAYS.length - 1)];

/** The Friday or Saturday immediately before a working day. */
function weekendBefore(day: Day): Day {
  let d = addDays(day, -1);
  while (!isWeekend(d)) d = addDays(d, -1);
  return d;
}

/** A day of THIS month, never later than today (used for approved dispatches). */
function dayOfThisMonth(dayOfMonth: number): Day {
  const candidate = firstOfMonth(TODAY).slice(0, 8) + String(dayOfMonth).padStart(2, "0");
  return candidate > TODAY ? TODAY : candidate;
}

// ---- helpers ------------------------------------------------------------------

function must<T>(map: Map<string, T>, key: string, what: string): T {
  const v = map.get(key);
  if (v === undefined) throw new Error(`${what} "${key}" is not in the seeded lookups`);
  return v;
}

function phone(typed: string): string {
  const e164 = normalizePhone(typed);
  if (!e164) throw new Error(`demo contact phone "${typed}" does not normalize`);
  return e164;
}

// ============================================================================
// Phase 0 — clear
// ============================================================================

async function clearEverything(): Promise<void> {
  const tables = await pool.query<{ table_name: string }>(
    `select table_name from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'`,
  );
  if (tables.rowCount === 0) {
    throw new Error("no tables in the public schema — run `npm run db:migrate` first");
  }
  const names = tables.rows.map((r) => `"${r.table_name}"`).join(", ");
  await pool.query(`truncate ${names} restart identity cascade`);

  // `restart identity` restarts the sequences OWNED by identity columns only.
  // Q-1 and D-1 come from free-standing sequences, which would otherwise keep
  // counting and make a second run's numbers differ from the first's.
  const seqs = await pool.query<{ sequencename: string }>(
    `select sequencename from pg_sequences where schemaname = 'public'`,
  );
  for (const s of seqs.rows) await pool.query(`alter sequence "${s.sequencename}" restart`);
  console.log(`  cleared ${tables.rowCount} table(s), restarted ${seqs.rowCount} sequence(s)`);
}

// ============================================================================
// Phase 1 — users
// ============================================================================

async function seedUsers(): Promise<Map<string, string>> {
  const hashes = new Map<string, string>();
  for (const u of USERS) hashes.set(u.key, await hash(PASSWORD, 10));

  const ids = new Map<string, string>();
  await db.transaction(async (tx) => {
    const rows = await tx
      .insert(users)
      .values(
        USERS.map((u) => ({
          name: u.name,
          email: u.email,
          passwordHash: hashes.get(u.key)!,
          role: u.role,
          active: true,
          locale: u.locale,
        })),
      )
      .returning({ id: users.id, email: users.email });
    for (const u of USERS) {
      const row = rows.find((r) => r.email === u.email);
      if (!row) throw new Error(`user ${u.email} did not come back from the insert`);
      ids.set(u.key, row.id);
    }
  });
  return ids;
}

// ============================================================================
// Phase 2 — lookups
// ============================================================================

type Lookups = {
  countryByCode: Map<string, number>;
  cityByName: Map<string, number>;
  categoryByName: Map<string, number>;
  sourceByName: Map<string, number>;
  supplierByCode: Map<string, number>;
  fireRatingByName: Map<string, number>;
  classByName: Map<string, number>;
  thicknessByMm: Map<string, number>;
  shipmentByCode: Map<string, number>;
};

async function seedLookups(): Promise<Lookups> {
  return db.transaction(async (tx) => {
    // Countries: FACET's nine keep their Arabic, the ISO list fills the rest,
    // the six Gulf states pinned 1..6 (SPEC §3, D7).
    const countryRows = buildCountries(COUNTRIES_FACET, PINNED_COUNTRIES);
    const insertedCountries = await tx
      .insert(countries)
      .values(
        countryRows.map((c) => ({
          code: c.code,
          nameEn: c.nameEn,
          nameAr: c.nameAr,
          pinned: c.pinned,
          active: true,
        })),
      )
      .returning({ id: countries.id, code: countries.code });
    const countryByCode = new Map(insertedCountries.map((c) => [c.code, c.id]));
    const saudiId = must(countryByCode, "SA", "country");

    // Cities: FACET's 171, all Saudi, six pinned then alphabetical.
    const pinnedRank = new Map(PINNED_CITIES.map((n, i) => [n, i + 1]));
    const cityRows = [...CITIES]
      .map((c) => ({ nameEn: c.en, nameAr: c.ar, pinned: pinnedRank.get(c.en) ?? null }))
      .sort((a, b) =>
        a.pinned !== null && b.pinned !== null
          ? a.pinned - b.pinned
          : a.pinned !== null
            ? -1
            : b.pinned !== null
              ? 1
              : a.nameEn.localeCompare(b.nameEn, "en"),
      );
    const insertedCities = await tx
      .insert(cities)
      .values(
        cityRows.map((c) => ({
          countryId: saudiId,
          nameEn: c.nameEn,
          nameAr: c.nameAr,
          pinned: c.pinned,
          active: true,
        })),
      )
      .returning({ id: cities.id, nameEn: cities.nameEn });
    const cityByName = new Map(insertedCities.map((c) => [c.nameEn, c.id]));

    const insertedCategories = await tx
      .insert(companyCategories)
      .values(
        COMPANY_CATEGORIES.map((c, i) => ({
          nameEn: c.en,
          nameAr: c.ar,
          sortOrder: i,
          active: true,
        })),
      )
      .returning({ id: companyCategories.id, nameEn: companyCategories.nameEn });
    const categoryByName = new Map(insertedCategories.map((c) => [c.nameEn, c.id]));

    const insertedSources = await tx
      .insert(leadSources)
      .values(LEAD_SOURCES.map((s, i) => ({ nameEn: s.en, nameAr: s.ar, sortOrder: i, active: true })))
      .returning({ id: leadSources.id, nameEn: leadSources.nameEn });
    const sourceByName = new Map(insertedSources.map((s) => [s.nameEn, s.id]));

    await tx
      .insert(positions)
      .values(POSITIONS.map((p, i) => ({ nameEn: p.en, nameAr: p.ar, sortOrder: i, active: true })));

    const insertedShipment = await tx
      .insert(shipmentMethods)
      .values(
        SHIPMENT_METHODS.map((m, i) => ({
          code: m.code,
          nameEn: m.en,
          nameAr: m.ar,
          sortOrder: i,
          active: true,
        })),
      )
      .returning({ id: shipmentMethods.id, code: shipmentMethods.code });
    const shipmentByCode = new Map(insertedShipment.map((m) => [m.code, m.id]));

    // "The code is the name" until an admin types a real one (SPEC D3).
    const insertedSuppliers = await tx
      .insert(suppliers)
      .values(SUPPLIERS.map((s, i) => ({ code: s.code, name: s.name, sortOrder: i, active: true })))
      .returning({ id: suppliers.id, code: suppliers.code });
    const supplierByCode = new Map(insertedSuppliers.map((s) => [s.code, s.id]));

    const insertedFire = await tx
      .insert(fireRatings)
      .values(FIRE_RATINGS.map((n, i) => ({ name: n, sortOrder: i, active: true })))
      .returning({ id: fireRatings.id, name: fireRatings.name });
    const fireRatingByName = new Map(insertedFire.map((f) => [f.name, f.id]));

    const insertedClasses = await tx
      .insert(classes)
      .values(CLASSES.map((n, i) => ({ name: n, sortOrder: i, active: true })))
      .returning({ id: classes.id, name: classes.name });
    const classByName = new Map(insertedClasses.map((c) => [c.name, c.id]));

    const thicknessRows = [...THICKNESSES].sort((a, b) => Number(a.mm) - Number(b.mm));
    const insertedThickness = await tx
      .insert(thicknesses)
      .values(thicknessRows.map((t, i) => ({ mm: t.mm, sortOrder: i, active: t.active })))
      .returning({ id: thicknesses.id, mm: thicknesses.mm });
    // numeric(4,1) comes back as "4.0" — the same string the list carries.
    const thicknessByMm = new Map(insertedThickness.map((t) => [t.mm, t.id]));

    return {
      countryByCode,
      cityByName,
      categoryByName,
      sourceByName,
      supplierByCode,
      fireRatingByName,
      classByName,
      thicknessByMm,
      shipmentByCode,
    };
  });
}

// ============================================================================
// Phase 3 — companies and contacts
// ============================================================================

async function seedCompanies(
  lk: Lookups,
  userIds: Map<string, string>,
): Promise<{ companyIds: Map<string, string>; contactIds: Map<string, string[]> }> {
  const companyIds = new Map<string, string>();
  const contactIds = new Map<string, string[]>();

  await db.transaction(async (tx) => {
    const rows = await tx
      .insert(companies)
      .values(
        COMPANIES.map((c, i) => {
          // Spread the book back over about five months so "recently added" and
          // "never contacted for 14 days" mean something on the rep's home.
          const created = instant(addDays(TODAY, -(20 + i * 6)), 10, (i * 7) % 60);
          const code = c.country ?? "SA";
          return {
            name: c.name,
            categoryId: must(lk.categoryByName, c.category, "category"),
            leadSourceId: must(lk.sourceByName, c.source, "lead source"),
            countryId: must(lk.countryByCode, code, "country"),
            cityId: c.city ? must(lk.cityByName, c.city, "city") : null,
            cityText: c.cityText ?? null,
            notes: c.notes ?? null,
            repId: must(userIds, c.rep, "user"),
            nextFollowUp: null,
            createdAt: created,
            updatedAt: created,
          };
        }),
      )
      .returning({ id: companies.id, name: companies.name });
    for (const c of COMPANIES) {
      const row = rows.find((r) => r.name === c.name);
      if (!row) throw new Error(`company ${c.name} did not come back from the insert`);
      companyIds.set(c.key, row.id);
    }

    const contactValues = COMPANIES.flatMap((c) =>
      c.contacts.map((p, i) => ({
        companyId: companyIds.get(c.key)!,
        name: p.name,
        phone: p.phone,
        phoneNormalized: phone(p.phone),
        position: p.position,
        email: p.email ?? null,
        notes: p.notes ?? null,
        // The first contact added is the main contact (SPEC D18).
        isMain: i === 0,
      })),
    );
    const insertedContacts = await tx
      .insert(contacts)
      .values(contactValues)
      .returning({ id: contacts.id, companyId: contacts.companyId, phoneNormalized: contacts.phoneNormalized });
    for (const c of COMPANIES) {
      const cid = companyIds.get(c.key)!;
      contactIds.set(
        c.key,
        c.contacts.map((p) => {
          const row = insertedContacts.find(
            (r) => r.companyId === cid && r.phoneNormalized === phone(p.phone),
          );
          if (!row) throw new Error(`contact ${p.name} did not come back from the insert`);
          return row.id;
        }),
      );
    }
  });

  return { companyIds, contactIds };
}

// ============================================================================
// Phase 4 — projects
// ============================================================================

async function seedProjects(companyIds: Map<string, string>): Promise<Map<string, string>> {
  const projectIds = new Map<string, string>();
  await db.transaction(async (tx) => {
    const rows = await tx
      .insert(projects)
      .values(
        PROJECTS.map((p, i) => {
          const created = instant(addDays(TODAY, -(15 + i * 4)), 11, (i * 5) % 60);
          return {
            companyId: must(companyIds, p.company, "company"),
            name: p.name,
            expectedSqm: p.expectedSqm,
            nextFollowUp: null,
            notes: p.notes ?? null,
            createdAt: created,
            updatedAt: created,
          };
        }),
      )
      .returning({ id: projects.id, name: projects.name });
    for (const p of PROJECTS) {
      const row = rows.find((r) => r.name === p.name);
      if (!row) throw new Error(`project ${p.name} did not come back from the insert`);
      projectIds.set(p.key, row.id);
    }
  });
  return projectIds;
}

// ============================================================================
// Phase 5 — the log
// ============================================================================

async function seedActivities(
  companyIds: Map<string, string>,
  projectIds: Map<string, string>,
  contactIds: Map<string, string[]>,
  userIds: Map<string, string>,
): Promise<number> {
  const repOf = new Map(COMPANIES.map((c) => [c.key, c.rep]));
  return db.transaction(async (tx) => {
    const values = ACTIVITIES.map((a, i) => {
      const workday = back(a.back);
      const day = a.onWeekend ? weekendBefore(workday) : workday;
      const rep = must(repOf, a.company, "company");
      return {
        companyId: must(companyIds, a.company, "company"),
        projectId: a.project ? must(projectIds, a.project, "project") : null,
        contactId:
          a.contact === undefined ? null : (contactIds.get(a.company) ?? [])[a.contact] ?? null,
        userId: must(userIds, rep, "user"),
        text: a.text,
        channel: a.channel,
        happenedOn: day,
        nextFollowUp: a.followUpDays === undefined ? null : addDays(TODAY, a.followUpDays),
        createdAt: instant(day, 9 + (i % 8), (i * 11) % 60),
        updatedAt: instant(day, 9 + (i % 8), (i * 11) % 60),
      };
    });
    const rows = await tx.insert(activities).values(values).returning({ id: activities.id });
    return rows.length;
  });
}

// ============================================================================
// Phase 6 — follow-ups, and the "last touched" clock
// ============================================================================

async function seedFollowUps(
  companyIds: Map<string, string>,
  projectIds: Map<string, string>,
): Promise<void> {
  await db.transaction(async (tx) => {
    for (const f of FOLLOW_UPS) {
      const day = addDays(TODAY, f.days);
      if (f.company) {
        await tx.execute(
          sql`update companies set next_follow_up = ${day}::date where id = ${must(companyIds, f.company, "company")}::uuid`,
        );
      } else if (f.project) {
        await tx.execute(
          sql`update projects set next_follow_up = ${day}::date where id = ${must(projectIds, f.project, "project")}::uuid`,
        );
      }
    }
    // A company's clock is the last thing that happened on it. Both tables are
    // named outright: a bare column in a correlated subquery resolves inside the
    // inner table and silently matches nothing (rules/data.md).
    await tx.execute(sql`
      update companies
         set updated_at = greatest(
               companies.created_at,
               coalesce((select max(activities.created_at)
                           from activities
                          where activities.company_id = companies.id),
                        companies.created_at))
    `);
  });
}

// ============================================================================
// Phase 7 — quotations and their items
// ============================================================================

async function seedQuotations(
  companyIds: Map<string, string>,
  projectIds: Map<string, string>,
  userIds: Map<string, string>,
  lk: Lookups,
): Promise<{ quotationIds: Map<string, string>; itemIds: Map<string, string[]>; numbers: Map<string, number>; items: number }> {
  const quotationIds = new Map<string, string>();
  const itemIds = new Map<string, string[]>();
  const numbers = new Map<string, number>();
  let itemCount = 0;

  await db.transaction(async (tx) => {
    for (const q of QUOTATIONS) {
      // A revision carries the parent's number (SPEC D10); everything else takes
      // the next one off the sequence and never reuses it.
      let number: number;
      if (q.revisionOf) {
        number = must(numbers, q.revisionOf, "quotation");
      } else {
        const res = await tx.execute(sql.raw(`select nextval('quotation_numbers')::int as n`));
        number = Number((res.rows[0] as { n: number }).n);
      }
      numbers.set(q.key, number);

      const created = instant(back(q.createdBack), 10, 20);
      const [row] = await tx
        .insert(quotations)
        .values({
          number,
          revision: q.revision ?? 1,
          revisionOf: q.revisionOf ? must(quotationIds, q.revisionOf, "quotation") : null,
          companyId: must(companyIds, q.company, "company"),
          projectId: q.project ? must(projectIds, q.project, "project") : null,
          repId: must(userIds, q.rep, "user"),
          status: q.status,
          notes: q.notes ?? null,
          smacNumber: q.smacNumber ?? null,
          returnReason: q.returnReason ?? null,
          decisionReason: q.decisionReason ?? null,
          issuedAt: q.issuedBack === undefined ? null : instant(back(q.issuedBack), 13, 5),
          decidedAt: q.decidedBack === undefined ? null : instant(back(q.decidedBack), 15, 40),
          createdAt: created,
          updatedAt: created,
        })
        .returning({ id: quotations.id });
      quotationIds.set(q.key, row.id);

      // `sqm` is GENERATED (width × length × qty) — never in the column list.
      const items = await tx
        .insert(quotationItems)
        .values(
          q.items.map((it, i) => ({
            quotationId: row.id,
            position: i + 1,
            colourCode: it.colourCode,
            supplierId: must(lk.supplierByCode, it.supplier, "supplier"),
            fireRatingId: must(lk.fireRatingByName, it.fireRating, "fire rating"),
            classId: must(lk.classByName, it.className, "class"),
            qty: it.qty,
            thicknessId: must(lk.thicknessByMm, it.thickness, "thickness"),
            width: it.width,
            length: it.length,
            pricePerSqm: it.pricePerSqm,
            createdAt: created,
            updatedAt: created,
          })),
        )
        .returning({ id: quotationItems.id, position: quotationItems.position });
      itemIds.set(
        q.key,
        [...items].sort((a, b) => a.position - b.position).map((r) => r.id),
      );
      itemCount += items.length;
    }
  });

  return { quotationIds, itemIds, numbers, items: itemCount };
}

// ============================================================================
// Phase 8 — dispatches and their items
// ============================================================================

async function seedDispatches(
  quotationIds: Map<string, string>,
  itemIds: Map<string, string[]>,
  userIds: Map<string, string>,
  lk: Lookups,
): Promise<number> {
  let itemCount = 0;
  await db.transaction(async (tx) => {
    for (const d of DISPATCHES) {
      const res = await tx.execute(sql.raw(`select nextval('dispatch_numbers')::int as n`));
      const number = Number((res.rows[0] as { n: number }).n);
      const created = instant(back(d.createdBack), 12, 15);
      const approvedAt =
        d.approvedOnDayOfMonth === undefined
          ? null
          : instant(dayOfThisMonth(d.approvedOnDayOfMonth), 14, 30);

      const [row] = await tx
        .insert(dispatches)
        .values({
          number,
          quotationId: must(quotationIds, d.quotation, "quotation"),
          repId: must(userIds, d.rep, "user"),
          status: d.status,
          shipmentMethodId: must(lk.shipmentByCode, d.shipmentMethod, "shipment method"),
          destination: d.destination,
          paymentTerms: d.paymentTerms,
          smacDispatchNumber: d.smacDispatchNumber ?? null,
          refuseReason: null,
          approvedAt,
          createdAt: created,
          updatedAt: approvedAt ?? created,
        })
        .returning({ id: dispatches.id });

      const parentItems = must(itemIds, d.quotation, "quotation");
      const rows = await tx
        .insert(dispatchItems)
        .values(
          d.items.map((it) => {
            const quotationItemId = parentItems[it.item];
            if (!quotationItemId) throw new Error(`dispatch ${d.key} names item ${it.item}, which does not exist`);
            return { dispatchId: row.id, quotationItemId, qty: it.qty, createdAt: created, updatedAt: created };
          }),
        )
        .returning({ id: dispatchItems.id });
      itemCount += rows.length;
    }
  });
  return itemCount;
}

// ============================================================================
// Phase 9 — targets
// ============================================================================

async function seedTargets(userIds: Map<string, string>): Promise<void> {
  const thisMonth = firstOfMonth(TODAY);
  const lastMonth = addMonths(TODAY, -1);
  const reps = USERS.filter((u) => u.role === "rep");

  await db.transaction(async (tx) => {
    await tx.insert(targets).values(
      reps.flatMap((u) => [
        { userId: must(userIds, u.key, "user"), month: thisMonth, sqm: REP_TARGET_THIS_MONTH },
        { userId: must(userIds, u.key, "user"), month: lastMonth, sqm: REP_TARGET_LAST_MONTH },
      ]),
    );
    await tx.insert(companyTargets).values([
      { month: thisMonth, sqm: COMPANY_TARGET_THIS_MONTH },
      { month: lastMonth, sqm: COMPANY_TARGET_LAST_MONTH },
    ]);
  });
}

// ============================================================================
// Phase 10 — notifications
// ============================================================================

async function seedNotifications(
  userIds: Map<string, string>,
  quotationIds: Map<string, string>,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.insert(notifications).values(
      NOTIFICATIONS.map((n) => {
        const created = instant(back(n.back), 11, 45);
        return {
          userId: must(userIds, n.user, "user"),
          kind: n.kind,
          params: n.params,
          link: `${n.linkBase}?open=${must(quotationIds, n.quotation, "quotation")}`,
          readAt: n.read ? instant(back(Math.max(n.back - 1, 0)), 8, 10) : null,
          createdAt: created,
          updatedAt: created,
        };
      }),
    );
  });
}

// ============================================================================
// Phase 11 — holidays and leave
// ============================================================================

async function seedNonWorkingDays(userIds: Map<string, string>): Promise<void> {
  const nextMonth = addMonths(TODAY, 1);
  const holiday = nextMonth.slice(0, 8) + String(HOLIDAY_DAY_OF_MONTH).padStart(2, "0");
  const leave = nextWorkingDay(addDays(TODAY, LEAVE_DAYS_AHEAD));

  await db.transaction(async (tx) => {
    await tx.insert(nonWorkingDays).values([
      { day: holiday, kind: "holiday" as const, userId: null, note: HOLIDAY_NOTE },
      { day: leave, kind: "leave" as const, userId: must(userIds, "turki", "user"), note: LEAVE_NOTE },
    ]);
  });
}

// ============================================================================
// Report
// ============================================================================

async function printCounts(): Promise<void> {
  const tables = await pool.query<{ table_name: string }>(
    `select table_name from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`,
  );
  const union = tables.rows
    .map((r) => `select '${r.table_name}' as t, count(*)::int as c from "${r.table_name}"`)
    .join(" union all ");
  const counts = await pool.query<{ t: string; c: number }>(`${union} order by t`);
  const width = Math.max(...counts.rows.map((r) => r.t.length));
  console.log("\n  rows per table");
  for (const r of counts.rows) {
    console.log(`    ${r.t.padEnd(width)}  ${String(r.c).padStart(4)}`);
  }
}

/** The one derived figure this dataset promises: Faisal's follow-up strip. */
async function printFaisalFollowUps(): Promise<void> {
  const res = await pool.query<{ overdue: number; today: number; ahead: number }>(
    `with mine as (
       select companies.next_follow_up as day
         from companies
         join users on users.id = companies.rep_id
        where users.email = 'faisal@technopanel.com.sa'
          and companies.next_follow_up is not null
       union all
       select projects.next_follow_up as day
         from projects
         join companies on companies.id = projects.company_id
         join users on users.id = companies.rep_id
        where users.email = 'faisal@technopanel.com.sa'
          and projects.next_follow_up is not null
     )
     select count(*) filter (where mine.day < (now() at time zone 'Asia/Riyadh')::date)::int as overdue,
            count(*) filter (where mine.day = (now() at time zone 'Asia/Riyadh')::date)::int as today,
            count(*) filter (where mine.day > (now() at time zone 'Asia/Riyadh')::date)::int as ahead
       from mine`,
  );
  const r = res.rows[0];
  console.log(`\n  Faisal's follow-ups — overdue ${r.overdue} · today ${r.today} · ahead ${r.ahead}`);
  if (r.overdue !== 2 || r.today !== 1 || r.ahead !== 3) {
    throw new Error("Faisal's follow-up shape is not 2 overdue / 1 today / 3 ahead");
  }
}

// ============================================================================

try {
  console.log(`seed:demo — Riyadh today is ${TODAY}`);
  await clearEverything();

  const userIds = await seedUsers();
  console.log(`  users            ${userIds.size}`);

  const lk = await seedLookups();
  console.log(`  lookups          ${lk.countryByCode.size} countries, ${lk.cityByName.size} cities`);

  const { companyIds, contactIds } = await seedCompanies(lk, userIds);
  console.log(`  companies        ${companyIds.size}`);

  const projectIds = await seedProjects(companyIds);
  console.log(`  projects         ${projectIds.size}`);

  const activityCount = await seedActivities(companyIds, projectIds, contactIds, userIds);
  console.log(`  activities       ${activityCount}`);

  await seedFollowUps(companyIds, projectIds);
  console.log(`  follow-ups       ${FOLLOW_UPS.length}`);

  const { quotationIds, itemIds, items } = await seedQuotations(companyIds, projectIds, userIds, lk);
  console.log(`  quotations       ${quotationIds.size} (${items} items)`);

  const dispatchItemCount = await seedDispatches(quotationIds, itemIds, userIds, lk);
  console.log(`  dispatches       ${DISPATCHES.length} (${dispatchItemCount} items)`);

  await seedTargets(userIds);
  await seedNotifications(userIds, quotationIds);
  await seedNonWorkingDays(userIds);

  await printCounts();
  await printFaisalFollowUps();
  console.log(`\n  every account signs in with SEED_PASSWORD (default "kladra2026")\n`);
} catch (err) {
  console.error("seed:demo failed:", err instanceof Error ? (err.stack ?? err.message) : err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
