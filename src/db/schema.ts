/**
 * Kladra schema. Plain names, small, every table with created_at / updated_at.
 * Money and m² are numeric; dates that are "a day in Riyadh" are `date`;
 * instants are timestamptz. No RLS — authorization lives in src/lib/authz.ts.
 */
import { relations, sql } from "drizzle-orm";
import {
  boolean,
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

export const roleEnum = pgEnum("role", ["rep", "marketing", "coordinator", "manager", "admin"]);
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
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").notNull().default("rep"),
  active: boolean("active").notNull().default(true),
  locale: text("locale").notNull().default("en"),
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
    ...stamps,
  },
  (t) => [
    index("companies_rep_idx").on(t.repId),
    index("companies_name_idx").on(t.name),
    index("companies_follow_up_idx").on(t.nextFollowUp),
    index("companies_updated_idx").on(t.updatedAt),
  ],
);

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
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
    index("contacts_phone_idx").on(t.phoneNormalized),
    uniqueIndex("contacts_company_phone_idx").on(t.companyId, t.phoneNormalized),
  ],
);

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
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
    index("projects_follow_up_idx").on(t.nextFollowUp),
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
    ...stamps,
  },
  (t) => [
    index("activities_company_happened_idx").on(t.companyId, t.happenedOn),
    index("activities_user_happened_idx").on(t.userId, t.happenedOn),
  ],
);

// ---- quotations -------------------------------------------------------------

export const quotations = pgTable(
  "quotations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: integer("number").notNull(), // Q-{number}
    revision: integer("revision").notNull().default(1), // Q-12/2 when > 1
    revisionOf: uuid("revision_of"), // the quotation this one copies (self-reference)
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
    ...stamps,
  },
  (t) => [
    uniqueIndex("quotations_number_revision_idx").on(t.number, t.revision),
    index("quotations_company_idx").on(t.companyId),
    index("quotations_rep_status_idx").on(t.repId, t.status),
    index("quotations_status_idx").on(t.status),
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
  (t) => [index("quotation_items_quotation_idx").on(t.quotationId)],
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
  (t) => [index("dispatch_items_dispatch_idx").on(t.dispatchId)],
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
  (t) => [uniqueIndex("targets_user_month_idx").on(t.userId, t.month)],
);

export const companyTargets = pgTable("company_targets", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  month: date("month").notNull().unique(),
  sqm: numeric("sqm", { precision: 12, scale: 2 }).notNull(),
  ...stamps,
});

// ---- notifications and audit -------------------------------------------------
// `kind` + `params` render in the reader's language ("Q-12 issued" / "تم إصدار Q-12").

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    params: jsonb("params").$type<Record<string, string | number>>().notNull().default({}),
    link: text("link").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    ...stamps,
  },
  (t) => [index("notifications_user_unread_idx").on(t.userId, t.readAt)],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }), // who
    action: text("action").notNull(), // what
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(), // when
    recordType: text("record_type").notNull(), // record
    recordId: text("record_id").notNull(),
    details: jsonb("details").$type<Record<string, unknown>>(),
    ...stamps,
  },
  (t) => [index("audit_log_record_idx").on(t.recordType, t.recordId)],
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
