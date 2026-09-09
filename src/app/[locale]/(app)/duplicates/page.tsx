import { getLocale, getTranslations } from "next-intl/server";
import { DuplicateList } from "@/components/duplicates/duplicate-list";
import { ListTail } from "@/components/ui-ext/list-tail";
import { listNonWorkingDays } from "@/lib/calendar";
import { firstOfMonth, todayRiyadh } from "@/lib/dates";
import { countOpenDuplicates, listOpenDuplicates } from "@/lib/duplicates";
import { mayHandOver } from "@/lib/floor";
import { LIST_LIMIT } from "@/lib/list-size";
import { waitedSince } from "@/lib/waiting";
import { homeFor, requireUser } from "@/lib/authz";
import { redirect } from "@/i18n/navigation";

/**
 * Two records, one customer — the manager's own queue (P12-8, S14, S15, D158).
 *
 * Everything else on his screen is somebody else's work that he is watching.
 * This is the only list in Kladra that is HIS work: nobody but him can answer
 * it, and until he does, two reps are ringing one customer and neither knows.
 *
 * One screen, not a list and a page behind it. A pair is decided by reading the
 * two records side by side — who holds each, how long each has been on file,
 * what is already on it — and a list that showed two names and made him click
 * through would be asking him to remember what he is comparing. The evidence is
 * on the card and so are the three answers.
 *
 * Nobody else gets here. A rep who follows a link goes to his own home rather
 * than to an error page: it is not his screen, and there is nothing here for
 * him to be told off about (S8, the same answer the team and leads screens
 * give). The rep whose company is under a flag is told nothing until it is
 * ruled — an open flag is a question about whose customer this is, and a
 * half-answered one on his own drawer would be a state he can do nothing with.
 */
export default async function DuplicatesPage() {
  const [user, locale] = await Promise.all([requireUser(), getLocale()]);
  // The same permission as a hand-over and not a second one beside it: a fold
  // moves a customer between floors, which is exactly what a hand-over is (§3).
  if (!mayHandOver(user)) redirect({ href: homeFor(user.role), locale });

  const today = todayRiyadh();
  const t = await getTranslations();
  const pairs = await listOpenDuplicates(LIST_LIMIT);

  // How many there are in all, asked only when the list came back full (D80).
  const total = pairs.length === LIST_LIMIT ? await countOpenDuplicates() : pairs.length;

  /*
   * The holidays every wait on this screen crosses, back to the oldest pair on
   * it — the same read the stuck list and the leads screen make, for the same
   * reason: a pair raised on the 28th must not age a holiday on the 30th as a
   * working day (D97, D141).
   */
  const earliest = pairs.reduce(
    (soonest, pair) => (pair.raisedOn < soonest ? pair.raisedOn : soonest),
    firstOfMonth(today),
  );
  const nonWorking = await listNonWorkingDays(earliest, today);

  const rows = pairs.map((pair) => ({
    ...pair,
    waited: waitedSince(pair.raisedOn, today, nonWorking),
  }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">{t("duplicates.title")}</h1>
        <p className="max-w-prose text-sm text-muted-foreground">{t("duplicates.means")}</p>
      </div>

      {rows.length === 0 ? (
        <p className="card-face px-6 py-12 text-center text-sm text-muted-foreground">
          {t("duplicates.empty")}
        </p>
      ) : (
        <DuplicateList rows={rows} />
      )}

      <ListTail shown={rows.length} total={total} />
    </div>
  );
}
