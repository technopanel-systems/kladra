"use server";

/**
 * The two reads the Add dialogs need.
 *
 * `AddCompanyDialog` and `AddContactDialog` are client components — a rep types
 * into them and the country steers the city — so they cannot call `@/lib/lookups`
 * directly, and their prop contract (`{ trigger }`, `{ companyId, trigger }`)
 * leaves no room for a parent to hand the lists down. This is the tiny server
 * wrapper they call instead: one round trip on the first open, cached in the
 * browser for the rest of the page.
 *
 * Reads as server actions rather than route handlers, following
 * `src/actions/search.ts` — the palette does the same thing for the same reason,
 * and the types survive the wire.
 */

import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { NotAllowed, refusalKey, requireActor } from "@/lib/authz";
import { findPossibleDuplicates, getCompany } from "@/lib/companies";
import { creditPoolNamed } from "@/lib/credit-rows";
import {
  lastDispatchForQuotation,
  remainingOnQuotation,
  type LastDispatch,
  type RemainingItem,
} from "@/lib/dispatches";
import {
  type CityOption,
  type CountryOption,
  type LookupOption,
  SAUDI_CODE,
  listCategories,
  listCitiesForCountry,
  listClasses,
  listCountries,
  listFireRatings,
  listLeadSources,
  seesEveryLeadSource,
  listPositions,
  listShipmentMethods,
  listSuppliers,
  listThicknesses,
  listWarehouses,
} from "@/lib/lookups";
import type { LastQuotation } from "@/lib/quotation-draft";
import { STANDARD_THICKNESS_MM } from "@/lib/sheet";
import { getProject } from "@/lib/projects";
import { getQuotation, lastQuotationForCompany } from "@/lib/quotations";
import type { ActionResult } from "@/lib/types";

/**
 * One row of a searchable dropdown. `value` is the row's id as a string,
 * `label` is already in the reader's language, `pinned` marks the common values
 * the list shows first, and `keywords` carries the other-script spelling so a
 * rep can search "Riyadh" or "الرياض" whichever language he is in (SPEC D7).
 */
export type Option = { value: string; label: string; pinned?: boolean; keywords?: string };

/**
 * A lookup row as a dropdown offers it. The id becomes the form value — the
 * database's own key, so nothing is matched on a name that an admin may
 * rename — and the other-script spelling becomes the search keywords. Only
 * `label` is ever rendered.
 */
function toOption(row: LookupOption | CityOption | CountryOption): Option {
  const pinned = "pinned" in row && row.pinned !== null;
  return { value: String(row.id), label: row.name, pinned, keywords: row.alt };
}

export type FormLookups = {
  categories: Option[];
  leadSources: Option[];
  positions: Option[];
  countries: Option[];
  /**
   * Option value → ISO code, so the form can read a typed phone in the country
   * just picked (D89). Never rendered: the screens say words, not codes.
   */
  countryCodes: Record<string, string>;
  /** Saudi cities. Everywhere else the city is free text (SPEC §3). */
  cities: Option[];
  /** Preselected, and the one country that gets a city list rather than a box. */
  saudiCountry: string | null;
  /** Riyadh — the first pinned Saudi city (SPEC §3). */
  defaultCity: string | null;
};

/** A company already on file that this one might be (SPEC D8). Never blocks. */
export type DuplicateHit = {
  id: string;
  name: string;
  rep: string;
  matchedOn: "name" | "phone";
  city: string | null;
  /** A Riyadh day, or null for a company nobody has logged against. */
  lastActivityOn: string | null;
  /** Off the floor: the Riyadh day it left, and the reason typed then (S16, D109). */
  archived: { on: string; reason: string | null } | null;
  /** On the asker's own floor, so the warning may be a door to it (S8, D121). */
  mine: boolean;
};

/**
 * Every list the two Add dialogs offer, in the reader's language.
 *
 * The lists themselves belong to `@/lib/lookups` — one definition, so the
 * dialog and the admin's Lookups screen can never disagree about what "Other
 * last" means. This only picks the two preselections out of them: Saudi Arabia
 * by its ISO code, falling back to the first pinned country, and Riyadh as the
 * first pinned Saudi city. Neither is matched on a name string, so renaming a
 * row in Lookups cannot silently move the default.
 */
export async function formLookupsAction(): Promise<ActionResult<FormLookups>> {
  const t = await getTranslations("common");
  let actor;
  try {
    actor = await requireActor();
  } catch (error) {
    // A session that has ended says so, and a failure that is not a refusal at
    // all does not claim to be one (D135).
    if (error instanceof NotAllowed) return { ok: false, error: t(refusalKey(error)) };
    return { ok: false, error: t("somethingWrong") };
  }

  try {
    const [categories, leadSources, positions, countryRows] = await Promise.all([
      listCategories(),
      // Management and marketing are offered the whole list; a rep is not
      // offered Marketing (SPEC §3, narrowing D1), and `addCompanyAction`
      // refuses the id if he sends it anyway.
      listLeadSources(undefined, seesEveryLeadSource(actor.role)),
      listPositions(),
      listCountries(),
    ]);

    const saudi =
      countryRows.find((row) => row.code === SAUDI_CODE) ??
      countryRows.find((row) => row.pinned !== null) ??
      null;
    const cityRows = saudi ? await listCitiesForCountry(saudi.id) : [];
    const riyadh = cityRows.find((city) => city.pinned !== null) ?? cityRows[0] ?? null;

    return {
      ok: true,
      data: {
        categories: categories.map(toOption),
        leadSources: leadSources.map(toOption),
        positions: positions.map(toOption),
        // Mapped rather than passed through: `code` is ours to pick Saudi
        // Arabia with, not the dialog's to render — a rep never sees "SA"
        // (DESIGN §2, words not codes).
        countries: countryRows.map(toOption),
        countryCodes: Object.fromEntries(countryRows.map((row) => [String(row.id), row.code])),
        cities: cityRows.map(toOption),
        saudiCountry: saudi ? String(saudi.id) : null,
        defaultCity: riyadh ? String(riyadh.id) : null,
      },
    };
  } catch {
    return { ok: false, error: t("somethingWrong") };
  }
}

/**
 * Every list a quotation line offers (SPEC §3, S32).
 *
 * None of them is translated — a supplier is N, K, C or D in both languages —
 * so unlike the company lists these come back the same whoever is reading.
 * Standard values are marked so the dialog can open on them: 4 mm is the
 * standard thickness and 1.24 × 5.8 m is the standard sheet (S32), which is
 * most lines most days.
 */
export type QuotationLookups = {
  suppliers: Option[];
  fireRatings: Option[];
  classes: Option[];
  thicknesses: Option[];
  /** 4 mm, the thickness on most lines (S32); null on a database that dropped it. */
  standardThickness: string | null;
  /**
   * Where the panels are (SPEC §3, P12-9). One per whole quotation, so it is
   * here with the lists rather than with the lines.
   */
  warehouses: Option[];
  /** The founder's first store, which is what the form opens on. */
  defaultWarehouse: string | null;
};

export async function quotationLookupsAction(): Promise<ActionResult<QuotationLookups>> {
  const t = await getTranslations("common");
  try {
    await requireActor();
  } catch (error) {
    // A session that has ended says so, and a failure that is not a refusal at
    // all does not claim to be one (D135).
    if (error instanceof NotAllowed) return { ok: false, error: t(refusalKey(error)) };
    return { ok: false, error: t("somethingWrong") };
  }

  try {
    const [supplierRows, fireRatingRows, classRows, thicknessRows, warehouseRows] =
      await Promise.all([
        listSuppliers(),
        listFireRatings(),
        listClasses(),
        listThicknesses(),
        listWarehouses(),
      ]);

    // Matched on the number, not on the row's position: an admin adding 3 mm
    // above it must not move what the dialog opens on.
    const standard =
      thicknessRows.find((row) => Number(row.name) === STANDARD_THICKNESS_MM) ?? null;

    return {
      ok: true,
      data: {
        suppliers: supplierRows.map(toOption),
        fireRatings: fireRatingRows.map(toOption),
        classes: classRows.map(toOption),
        thicknesses: thicknessRows.map(toOption),
        standardThickness: standard ? String(standard.id) : null,
        warehouses: warehouseRows.map(toOption),
        // The first ACTIVE row, which the query has already ordered by the
        // founder's own order — never a name matched in code, because the admin
        // may rename any of these in either language (D39).
        defaultWarehouse: warehouseRows[0] ? String(warehouseRows[0].id) : null,
      },
    };
  } catch {
    return { ok: false, error: t("somethingWrong") };
  }
}

/**
 * What the dispatch dialog needs that does not change while it is open: how the
 * panels may travel (S40, D12).
 *
 * The quantities are NOT here. What is left on a quotation line changes every
 * time anybody raises a dispatch anywhere, so it is fetched per quotation, per
 * open — `remainingItemsAction` below — and never cached.
 */
export type DispatchLookups = {
  shipmentMethods: Option[];
  /** The first one, so the dialog opens on something rather than on nothing. */
  defaultMethod: string | null;
  /** Where the panels are (SPEC §3, P12-9) — one per whole dispatch. */
  warehouses: Option[];
  /**
   * The first store, for the case where the dialog has no quotation to read
   * one off. It opens on the QUOTATION's own where it has one, which is not
   * carrying forward: a dispatch reads its own parent, the way its lines do.
   */
  defaultWarehouse: string | null;
};

export async function dispatchLookupsAction(): Promise<ActionResult<DispatchLookups>> {
  const t = await getTranslations("common");
  try {
    await requireActor();
  } catch (error) {
    // A session that has ended says so, and a failure that is not a refusal at
    // all does not claim to be one (D135).
    if (error instanceof NotAllowed) return { ok: false, error: t(refusalKey(error)) };
    return { ok: false, error: t("somethingWrong") };
  }

  try {
    const [rows, warehouseRows] = await Promise.all([listShipmentMethods(), listWarehouses()]);
    return {
      ok: true,
      data: {
        shipmentMethods: rows.map(toOption),
        defaultMethod: rows[0] ? String(rows[0].id) : null,
        warehouses: warehouseRows.map(toOption),
        defaultWarehouse: warehouseRows[0] ? String(warehouseRows[0].id) : null,
      },
    };
  } catch {
    return { ok: false, error: t("somethingWrong") };
  }
}

/**
 * The last quotation raised at a company, for a new one to start from
 * (D74, 9A item 7).
 *
 * Asked per open and never cached: he raises one, comes back an hour later, and
 * the one he means is the one he just raised. Asked here rather than handed down
 * as a prop because the company is not always known when the dialog is built —
 * on the Quotations screen he picks the project inside the form, and the offer
 * has to follow what he picked.
 *
 * No quotation is not an error: a new customer has nothing to copy, and the
 * answer is simply that there is nothing to offer.
 */
export async function lastQuotationAction(
  companyId: unknown,
): Promise<ActionResult<LastQuotation>> {
  const t = await getTranslations("common");
  let actor;
  try {
    actor = await requireActor();
  } catch (error) {
    // A session that has ended says so, and a failure that is not a refusal at
    // all does not claim to be one (D135).
    if (error instanceof NotAllowed) return { ok: false, error: t(refusalKey(error)) };
    return { ok: false, error: t("somethingWrong") };
  }

  const parsed = z.uuid().safeParse(companyId);
  if (!parsed.success) return { ok: false, error: t("invalid") };

  try {
    const last = await lastQuotationForCompany(actor, parsed.data);
    return last ? { ok: true, data: last } : { ok: true };
  } catch (error) {
    // A session that has ended says so, and a failure that is not a refusal at
    // all does not claim to be one (D135).
    if (error instanceof NotAllowed) return { ok: false, error: t(refusalKey(error)) };
    return { ok: false, error: t("somethingWrong") };
  }
}

/**
 * The last dispatch raised against one quotation, for the next one to start
 * from (D81).
 *
 * The same shape as the offer one screen back, and the same reason: on the
 * Dispatches screen the quotation is picked inside the form, so the answer has
 * to follow what he picked rather than be handed down when the dialog is built.
 *
 * Nothing to copy is not an error — the first dispatch against a job has no
 * previous one, which is most of them.
 */
export async function lastDispatchAction(
  quotationId: unknown,
): Promise<ActionResult<LastDispatch>> {
  const t = await getTranslations("common");
  let actor;
  try {
    actor = await requireActor();
  } catch (error) {
    // A session that has ended says so, and a failure that is not a refusal at
    // all does not claim to be one (D135).
    if (error instanceof NotAllowed) return { ok: false, error: t(refusalKey(error)) };
    return { ok: false, error: t("somethingWrong") };
  }

  const parsed = z.uuid().safeParse(quotationId);
  if (!parsed.success) return { ok: false, error: t("invalid") };

  try {
    const last = await lastDispatchForQuotation(actor, parsed.data);
    return last ? { ok: true, data: last } : { ok: true };
  } catch (error) {
    // A session that has ended says so, and a failure that is not a refusal at
    // all does not claim to be one (D135).
    if (error instanceof NotAllowed) return { ok: false, error: t(refusalKey(error)) };
    return { ok: false, error: t("somethingWrong") };
  }
}

/**
 * What is left to send on each line of one quotation (D12), and which store it
 * was priced out of (P12-9).
 *
 * Read fresh every time the dialog opens, because the first of the two moves:
 * another dispatch raised a minute ago has already spent some of it. The action
 * re-checks the same rule inside its transaction, so this is the courtesy and
 * that is the law.
 *
 * The store rides along rather than taking a round trip of its own. This read
 * already loads the quotation — that is how it authorizes itself — and the
 * dialog needs both answers before it can draw a field, so a second call would
 * be a second wait for something already in hand.
 */
export type QuotationToSendAgainst = {
  items: RemainingItem[];
  /** The quotation's own store, which the dispatch dialog opens on. */
  warehouseId: string;
};

export async function remainingItemsAction(
  quotationId: unknown,
  dispatchId?: unknown,
): Promise<ActionResult<QuotationToSendAgainst>> {
  const t = await getTranslations("common");
  let actor;
  try {
    actor = await requireActor();
  } catch (error) {
    // A session that has ended says so, and a failure that is not a refusal at
    // all does not claim to be one (D135).
    if (error instanceof NotAllowed) return { ok: false, error: t(refusalKey(error)) };
    return { ok: false, error: t("somethingWrong") };
  }

  const parsed = z
    .object({ quotationId: z.uuid(), dispatchId: z.uuid().optional() })
    .safeParse({ quotationId, dispatchId: dispatchId ?? undefined });
  if (!parsed.success) return { ok: false, error: t("invalid") };

  try {
    // Asked through getQuotation so the same authorization decides it: a rep
    // who may not read the quotation may not read what is left on it either.
    const quotation = await getQuotation(actor, parsed.data.quotationId);
    if (!quotation) return { ok: false, error: t("somethingWrong") };
    return {
      ok: true,
      data: {
        items: await remainingOnQuotation(parsed.data.quotationId, parsed.data.dispatchId),
        warehouseId: String(quotation.warehouseId),
      },
    };
  } catch (error) {
    // A session that has ended says so, and a failure that is not a refusal at
    // all does not claim to be one (D135).
    if (error instanceof NotAllowed) return { ok: false, error: t(refusalKey(error)) };
    return { ok: false, error: t("somethingWrong") };
  }
}

/**
 * Who at a customer a quotation may be addressed to (P12-9).
 *
 * The last link of company → project → contact, and the only one that needs a
 * round trip: the companies and the jobs are drawn before the dialog opens, and
 * the people belong to whichever customer he has just picked.
 *
 * Everybody on the record, not only the reader's own. Two reps on one customer
 * each keep their own contacts (§3, D147), and the person the paper goes to is
 * the person the paper goes to whoever wrote him down first.
 *
 * Authorized by opening the company, never by a query of its own: a rep who may
 * not open a customer may not learn who works there either.
 */
export type ContactChoices = {
  people: Option[];
  /** The one the form starts on: the only one there is, or nobody (D115). */
  only: string;
};

export async function contactChoicesAction(input: unknown): Promise<ActionResult<ContactChoices>> {
  const t = await getTranslations("common");
  let actor;
  try {
    actor = await requireActor();
  } catch (error) {
    if (error instanceof NotAllowed) return { ok: false, error: t(refusalKey(error)) };
    return { ok: false, error: t("somethingWrong") };
  }

  const parsed = z.object({ companyId: z.uuid() }).safeParse(input ?? {});
  if (!parsed.success) return { ok: false, error: t("invalid") };

  try {
    const company = await getCompany(actor, parsed.data.companyId);
    if (!company) return { ok: false, error: t("somethingWrong") };
    const people = company.contacts.map((row) => ({ value: row.id, label: row.name }));
    // The one there is, when there is only one; with several it opens on nobody,
    // because a guess would put the wrong name on the paper (D115).
    return { ok: true, data: { people, only: people.length === 1 ? people[0].value : "" } };
  } catch (error) {
    if (error instanceof NotAllowed) return { ok: false, error: t(refusalKey(error)) };
    return { ok: false, error: t("somethingWrong") };
  }
}

/**
 * Who a quotation or a dispatch may be credited to, for the dialog that asks
 * (SPEC §3, D148).
 *
 * Empty means do not ask. A job one rep works has one possible answer and a
 * question with one answer on a form is a tap a rep pays for every day for
 * nothing — the founder's own line is that where the project has one rep the
 * question is not asked at all.
 *
 * Read fresh when the dialog opens, like everything else these forms fetch: a
 * rep can be put on a job or taken off it while the screen is open, and the
 * action behind the Save re-derives this list inside its own transaction. This
 * is the courtesy; that is the law.
 */
export type CreditChoices = {
  /** Everybody on the job, named in the reader's script (D68). Empty when there is nothing to ask. */
  people: Option[];
  /** The one the form starts on: whoever is filling it in. */
  mine: string;
};

export async function creditChoicesAction(
  input: unknown,
): Promise<ActionResult<CreditChoices>> {
  const t = await getTranslations("common");
  let actor;
  try {
    actor = await requireActor();
  } catch (error) {
    if (error instanceof NotAllowed) return { ok: false, error: t(refusalKey(error)) };
    return { ok: false, error: t("somethingWrong") };
  }

  const parsed = z
    .object({ quotationId: z.uuid().optional(), projectId: z.uuid().optional() })
    .safeParse(input ?? {});
  if (!parsed.success) return { ok: false, error: t("invalid") };

  try {
    // Authorized the same way the record itself is read, never by a query of
    // its own: a rep who may not open the quotation may not learn who works
    // the job behind it either.
    let projectId = parsed.data.projectId ?? null;
    if (parsed.data.quotationId) {
      const quotation = await getQuotation(actor, parsed.data.quotationId);
      if (!quotation) return { ok: false, error: t("somethingWrong") };
      projectId = quotation.projectId;
    } else if (projectId) {
      const project = await getProject(actor, projectId);
      if (!project) return { ok: false, error: t("somethingWrong") };
    }
    const people = await creditPoolNamed(projectId, actor.id);
    // One name is not a question. The founder's own line: where the project
    // has one rep the dialog asks nothing at all.
    if (people.length < 2) return { ok: true, data: { people: [], mine: actor.id } };
    return { ok: true, data: { people, mine: actor.id } };
  } catch (error) {
    if (error instanceof NotAllowed) return { ok: false, error: t(refusalKey(error)) };
    return { ok: false, error: t("somethingWrong") };
  }
}

const duplicateInput = z.object({
  name: z.string().max(200).default(""),
  phone: z.string().max(40).default(""),
  /** The country picked on the form, so a local number is read there (D89). */
  country: z.string().length(2).optional(),
});

/**
 * "Looks like an existing company" (SPEC D8, S14, S15).
 *
 * The matching itself belongs to `findPossibleDuplicates` in `@/lib/companies`
 * — one definition, so this warning and a later edit screen's cannot disagree
 * about what counts as the same company. This only takes the strongest hit and
 * names the rep who owns it.
 *
 * The answer is advice. Nothing here can stop a save (SPEC S15).
 */
export async function duplicateCheckAction(
  name: unknown,
  phone: unknown,
  country?: unknown,
): Promise<ActionResult<DuplicateHit | null>> {
  const t = await getTranslations("common");
  let actor: Awaited<ReturnType<typeof requireActor>>;
  try {
    actor = await requireActor();
  } catch (error) {
    // A session that has ended says so, and a failure that is not a refusal at
    // all does not claim to be one (D135).
    if (error instanceof NotAllowed) return { ok: false, error: t(refusalKey(error)) };
    return { ok: false, error: t("somethingWrong") };
  }

  const parsed = duplicateInput.safeParse({ name, phone, country });
  if (!parsed.success) return { ok: true, data: null };

  try {
    const [hit] = await findPossibleDuplicates({
      name: parsed.data.name,
      phone: parsed.data.phone,
      country: parsed.data.country,
      limit: 1,
    });
    if (!hit) return { ok: true, data: null };
    return {
      ok: true,
      data: {
        id: hit.id,
        name: hit.name,
        rep: hit.repName,
        matchedOn: hit.matchedOn,
        city: hit.city,
        lastActivityOn: hit.lastActivityOn,
        archived: hit.archivedOn ? { on: hit.archivedOn, reason: hit.archiveReason } : null,
        // His own floor is the one he may open (S8): the warning is a door only then (D121).
        mine: hit.repId === actor.id,
      },
    };
  } catch {
    // A warning that cannot be computed is not an error a rep should see; the
    // save is unaffected either way.
    return { ok: true, data: null };
  }
}
