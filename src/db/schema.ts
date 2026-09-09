/**
 * Kladra schema. Plain names, small, every table with created_at / updated_at.
 * Money and m² are numeric; dates that are "a day in Riyadh" are `date`;
 * instants are timestamptz. No RLS — authorization lives in src/lib/authz.ts.
 */
import { LOOKUP_KINDS } from "@/lib/lookup-kinds";
import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgSequence,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ---- enums -----------------------------------------------------------------

// Relative, not "@/lib/types": drizzle-kit reads this file outside Next and
// does not know the alias. types.ts imports nothing, so nothing follows it in.
import { ROLES } from "../lib/types";

export const roleEnum = pgEnum("role", ROLES);
export const nonWorkingKindEnum = pgEnum("non_working_kind", ["holiday", "leave"]);
export const channelEnum = pgEnum("channel", ["visit", "call", "whatsapp", "other"]);
export const quotationStatusEnum = pgEnum("quotation_status", [
  "requested",
  "returned",
  "issued",
  "accepted",
  "rejected",
  "cancelled",
]);
export const dispatchStatusEnum = pgEnum("dispatch_status", ["submitted", "approved", "refused"]);

// Human-facing numbers: Q-1, Q-2 … and D-1, D-2 … never reused.
export const quotationNumbers = pgSequence("quotation_numbers", { startWith: 1 });
export const dispatchNumbers = pgSequence("dispatch_numbers", { startWith: 1 });

const stamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

// ---- people ------------------------------------------------------------------

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  /**
   * The same person's name in Arabic, optional (D68). Every lookup in this
   * schema already has two names — a city, a category, a lead source — and the
   * people were the one thing in the system that had one, so Rawan's screens
   * named her colleagues in Latin all day. Null or empty falls back to `name`,
   * which is what an account added in a hurry will have.
   */
  nameAr: text("name_ar"),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").notNull().default("rep"),
  active: boolean("active").notNull().default(true),
  locale: text("locale").notNull().default("en"),
  /**
   * The last Riyadh day this person opened Kladra (D77).
   *
   * A day and not an instant: the question it exists for is "who has not opened
   * it this week", nobody acts on the hour, and a day is what makes the write
   * cheap — it is set once per person per day, by the one query every
   * authenticated request already makes (`getSessionAndUser`), and skipped for
   * the rest of that day. Null means never, which a new account is until the
   * person signs in for the first time.
   */
  lastSeenOn: date("last_seen_on"),
  ...stamps,
});

// Auth.js database sessions — the cookie names a row here; deleting the row
// signs the person out everywhere.
export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { withTimezone: true }).notNull(),
  ...stamps,
});

// ---- lookups -----------------------------------------------------------------
// `pinned` orders the common values first (1..n); the rest sort alphabetically.
// `sortOrder` is the admin's manual order where a list has no alphabetical
// meaning (categories, lead sources, suppliers …) — "Other" carries the highest.

export const countries = pgTable("countries", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  code: text("code").notNull().unique(), // ISO 3166-1 alpha-2
  nameEn: text("name_en").notNull(),
  nameAr: text("name_ar").notNull(),
  pinned: integer("pinned"),
  active: boolean("active").notNull().default(true),
  ...stamps,
});

export const cities = pgTable(
  "cities",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    countryId: integer("country_id")
      .notNull()
      .references(() => countries.id),
    nameEn: text("name_en").notNull(),
    nameAr: text("name_ar").notNull(),
    pinned: integer("pinned"),
    active: boolean("active").notNull().default(true),
    ...stamps,
  },
  (t) => [index("cities_country_idx").on(t.countryId)],
);

export const companyCategories = pgTable("company_categories", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  nameEn: text("name_en").notNull(),
  nameAr: text("name_ar").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  ...stamps,
});

export const leadSources = pgTable("lead_sources", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  nameEn: text("name_en").notNull(),
  nameAr: text("name_ar").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  /**
   * Offered to management and marketing, and not to a rep adding a company
   * (SPEC §3, which narrows D1). One row carries it: the Marketing source,
   * because a rep who can pick it can claim marketing's work as his own lead.
   *
   * A column rather than a name the code matches on. The admin may rename any
   * of these lists in either language, and a rule that reads "the one called
   * Marketing" stops being true the first time somebody types «تسويق رقمي»
   * instead — a permission that a rename can switch off is not a permission.
   */
  restricted: boolean("restricted").notNull().default(false),
  ...stamps,
});

export const suppliers = pgTable("suppliers", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  code: text("code").notNull().unique(), // N / K / C / D
  name: text("name").notNull(), // full supplier name
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  ...stamps,
});

export const fireRatings = pgTable("fire_ratings", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull().unique(), // B1 / A2 / Normal
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  ...stamps,
});

export const classes = pgTable("classes", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull().unique(),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  ...stamps,
});

export const thicknesses = pgTable("thicknesses", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  mm: numeric("mm", { precision: 4, scale: 1 }).notNull().unique(),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  ...stamps,
});

// CT (customer's truck) · TT (Technopanel truck) · Cargo (third party).
export const shipmentMethods = pgTable("shipment_methods", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  code: text("code").notNull().unique(),
  nameEn: text("name_en").notNull(),
  nameAr: text("name_ar").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  ...stamps,
});

// Contact positions offered in the combobox; the contact stores the text.
export const positions = pgTable("positions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  nameEn: text("name_en").notNull().unique(),
  nameAr: text("name_ar").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  ...stamps,
});

// Company-wide holidays (user null) and personal leave (user set). The
// working-day math in src/lib/workdays.ts reads this table.
export const nonWorkingDays = pgTable(
  "non_working_days",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    day: date("day").notNull(),
    kind: nonWorkingKindEnum("kind").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    note: text("note"),
    ...stamps,
  },
  (t) => [index("non_working_days_day_idx").on(t.day)],
);

// ---- the rep floor --------------------------------------------------------

export const companies = pgTable(
  "companies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    categoryId: integer("category_id")
      .notNull()
      .references(() => companyCategories.id),
    leadSourceId: integer("lead_source_id")
      .notNull()
      .references(() => leadSources.id),
    countryId: integer("country_id")
      .notNull()
      .references(() => countries.id),
    cityId: integer("city_id").references(() => cities.id), // Saudi: a picked city
    cityText: text("city_text"), // non-Saudi: free text
    notes: text("notes"),
    repId: uuid("rep_id")
      .notNull()
      .references(() => users.id),
    // Set by the latest log entry or by the picker at the top of the drawer (SPEC D9).
    nextFollowUp: date("next_follow_up"),
    archivedAt: timestamp("archived_at", { withTimezone: true }), // archive, never delete
    /** Why it left the floor, in the archiver's words (S16, D87). */
    archiveReason: text("archive_reason"),
    /**
     * Who brought this customer in and gave him away (SPEC §3, P12-7).
     *
     * Marketing does not use the Add company form: it files a LEAD, and filing
     * one IS the assignment — it goes to a chosen rep or to a member of the
     * marketing team, and `rep_id` above is that person from the first second.
     * So a lead is not a second kind of row waiting to become a company; it is
     * a company, on somebody's floor, that somebody else found. These three
     * columns are the only difference, and they are what makes "a lead I was
     * given" a different thing on screen from "my company".
     *
     * Null on every company a rep opened himself, which is most of them.
     */
    leadFromId: uuid("lead_from_id").references(() => users.id),
    /** What the customer asked for, in the finder's own words. The point of the lead. */
    leadQuery: text("lead_query"),
    /**
     * When the person it was given to said he has it.
     *
     * An act, not a side effect of opening the drawer: marketing needs to know
     * somebody has actually taken the call, and a lead cleared by a stray click
     * answers nobody. Null until then, and a lead somebody filed for himself is
     * stamped at the moment he files it, because there is nobody to tell.
     */
    leadAcknowledgedAt: timestamp("lead_acknowledged_at", { withTimezone: true }),
    ...stamps,
  },
  (t) => [
    index("companies_rep_idx").on(t.repId),
    index("companies_name_idx").on(t.name),
    index("companies_follow_up_idx").on(t.nextFollowUp),
    index("companies_updated_idx").on(t.updatedAt),
    // Saudi picks a city, everywhere else types one (S3). Both or neither is a
    // company with no readable address, and the form is not the only way in.
    check("companies_city_check", sql`num_nonnulls(${t.cityId}, ${t.cityText}) = 1`),
    // Why it left the floor is a fact about a company that HAS left (D87,
    // rules/data.md): a reason on a live company is a state that never
    // happened. Nullable the other way — rows archived before the column
    // gave no reason, and inventing one would be the same lie (0010).
    check(
      "companies_archive_reason_check",
      sql`${t.archiveReason} is null or ${t.archivedAt} is not null`,
    ),
    // The three lead columns are one fact and stand or fall together: a lead
    // with nothing the customer asked for is a name and a phone number, which
    // is what the Add company form is already for, and an acknowledgement of a
    // lead nobody gave is a state that never happened (rules/data.md).
    check("companies_lead_check", sql`${t.leadFromId} is null or ${t.leadQuery} is not null`),
    check(
      "companies_lead_ack_check",
      sql`${t.leadAcknowledgedAt} is null or ${t.leadFromId} is not null`,
    ),
    // Marketing's own screen reads by who brought it in; nothing else does.
    index("companies_lead_from_idx").on(t.leadFromId),
  ],
);

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    // Whose contact this is (D147). A company can be shared, and each rep on it
    // keeps his own list: the same person held by two reps is two rows and not
    // a duplicate, because each of them knows him.
    repId: uuid("rep_id")
      .notNull()
      .references(() => users.id),
    name: text("name").notNull(),
    phone: text("phone").notNull(), // as typed; mandatory — the company has no phone
    phoneNormalized: text("phone_normalized").notNull(), // E.164, +966…
    position: text("position"),
    email: text("email"),
    notes: text("notes"),
    isMain: boolean("is_main").notNull().default(false),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...stamps,
  },
  (t) => [
    index("contacts_company_idx").on(t.companyId),
    index("contacts_rep_idx").on(t.repId),
    index("contacts_phone_idx").on(t.phoneNormalized),
    // One number once per rep, not once per company (D147). Two reps working
    // one customer will both hold the buyer's number, and refusing the second
    // would tell the second rep his own customer's number belongs to somebody
    // else.
    uniqueIndex("contacts_company_phone_idx").on(t.companyId, t.repId, t.phoneNormalized),
    // One main per rep on a company (D18, narrowed by D147): two would make
    // "the number to call" depend on which row came back first, and one per
    // company would make it depend on which rep added his first.
    uniqueIndex("contacts_one_main_idx")
      .on(t.companyId, t.repId)
      .where(sql`${t.isMain} and ${t.archivedAt} is null`),
  ],
);

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    // Whose project this is (D147). Until sharing there was nobody to ask: a
    // project belonged to whoever owned the company over it, which is still the
    // answer for every project one person opened on his own floor.
    repId: uuid("rep_id")
      .notNull()
      .references(() => users.id),
    name: text("name").notNull(),
    expectedSqm: numeric("expected_sqm", { precision: 12, scale: 2 }),
    nextFollowUp: date("next_follow_up"),
    notes: text("notes"),
    lostAt: timestamp("lost_at", { withTimezone: true }),
    lostReason: text("lost_reason"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...stamps,
  },
  (t) => [
    index("projects_company_idx").on(t.companyId),
    index("projects_rep_idx").on(t.repId),
    index("projects_follow_up_idx").on(t.nextFollowUp),
    check("projects_expected_sqm_check", sql`${t.expectedSqm} is null or ${t.expectedSqm} >= 0`),
  ],
);

/**
 * Who else is on a company, and who else is on a project (D147, SPEC §3).
 *
 * Two tables and not one polymorphic table, which is the shape the two newest
 * tables in this file use. Those two are pointers — a notification and an audit
 * row point at a record and an orphan is harmless. A share is a permission, and
 * a stale row over a recycled id is a permission nobody granted, so these carry
 * real foreign keys and real cascades: delete the company and its shares go
 * with it, deactivate nobody and nothing dangles.
 *
 * They are two levels of one sentence. A company shared is a company SEEN — the
 * second rep reads everything under it, so no list anywhere has to draw a row
 * that refuses to open. A project shared is a project WORKED: he logs against
 * it and raises quotations and dispatches on it, and what he creates is his,
 * because an item belongs to whoever made it.
 *
 * That a person cannot be shared a thing he already owns is the action's rule
 * rather than a CHECK: the owner is a column on another table, and a constraint
 * cannot read one.
 */
export const companyShares = pgTable(
  "company_shares",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    grantedBy: uuid("granted_by")
      .notNull()
      .references(() => users.id),
    ...stamps,
  },
  (t) => [
    uniqueIndex("company_shares_company_user_idx").on(t.companyId, t.userId),
    // Every list asks it this way round: what may this person see?
    index("company_shares_user_idx").on(t.userId),
  ],
);

export const projectShares = pgTable(
  "project_shares",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    grantedBy: uuid("granted_by")
      .notNull()
      .references(() => users.id),
    ...stamps,
  },
  (t) => [
    uniqueIndex("project_shares_project_user_idx").on(t.projectId, t.userId),
    index("project_shares_user_idx").on(t.userId),
  ],
);

// The log. One row per thing that happened with a customer.
export const activities = pgTable(
  "activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    text: text("text").notNull(),
    channel: channelEnum("channel").notNull().default("visit"),
    happenedOn: date("happened_on").notNull(),
    nextFollowUp: date("next_follow_up"),
    /**
     * Unfiled: the entry was written against the wrong customer, or was a
     * mistake (D70). Archived rather than deleted (S16) — the row stays, and
     * every query that counts the log excludes it. There is no "restore": a
     * person who unfiles the wrong entry writes the right one.
     */
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...stamps,
  },
  (t) => [
    index("activities_company_happened_idx").on(t.companyId, t.happenedOn),
    index("activities_user_happened_idx").on(t.userId, t.happenedOn),
    // The whole team's day, read by day rather than by company or by person —
    // the daily report's own query, and the only one with no other index to use.
    index("activities_happened_idx").on(t.happenedOn),
    // The projects list asks each project for the last day anything was logged
    // against it. Measured at the volume floor (D107) that subquery walked the
    // whole activities table once per project — the one plan that grew with the
    // data — while its twin by company already had an index.
    index("activities_project_happened_idx").on(t.projectId, t.happenedOn),
  ],
);

// ---- quotations -------------------------------------------------------------

export const quotations = pgTable(
  "quotations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: integer("number").notNull(), // Q-{number}
    revision: integer("revision").notNull().default(1), // Q-12/2 when > 1
    // The quotation this one copies. The foreign key is added in migration 0002
    // and not declared here: Drizzle cannot express a self-reference inline
    // without a circular type, and a bare uuid pointed at nothing in particular.
    revisionOf: uuid("revision_of"),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    repId: uuid("rep_id")
      .notNull()
      .references(() => users.id),
    status: quotationStatusEnum("status").notNull().default("requested"),
    notes: text("notes"), // to the coordinator
    smacNumber: text("smac_number"),
    returnReason: text("return_reason"),
    decisionReason: text("decision_reason"),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    /**
     * Issued by the person who raised it, with nobody in between (SPEC §3).
     *
     * The coordinator sells now, and on her own customers there is no desk to
     * ask: she types the SMAC number and the paper exists in one act. The
     * founder's clause is "flagged for the manager so nobody issues their own
     * work unseen", and what that asks for is not a refusal but a name on a
     * list he reads.
     *
     * A column rather than a question asked of the audit log. Two rows and
     * their user ids would answer it today and stop answering it the first
     * time somebody trims the log or replays an import; a fact about a record
     * that a screen shows is a column on that record.
     */
    selfIssued: boolean("self_issued").notNull().default(false),
    ...stamps,
  },
  (t) => [
    uniqueIndex("quotations_number_revision_idx").on(t.number, t.revision),
    index("quotations_company_idx").on(t.companyId),
    index("quotations_rep_status_idx").on(t.repId, t.status),
    index("quotations_status_idx").on(t.status),
    // The SMAC number is the only link to the system that holds the money (S3).
    // It is typed by a person and can be wrong; it cannot be the SAME wrong twice.
    uniqueIndex("quotations_smac_number_idx").on(t.smacNumber).where(sql`${t.smacNumber} is not null`),
    // A status and the instants that belong to it agree. An issued quotation
    // with no issued_at is not an error anybody sees: it is one that has waited
    // zero days for ever, on the screen that says what is stuck.
    check(
      "quotations_issued_check",
      sql`(${t.issuedAt} is not null) = (${t.status} in ('issued','accepted','rejected'))`,
    ),
    check(
      "quotations_decided_check",
      sql`(${t.decidedAt} is not null) = (${t.status} in ('accepted','rejected','cancelled'))`,
    ),
    check(
      "quotations_smac_check",
      sql`(${t.smacNumber} is not null) = (${t.status} in ('issued','accepted','rejected'))`,
    ),
    // A reason lives exactly as long as the state it explains. It did not: the
    // rep fixed what she had sent back, the status went to `requested`, and her
    // words stayed on the row saying something untrue about it. Nothing showed
    // them — the screens ask the status first — so the column was quietly wrong
    // and every future reader of it had to know that (D72). The dispatch beside
    // it had this constraint from the start, and the quotation did not; that is
    // the whole story of how it happened.
    check(
      "quotations_returned_check",
      sql`(${t.returnReason} is not null) = (${t.status} = 'returned')`,
    ),
    // It can only be true of paper that exists. Written against `issued_at`
    // rather than against the status, because a self-issued quotation can be
    // withdrawn or rejected later and what it says stays true: she issued it.
    check("quotations_self_issued_check", sql`not ${t.selfIssued} or ${t.issuedAt} is not null`),
  ],
);

// Item 1, Item 2 … m² = width × length × qty; line total = m² × price.
export const quotationItems = pgTable(
  "quotation_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    quotationId: uuid("quotation_id")
      .notNull()
      .references(() => quotations.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    colourCode: text("colour_code").notNull(),
    supplierId: integer("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    fireRatingId: integer("fire_rating_id")
      .notNull()
      .references(() => fireRatings.id),
    classId: integer("class_id")
      .notNull()
      .references(() => classes.id),
    qty: integer("qty").notNull(),
    thicknessId: integer("thickness_id")
      .notNull()
      .references(() => thicknesses.id),
    width: numeric("width", { precision: 12, scale: 2 }).notNull(), // metres
    length: numeric("length", { precision: 12, scale: 2 }).notNull(), // metres
    pricePerSqm: numeric("price_per_sqm", { precision: 12, scale: 2 }).notNull(), // SAR
    // Generated by Postgres, never written by the app (rules/data.md).
    sqm: numeric("sqm", { precision: 12, scale: 2 }).generatedAlwaysAs(
      sql`round(width * length * qty, 2)`,
    ),
    ...stamps,
  },
  (t) => [
    index("quotation_items_quotation_idx").on(t.quotationId),
    // "Item 1, Item 2 …" is the position, and the position is how a dispatch
    // names the line it moves. Two lines at one position are one label for two
    // figures (D100). The app rewrites a quotation's lines by delete-and-insert,
    // so nothing renumbers in place against this.
    uniqueIndex("quotation_items_position_idx").on(t.quotationId, t.position),
    // Every figure on every screen is width x length x qty x price. A zero or a
    // minus in any of them is a wrong number nobody would question, because it
    // would look like arithmetic.
    check("quotation_items_qty_check", sql`${t.qty} > 0`),
    check("quotation_items_width_check", sql`${t.width} > 0`),
    check("quotation_items_length_check", sql`${t.length} > 0`),
    check("quotation_items_price_check", sql`${t.pricePerSqm} >= 0`),
  ],
);

// ---- dispatches -------------------------------------------------------------

export const dispatches = pgTable(
  "dispatches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: integer("number").notNull().unique(), // D-{number}
    quotationId: uuid("quotation_id")
      .notNull()
      .references(() => quotations.id),
    repId: uuid("rep_id")
      .notNull()
      .references(() => users.id),
    status: dispatchStatusEnum("status").notNull().default("submitted"),
    shipmentMethodId: integer("shipment_method_id")
      .notNull()
      .references(() => shipmentMethods.id),
    destination: text("destination").notNull(),
    paymentTerms: text("payment_terms").notNull(),
    smacDispatchNumber: text("smac_dispatch_number"),
    refuseReason: text("refuse_reason"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    ...stamps,
  },
  (t) => [
    index("dispatches_quotation_idx").on(t.quotationId),
    index("dispatches_rep_status_idx").on(t.repId, t.status),
    index("dispatches_status_idx").on(t.status),
    index("dispatches_approved_idx").on(t.approvedAt),
    uniqueIndex("dispatches_smac_number_idx")
      .on(t.smacDispatchNumber)
      .where(sql`${t.smacDispatchNumber} is not null`),
    check("dispatches_approved_check", sql`(${t.approvedAt} is not null) = (${t.status} = 'approved')`),
    check(
      "dispatches_smac_check",
      sql`(${t.smacDispatchNumber} is not null) = (${t.status} = 'approved')`,
    ),
    check("dispatches_refused_check", sql`(${t.refuseReason} is not null) = (${t.status} = 'refused')`),
    // Raised, and THEN approved. The demo built the two instants on two clocks —
    // working days back from today for the raising, a fixed day of this month for
    // the approval, because a month is counted from approvals — and past the first
    // days of a month the ladder overtakes the fixed day, so two seeded dispatches
    // were approved the day before they were asked for. Nothing read them in order
    // until P11J put a trail on the drawer, and then its first line said
    // "Approved" over "Requested". The app cannot write this; a seed, a migration
    // or the import that will exist next year can, which is what the rest of this
    // table's checks are for.
    check(
      "dispatches_approved_after_created_check",
      sql`${t.approvedAt} is null or ${t.approvedAt} >= ${t.createdAt}`,
    ),
  ],
);

export const dispatchItems = pgTable(
  "dispatch_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dispatchId: uuid("dispatch_id")
      .notNull()
      .references(() => dispatches.id, { onDelete: "cascade" }),
    quotationItemId: uuid("quotation_item_id")
      .notNull()
      .references(() => quotationItems.id),
    qty: integer("qty").notNull(),
    ...stamps,
  },
  (t) => [
    index("dispatch_items_dispatch_idx").on(t.dispatchId),
    // One line of a quotation appears once on a dispatch. Twice would double the
    // m2 it moved, in the one figure the whole month is measured by (S43).
    uniqueIndex("dispatch_items_line_idx").on(t.dispatchId, t.quotationItemId),
    check("dispatch_items_qty_check", sql`${t.qty} > 0`),
  ],
);

// ---- credit -----------------------------------------------------------------
// Whose these metres are (SPEC §3, D148). Two reps can work one job now, and
// the founder's rule is that credit is chosen per quotation and per dispatch
// and never inherited: some reps genuinely share a job, some are only helping,
// and a helper writes his own daily report without taking the metres.
//
// Rows, not a column. A column naming one rep, with "split" as its empty case,
// would make a finished month move the day somebody joined or left the job —
// a share list is a permission and changes, and what a month was worth does
// not. These rows freeze WHO at the moment of the raise.
//
// And they hold only the who. How much each person's share IS is computed from
// the record's own lines by `src/lib/credit.ts`, so a dispatch whose quantities
// are corrected cannot end up carrying stored shares that no longer add back to
// it — the same trap as a reason column outliving the state it explains (D72),
// one table along.
//
// The user is referenced without a cascade, unlike a share. A share is a
// permission and vanishes with the person; a credit is what a month was made
// of, and it outlives everybody.

export const quotationCredits = pgTable(
  "quotation_credits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    quotationId: uuid("quotation_id")
      .notNull()
      .references(() => quotations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    ...stamps,
  },
  (t) => [
    // One person is credited on one record once. Twice would count his own
    // quotation twice in his own funnel.
    uniqueIndex("quotation_credits_quotation_user_idx").on(t.quotationId, t.userId),
    // Every figure asks it this way round: what is this person's?
    index("quotation_credits_user_idx").on(t.userId),
  ],
);

export const dispatchCredits = pgTable(
  "dispatch_credits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dispatchId: uuid("dispatch_id")
      .notNull()
      .references(() => dispatches.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    ...stamps,
  },
  (t) => [
    uniqueIndex("dispatch_credits_dispatch_user_idx").on(t.dispatchId, t.userId),
    index("dispatch_credits_user_idx").on(t.userId),
  ],
);
// ---- targets ----------------------------------------------------------------
// `month` is the first day of the month. Targets are m², never money.

export const targets = pgTable(
  "targets",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    month: date("month").notNull(),
    sqm: numeric("sqm", { precision: 12, scale: 2 }).notNull(),
    ...stamps,
  },
  (t) => [
    uniqueIndex("targets_user_month_idx").on(t.userId, t.month),
    check("targets_sqm_check", sql`${t.sqm} >= 0`),
    // The action normalises the month to its first day; the unique index above
    // only means anything if every writer does (D100). A target on the 15th
    // would sit beside the one on the 1st, and the month would have two.
    check("targets_month_check", sql`${t.month} = date_trunc('month', ${t.month})::date`),
  ],
);

export const companyTargets = pgTable(
  "company_targets",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    month: date("month").notNull().unique(),
    sqm: numeric("sqm", { precision: 12, scale: 2 }).notNull(),
    ...stamps,
  },
  (t) => [
    check("company_targets_sqm_check", sql`${t.sqm} >= 0`),
    check("company_targets_month_check", sql`${t.month} = date_trunc('month', ${t.month})::date`),
  ],
);

// ---- the daily report --------------------------------------------------------

/**
 * One line a day, from the person whose day it was (SPEC D55).
 *
 * Only the sentence is stored. Everything a machine can know — visits logged,
 * quotations raised and sent back, dispatches approved, the m² they moved, the
 * calls that were due — is assembled from the records every time it is read, so
 * a visit logged late lands on the day it happened and the report changes with
 * it. Storing those figures here would be a second answer to every one of them
 * (rules/data.md, one definition per figure).
 *
 * `note` is never empty: an empty report is not a report, and a row that exists
 * to say nothing would make "who wrote today" a lie.
 */
export const dailyReports = pgTable(
  "daily_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** The Riyadh day it is about, not the instant it was written. */
    day: date("day").notNull(),
    note: text("note").notNull(),
    ...stamps,
  },
  (t) => [
    uniqueIndex("daily_reports_user_day_idx").on(t.userId, t.day),
    index("daily_reports_day_idx").on(t.day),
    // At least one character that is not whitespace. It was `length(btrim(note))
    // > 0`, and `btrim` with no second argument strips SPACES only — so a report
    // of newlines and tabs passed a check written to refuse an empty one, and
    // `tests/schema.spec.ts` caught it by trying exactly that. The app's own Zod
    // `.trim()` was stricter than the column, which is the wrong way round: the
    // column is the guard for the ways in that are not the app.
    check("daily_reports_note_check", sql`${t.note} ~ '[^[:space:]]'`),
  ],
);

// ---- notifications and audit -------------------------------------------------
// `kind` + `params` render in the reader's language ("Q-12 issued" / "تم إصدار Q-12").

/**
 * The three kinds of record a notice can be about. Here rather than in
 * `src/lib/notify.ts` because the column is what enforces it: a fourth one
 * would need a column value, and this is where a reader looks for the list.
 */
export const NOTIFICATION_SUBJECT_TYPES = ["quotation", "dispatch", "company", "project"] as const;
export type NotificationSubjectType = (typeof NOTIFICATION_SUBJECT_TYPES)[number];

/**
 * Every kind of notice the app writes. The row holds no words — the sentence is
 * built in the reader's language at read time from this kind and its params
 * (D13) — so a kind is a key in both locales (`notifications.<kind>`, read by
 * the message check) and a value the column refuses anything else for (D106).
 * Here rather than in src/lib/notify.ts because the check reads it, and the
 * schema cannot import from lib without a cycle; notify.ts re-exports it.
 */
export const NOTIFICATION_KINDS = [
  "quotationRequested",
  "quotationIssued",
  "quotationReturned",
  "quotationAccepted",
  "quotationRejected",
  "quotationCancelled",
  "dispatchRequested",
  "dispatchApproved",
  "dispatchRefused",
  "companyHandedOver",
  "companyShared",
  "projectShared",
  // A lead marketing filed and gave away, and the receiver saying he has it
  // (SPEC §3, P12-7). Both directions, because a handoff nobody confirms is a
  // customer two people each think the other is calling.
  "leadAssigned",
  "leadAcknowledged",
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").$type<NotificationKind>().notNull(),
    params: jsonb("params").$type<Record<string, string | number>>().notNull().default({}),
    link: text("link").notNull(),
    /**
     * What this notice is ABOUT — the record its link points at, named rather
     * than parsed out of the link (D79). A notice is a pointer, and until this
     * column existed the only copy of what it pointed at was a URL: nothing
     * could ask "is this still true?", so a notice about a request the rep
     * fixed a week ago stayed on his screen and in his bell for ever.
     */
    subjectType: text("subject_type").$type<NotificationSubjectType>().notNull(),
    subjectId: uuid("subject_id").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    ...stamps,
  },
  (t) => [
    index("notifications_user_unread_idx").on(t.userId, t.readAt),
    // How the clearing finds them: every transition asks for one subject's
    // notices and deletes the kinds that transition has just made untrue.
    index("notifications_subject_idx").on(t.subjectType, t.subjectId),
    // The list above was a TypeScript union over a text column: closed in the
    // editor, open in the database, so a seed or a migration could write a
    // fourth kind that no clearing would ever find (D100). The check reads the
    // same constant the type is derived from — one list, not two.
    check(
      "notifications_subject_type_check",
      sql`${t.subjectType} in (${sql.raw(NOTIFICATION_SUBJECT_TYPES.map((v) => `'${v}'`).join(", "))})`,
    ),
    // The same for the kind: a notice with a kind no locale has a sentence for
    // would reach the bell as a raw key (D106).
    check(
      "notifications_kind_check",
      sql`${t.kind} in (${sql.raw(NOTIFICATION_KINDS.map((v) => `'${v}'`).join(", "))})`,
    ),
  ],
);

/**
 * The kinds of record the trail is written against (D106): the eight records
 * of the floor, the two admin settings, and the eight reference lists the
 * admin edits — those from their one source, `LOOKUP_KINDS`, so a ninth list
 * is a ninth kind the day it is added. `action` stays open on purpose: it is a
 * family per record kind (quotationEvent and its siblings) and the trail
 * refuses an action it has no word for at read time; the record kind is a
 * closed list, and the column now says so. The first draft of this list was
 * the eight a grep for literals found; the compiler found the rest in the
 * admin's helper, which takes the kind as an argument.
 */
export const AUDIT_RECORD_TYPES = [
  "company",
  "contact",
  "project",
  "activity",
  "quotation",
  "dispatch",
  "daily_report",
  "user",
  "companyTarget",
  "nonWorkingDay",
  "companyShare",
  "projectShare",
  ...LOOKUP_KINDS,
] as const;
export type AuditRecordType = (typeof AUDIT_RECORD_TYPES)[number];

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }), // who
    action: text("action").notNull(), // what
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(), // when
    recordType: text("record_type").$type<AuditRecordType>().notNull(), // record
    recordId: text("record_id").notNull(),
    details: jsonb("details").$type<Record<string, unknown>>(),
    ...stamps,
  },
  (t) => [
    index("audit_log_record_idx").on(t.recordType, t.recordId),
    // "How many times did this come back?" is answered from here — every
    // transition is already an audit row with who and when, so a second history
    // table beside it would be a second answer to one question (rules/data.md).
    index("audit_log_action_at_idx").on(t.action, t.at),
    // "What did each person do in the last window?" (admin/use, D100) reads
    // this table by user and instant; without this it scanned every row per
    // person, fourteen times, on the one screen meant to be opened at volume.
    index("audit_log_user_at_idx").on(t.userId, t.at),
    check(
      "audit_log_record_type_check",
      sql`${t.recordType} in (${sql.raw(AUDIT_RECORD_TYPES.map((v) => `'${v}'`).join(", "))})`,
    ),
  ],
);

// ---- relations (for db.query) ----------------------------------------------

export const usersRelations = relations(users, ({ many }) => ({
  companies: many(companies),
  sessions: many(sessions),
  notifications: many(notifications),
  targets: many(targets),
}));

export const companiesRelations = relations(companies, ({ one, many }) => ({
  rep: one(users, { fields: [companies.repId], references: [users.id] }),
  category: one(companyCategories, {
    fields: [companies.categoryId],
    references: [companyCategories.id],
  }),
  leadSource: one(leadSources, { fields: [companies.leadSourceId], references: [leadSources.id] }),
  country: one(countries, { fields: [companies.countryId], references: [countries.id] }),
  city: one(cities, { fields: [companies.cityId], references: [cities.id] }),
  contacts: many(contacts),
  projects: many(projects),
  activities: many(activities),
  quotations: many(quotations),
}));

export const contactsRelations = relations(contacts, ({ one }) => ({
  company: one(companies, { fields: [contacts.companyId], references: [companies.id] }),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  company: one(companies, { fields: [projects.companyId], references: [companies.id] }),
  activities: many(activities),
  quotations: many(quotations),
}));

export const activitiesRelations = relations(activities, ({ one }) => ({
  company: one(companies, { fields: [activities.companyId], references: [companies.id] }),
  project: one(projects, { fields: [activities.projectId], references: [projects.id] }),
  contact: one(contacts, { fields: [activities.contactId], references: [contacts.id] }),
  user: one(users, { fields: [activities.userId], references: [users.id] }),
}));

export const quotationsRelations = relations(quotations, ({ one, many }) => ({
  company: one(companies, { fields: [quotations.companyId], references: [companies.id] }),
  project: one(projects, { fields: [quotations.projectId], references: [projects.id] }),
  rep: one(users, { fields: [quotations.repId], references: [users.id] }),
  items: many(quotationItems),
  dispatches: many(dispatches),
}));

export const quotationItemsRelations = relations(quotationItems, ({ one }) => ({
  quotation: one(quotations, { fields: [quotationItems.quotationId], references: [quotations.id] }),
  supplier: one(suppliers, { fields: [quotationItems.supplierId], references: [suppliers.id] }),
  fireRating: one(fireRatings, {
    fields: [quotationItems.fireRatingId],
    references: [fireRatings.id],
  }),
  class: one(classes, { fields: [quotationItems.classId], references: [classes.id] }),
  thickness: one(thicknesses, { fields: [quotationItems.thicknessId], references: [thicknesses.id] }),
}));

export const dispatchesRelations = relations(dispatches, ({ one, many }) => ({
  quotation: one(quotations, { fields: [dispatches.quotationId], references: [quotations.id] }),
  rep: one(users, { fields: [dispatches.repId], references: [users.id] }),
  shipmentMethod: one(shipmentMethods, {
    fields: [dispatches.shipmentMethodId],
    references: [shipmentMethods.id],
  }),
  items: many(dispatchItems),
}));

export const dispatchItemsRelations = relations(dispatchItems, ({ one }) => ({
  dispatch: one(dispatches, { fields: [dispatchItems.dispatchId], references: [dispatches.id] }),
  quotationItem: one(quotationItems, {
    fields: [dispatchItems.quotationItemId],
    references: [quotationItems.id],
  }),
}));

export const citiesRelations = relations(cities, ({ one }) => ({
  country: one(countries, { fields: [cities.countryId], references: [countries.id] }),
}));

// Keep `sql` imported for future computed defaults; referenced so lint stays quiet.
export const riyadhToday = sql`(now() at time zone 'Asia/Riyadh')::date`;
