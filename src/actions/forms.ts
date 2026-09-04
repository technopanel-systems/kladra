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
import {
  type CityOption,
  type CountryOption,
  type LookupOption,
  SAUDI_CODE,
  listCategories,
  listCitiesForCountry,
  listCountries,
  listLeadSources,
  listPositions,
} from "@/lib/lookups";
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
