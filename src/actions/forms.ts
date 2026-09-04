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
import { requireActor } from "@/lib/authz";
import { findPossibleDuplicates } from "@/lib/companies";
import { remainingOnQuotation, type RemainingItem } from "@/lib/dispatches";
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
  listPositions,
  listShipmentMethods,
  listSuppliers,
  listThicknesses,
} from "@/lib/lookups";
import { getQuotation } from "@/lib/quotations";
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
  try {
    await requireActor();
  } catch {
    return { ok: false, error: t("notAllowed") };
  }

  try {
    const [categories, leadSources, positions, countryRows] = await Promise.all([
      listCategories(),
      listLeadSources(),
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
};

export async function quotationLookupsAction(): Promise<ActionResult<QuotationLookups>> {
  const t = await getTranslations("common");
  try {
    await requireActor();
  } catch {
    return { ok: false, error: t("notAllowed") };
  }

  try {
    const [supplierRows, fireRatingRows, classRows, thicknessRows] = await Promise.all([
      listSuppliers(),
      listFireRatings(),
      listClasses(),
      listThicknesses(),
    ]);

    // Matched on the number, not on the row's position: an admin adding 3 mm
    // above it must not move what the dialog opens on.
    const standard = thicknessRows.find((row) => Number(row.name) === 4) ?? null;

    return {
      ok: true,
      data: {
        suppliers: supplierRows.map(toOption),
        fireRatings: fireRatingRows.map(toOption),
        classes: classRows.map(toOption),
        thicknesses: thicknessRows.map(toOption),
        standardThickness: standard ? String(standard.id) : null,
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
};

export async function dispatchLookupsAction(): Promise<ActionResult<DispatchLookups>> {
  const t = await getTranslations("common");
  try {
    await requireActor();
  } catch {
    return { ok: false, error: t("notAllowed") };
  }

  try {
    const rows = await listShipmentMethods();
    return {
      ok: true,
      data: {
        shipmentMethods: rows.map(toOption),
        defaultMethod: rows[0] ? String(rows[0].id) : null,
      },
    };
  } catch {
    return { ok: false, error: t("somethingWrong") };
  }
}

/**
 * What is left to send on each line of one quotation (D12).
 *
 * Read fresh every time the dialog opens, because it moves: another dispatch
 * raised a minute ago has already spent some of it. The action re-checks the
 * same rule inside its transaction, so this is the courtesy and that is the
 * law.
 */
export async function remainingItemsAction(
  quotationId: unknown,
  dispatchId?: unknown,
): Promise<ActionResult<RemainingItem[]>> {
  const t = await getTranslations("common");
  let actor;
  try {
    actor = await requireActor();
  } catch {
    return { ok: false, error: t("notAllowed") };
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
      data: await remainingOnQuotation(parsed.data.quotationId, parsed.data.dispatchId),
    };
  } catch {
    return { ok: false, error: t("notAllowed") };
  }
}

const duplicateInput = z.object({
  name: z.string().max(200).default(""),
  phone: z.string().max(40).default(""),
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
): Promise<ActionResult<DuplicateHit | null>> {
  const t = await getTranslations("common");
  try {
    await requireActor();
  } catch {
    return { ok: false, error: t("notAllowed") };
  }

  const parsed = duplicateInput.safeParse({ name, phone });
  if (!parsed.success) return { ok: true, data: null };

  try {
    const [hit] = await findPossibleDuplicates({
      name: parsed.data.name,
      phone: parsed.data.phone,
      limit: 1,
    });
    if (!hit) return { ok: true, data: null };
    return {
      ok: true,
      data: { id: hit.id, name: hit.name, rep: hit.repName, matchedOn: hit.matchedOn },
    };
  } catch {
    // A warning that cannot be computed is not an error a rep should see; the
    // save is unaffected either way.
    return { ok: true, data: null };
  }
}
