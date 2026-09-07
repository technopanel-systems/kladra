import type { Locator, Page } from "@playwright/test";
import { login } from "./helpers/auth";
import { one, personName, query, userId } from "./helpers/db";
import { test, expect, type Translate } from "./helpers/i18n";
import { pickFirst } from "./helpers/pick";
import { quotationLabel } from "@/lib/labels";

/**
 * Live updates, end to end (SPEC D105; WORKFLOW §3 "Two people, no reload").
 *
 * A write calls `notifyLive` inside its own transaction → `pg_notify('kladra')`
 * → the one SSE route (src/app/api/events/route.ts) fans it to the users it
 * names → the browser's `LiveProvider` calls `router.refresh()` coalesced
 * 200 ms later and, once that refresh has landed, marks the row arrived for
 * `ARRIVED_MS` (2000 ms — src/components/live/live-provider.tsx, not imported
 * here to keep this file out of a "use client" module's own import graph).
 * Three things are checked:
 *
 * 1. a request travels from the rep to the coordinator's queue, and the
 *    coordinator's answer travels back to the rep, neither side reloading;
 * 2. an admin looking through somebody else's eyes gets THAT person's channel
 *    and THAT person's unread count, because `requireReader` resolves the
 *    viewed identity (src/lib/authz.ts) and the live route asks nothing else;
 * 3. the listener's own Postgres connection can die without a hole in what a
 *    browser sees for ever — it reconnects, the route says `resync`, and the
 *    next write still arrives.
 *
 * Every write here is undone in a `finally`, by id, because the two locale
 * projects share one seeded database in one run (playwright.config.ts).
 */

const COLD = { timeout: 30_000 };

/** The drawer or sheet, named by the record itself (Q-12). */
function sheetFor(page: Page, label: string): Locator {
  return page.getByRole("dialog", { name: label });
}

/**
 * Where the quotation is NOW — the badge under its name, by the `data-tone`
 * every state badge carries (DESIGN §5) rather than by its words: "Issued" is
 * also what the history trail calls the same event, and a bare `getByText`
 * would match both.
 */
function statusOf(sheet: Locator): Locator {
  return sheet.locator("[data-tone]").first();
}

/**
 * The quotation's name where it is actually painted. Every list renders twice
 * — a table from `md` up and a card per row below it — and CSS picks one; the
 * visible filter is what keeps a click or a class check off the hidden layout.
 */
function labelOnScreen(page: Page, label: string): Locator {
  return page.getByText(label, { exact: true }).filter({ visible: true }).first();
}

/**
 * Installed in the page before it loads: records, on the page's own clock, every
 * table row added to the document and every time a row's `row-arrived` class
 * goes on or off. Playwright's own polling backs off to one look a second,
 * which is too coarse to time a two-second highlight; this is not.
 */
const ROW_TIMELINE = `(() => {
  const log = (window.__rowTimeline = []);
  const rowOf = (node) => {
    const el = node.nodeType === 1 ? node : node.parentElement;
    return el ? el.closest("tr") : null;
  };
  const text = (tr) => (tr.textContent || "").slice(0, 80);
  new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === "childList") {
        for (const n of r.addedNodes) {
          const tr = rowOf(n);
          if (tr) log.push({ t: performance.now(), kind: tr.classList.contains("row-arrived") ? "added-on" : "added", text: text(tr) });
        }
      } else if (r.target.tagName === "TR") {
        const on = r.target.classList.contains("row-arrived");
        const was = (r.oldValue || "").includes("row-arrived");
        if (on !== was) log.push({ t: performance.now(), kind: on ? "on" : "off", text: text(r.target) });
      }
    }
  }).observe(document, { subtree: true, childList: true, attributes: true, attributeOldValue: true, attributeFilter: ["class"] });
})();`;

type Mark = {
  t: number;
  kind: "added" | "added-on" | "on" | "off";
  text: string;
};

/** The recorded marks for one row, by the label its first cell starts with. */
async function rowMarks(target: Page, label: string): Promise<Mark[]> {
  const all = await target.evaluate(
    () => (window as unknown as { __rowTimeline?: Mark[] }).__rowTimeline ?? [],
  );
  return all.filter((m) => m.text.startsWith(label) && !/[\d/]/.test(m.text.charAt(label.length)));
}

/** A goto on a page built outside the `page` fixture waits for itself. */
async function waitForHydration(target: Page): Promise<void> {
  await target.waitForFunction(() => document.documentElement.dataset.hydrated === "true");
}

/**
 * One line, filled the way `tests/quotations.spec.ts` fills its first one —
 * supplier, fire rating and class have no sensible default, so whichever the
 * list offers first proves the field works without hard-coding a locale.
 */
async function fillOneLine(form: Locator, t: Translate): Promise<void> {
  await form.getByLabel(t("common.colourCode")).fill("LIVE-1");
  for (const key of ["common.supplier", "common.fireRating", "common.class"]) {
    await pickFirst(form.getByRole("combobox", { name: t(key) }));
  }
  await form.getByLabel(t("common.qty")).fill("10");
  await form.getByLabel(t("common.pricePerSqm")).fill("120");
}

test("the desk sees a request land, and the rep sees it go out — no reload", async ({
  browser,
  locale,
  t,
}) => {
  test.slow(); // two persistent sessions, a live wait either way

  const faisalId = await userId("faisal@technopanel.com.sa");
  const project = await one<{ id: string; name: string }>(
    `select p.id, p.name
       from projects p
       join companies c on c.id = p.company_id
      where c.rep_id = $1::uuid
        and p.lost_at is null
        and p.archived_at is null
        and c.archived_at is null
      order by p.created_at
      limit 1`,
    [faisalId],
  );

  const rawanContext = await browser.newContext();
  await rawanContext.addInitScript(ROW_TIMELINE);
  const rawan = await rawanContext.newPage();
  // The TableRow layout, and the one `row-arrived` sits on, is `md` and up.
  await rawan.setViewportSize({ width: 1366, height: 768 });

  const faisalContext = await browser.newContext();
  const faisal = await faisalContext.newPage();

  let quotationId = "";
  let label = "";

  try {
    await test.step("Rawan is already watching her queue", async () => {
      await login(rawan, locale, "rawan");
      await rawan.goto(`/${locale}/queue`);
      await waitForHydration(rawan);
      await expect(rawan.getByRole("heading", { name: t("common.queue") })).toBeVisible(COLD);
    });

    let submittedAt = 0;

    await test.step("Faisal raises a quotation from one of his projects", async () => {
      await login(faisal, locale, "faisal");
      await faisal.goto(`/${locale}/projects?open=${project.id}`);
      await waitForHydration(faisal);
      const drawer = faisal.getByRole("dialog", { name: project.name });
      await expect(drawer).toBeVisible(COLD);

      await drawer.getByRole("tab", { name: t("common.quotations") }).click();
      await drawer
        .getByRole("button", { name: t("quotations.request") })
        .first()
        .click();

      const form = faisal.getByRole("dialog", {
        name: t("quotations.requestFor", { project: project.name }),
      });
      await expect(form.getByLabel(t("common.colourCode"))).toBeVisible(COLD);
      await fillOneLine(form, t);

      submittedAt = Date.now();
      await form.getByRole("button", { name: t("common.save") }).click();
      await expect(faisal.getByText(t("quotations.requested"))).toBeVisible(COLD);

      // Saving lands on the quotation itself (RequestQuotationDialog's
      // `onSaved`), but that `router.push` is async — reading the URL right
      // after the click can still catch the project's own `?open=`.
      await expect(faisal).toHaveURL(/\/quotations\?open=/, COLD);
      quotationId = new URL(faisal.url()).searchParams.get("open") ?? "";
      expect(quotationId, "saving did not land on the new quotation").not.toBe("");
    });

    const numbered = await one<{ number: number; revision: number }>(
      "select number, revision from quotations where id = $1::uuid",
      [quotationId],
    );
    label = quotationLabel(numbered.number, numbered.revision);

    await test.step("the row lands on Rawan's queue without a reload, marked arrived for two seconds", async () => {
      const row = labelOnScreen(rawan, label);
      await row.waitFor({ state: "visible", ...COLD });
      console.log("live: request landed after", Date.now() - submittedAt, "ms (", locale, ")");

      // The highlight's two seconds start when the refreshed row is on screen,
      // not when the event landed (D105): the other way round, the round trip
      // that paints the row is subtracted from them. The page's own timeline
      // says when the row was added, when the class went on and when it went
      // off; the class sits on the row, never on the label's link.
      await expect
        .poll(async () => (await rowMarks(rawan, label)).some((m) => m.kind === "off"), {
          timeout: 5000,
          intervals: [100],
        })
        .toBe(true);
      const marks = await rowMarks(rawan, label);
      const added = marks.find((m) => m.kind === "added" || m.kind === "added-on");
      const on = added?.kind === "added-on" ? added : marks.find((m) => m.kind === "on");
      const off = marks.find((m) => m.kind === "off");
      expect(added, "the row was never added to the document").toBeDefined();
      expect(on, "the row was never highlighted").toBeDefined();
      expect(off, "the highlight never ended").toBeDefined();
      const onAfterAdded = Math.round(on!.t - added!.t);
      const shownMs = Math.round(off!.t - on!.t);
      console.log(
        "live: highlight on",
        onAfterAdded,
        "ms after the row was added, off",
        shownMs,
        "ms later (",
        locale,
        ")",
      );
      expect(onAfterAdded, "the highlight came late to a row already on screen").toBeLessThan(500);
      expect(
        shownMs,
        "the highlight faded early: its clock started before the row was on screen",
      ).toBeGreaterThan(1800);
    });

    await test.step("Faisal is already on the quotation, waiting", async () => {
      await faisal.goto(`/${locale}/quotations?open=${quotationId}`);
      await waitForHydration(faisal);
      const sheet = sheetFor(faisal, label);
      await expect(sheet).toBeVisible(COLD);
      await expect(statusOf(sheet)).toHaveText(t("quotations.statusRequested"), COLD);
    });

    const unreadBefore = Number(
      (
        await one<{ n: string }>(
          "select count(*)::text as n from notifications where user_id = $1::uuid and read_at is null",
          [faisalId],
        )
      ).n,
    );

    let issuedAt = 0;
    const smacNumber = `SMAC-LIVE-${locale.toUpperCase()}-${7000 + numbered.number}`;

    await test.step("Rawan issues it with a fresh SMAC number", async () => {
      await labelOnScreen(rawan, label).click();
      const sheet = sheetFor(rawan, label);
      await expect(sheet).toBeVisible(COLD);

      await sheet.getByRole("button", { name: t("quotations.issue") }).click();
      const ask = rawan.getByRole("dialog", {
        name: t("quotations.issueTitle", { label }),
      });
      await ask.getByLabel(t("common.smacNumber")).fill(smacNumber);

      issuedAt = Date.now();
      await ask.getByRole("button", { name: t("quotations.issue") }).click();
      await expect(rawan.getByText(t("quotations.issued", { label }))).toBeVisible(COLD);
    });

    await test.step("Faisal sees it issued and his bell rise by one, without a reload", async () => {
      const sheet = sheetFor(faisal, label);
      await expect(statusOf(sheet)).toHaveText(t("quotations.statusIssued"), COLD);
      console.log("live: issue reached the rep after", Date.now() - issuedAt, "ms (", locale, ")");

      // The bell lives in the top bar, and Radix marks everything behind an
      // open sheet aria-hidden — closing it first is what lets a role locator
      // see the bell at all (rep.spec.ts, view-as.spec.ts).
      await sheet.getByRole("button", { name: t("common.close") }).click();
      await expect(sheet).toBeHidden(COLD);

      await expect(
        faisal.getByRole("link", {
          name: t("shell.unreadCount", { count: unreadBefore + 1 }),
        }),
      ).toBeVisible(COLD);
    });
  } finally {
    if (quotationId) {
      await query("delete from notifications where subject_id = $1::uuid", [quotationId]).catch(
        () => {},
      );
      await query(
        "delete from audit_log where record_type = 'quotation' and record_id = $1::text",
        [quotationId],
      ).catch(() => {});
      await query("delete from quotation_items where quotation_id = $1::uuid", [quotationId]).catch(
        () => {},
      );
      await query("delete from quotations where id = $1::uuid", [quotationId]).catch(() => {});
    }
    await rawanContext.close();
    await faisalContext.close();
  }
});

test("the channel opens for a viewer, and the count is the viewed person's", async ({
  page,
  locale,
  t,
}) => {
  test.slow();

  const faisal = {
    id: await userId("faisal@technopanel.com.sa"),
    name: await personName("faisal@technopanel.com.sa", locale),
  };

  await login(page, locale, "jerom");
  await page.goto(`/${locale}/admin/users`);
  await expect(page.getByRole("heading", { name: t("common.users") })).toBeVisible(COLD);

  const row = page.getByRole("row").filter({ hasText: faisal.name });
  await row.getByRole("button", { name: t("viewAs.start") }).click();
  const dialog = page.getByRole("dialog", {
    name: t("viewAs.title", { name: faisal.name }),
  });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: t("viewAs.start") }).click();

  await expect(page.locator("[data-slot='viewing-banner']")).toBeVisible(COLD);

  try {
    // Off the admin section: while viewing, `getUser()` answers with the
    // viewed role, and an admin screen would put a rep straight back on /day.
    await page.goto(`/${locale}/day`);
    await expect(page.getByRole("heading", { name: t("day.title") })).toBeVisible(COLD);

    const opened = await page.evaluate(
      () =>
        new Promise<boolean>((resolve) => {
          const source = new EventSource("/api/events");
          const deadline = Date.now() + 5000;
          const poll = () => {
            if (source.readyState === 1) {
              source.close();
              resolve(true);
              return;
            }
            if (Date.now() > deadline) {
              source.close();
              resolve(false);
              return;
            }
            setTimeout(poll, 50);
          };
          poll();
        }),
    );
    expect(
      opened,
      "the live channel never reached open (readyState 1) for the viewed session",
    ).toBe(true);

    const expectedUnread = Number(
      (
        await one<{ n: string }>(
          "select count(*)::text as n from notifications where user_id = $1::uuid and read_at is null",
          [faisal.id],
        )
      ).n,
    );

    const response = await page.request.get("/api/notifications/count");
    expect(response.status()).toBe(200);
    const body = (await response.json()) as { unread: number };
    expect(body.unread, "the count answered for the real user, not the viewed one").toBe(
      expectedUnread,
    );
  } finally {
    await page
      .locator("[data-slot='viewing-banner']")
      .getByRole("button", { name: t("viewAs.stop") })
      .click();
    await expect(page.locator("[data-slot='viewing-banner']")).toHaveCount(0, COLD);
  }
});

/** The newest still-waiting quotation, preferring one of Faisal's own. */
async function pickRequestedQuotation(): Promise<{
  id: string;
  companyId: string;
  projectId: string | null;
  repId: string;
  notes: string | null;
}> {
  const faisalId = await userId("faisal@technopanel.com.sa");
  const mine = await query<{
    id: string;
    companyId: string;
    projectId: string | null;
    repId: string;
    notes: string | null;
  }>(
    `select id, company_id as "companyId", project_id as "projectId", rep_id as "repId", notes
       from quotations
      where status = 'requested' and rep_id = $1::uuid
      order by created_at desc
      limit 1`,
    [faisalId],
  );
  if (mine[0]) return mine[0];
  return one(
    `select id, company_id as "companyId", project_id as "projectId", rep_id as "repId", notes
       from quotations
      where status = 'requested'
      order by created_at desc
      limit 1`,
  );
}

test("the listener's outage ends with a resync, not a hole", async ({ page, locale, t }) => {
  test.slow();

  await login(page, locale, "rawan");
  const rawanId = await userId("rawan@technopanel.com.sa");
  await page.goto(`/${locale}/queue`);
  await expect(page.getByRole("heading", { name: t("common.queue") })).toBeVisible(COLD);

  // The listener (src/app/api/events/route.ts) is a dedicated pg Client tagged
  // by its own application_name; it opens once Rawan's own EventSource reaches
  // the server, which can trail hydration by a beat.
  await expect
    .poll(
      async () =>
        (
          await query<{ pid: string }>(
            `select pid from pg_stat_activity
              where application_name = 'kladra-live' and datname = current_database()`,
          )
        ).length,
      { timeout: 10_000 },
    )
    .toBeGreaterThan(0);

  try {
    await query(
      `select pg_terminate_backend(pid) from pg_stat_activity
        where application_name = 'kladra-live' and datname = current_database()`,
    );
  } catch (error) {
    test.skip(
      true,
      `pg_terminate_backend was refused: ${error instanceof Error ? error.message : String(error)}`,
    );
    return;
  }

  // Not a wait in place of a visible effect: there is nothing on screen to
  // watch until the browser's own EventSource retries (`retry: 3000` in the
  // route) and the listener comes back to hear the notify below.
  await new Promise((resolve) => setTimeout(resolve, 4000));

  const source = await pickRequestedQuotation();
  const inserted = await one<{ id: string; number: number }>(
    `insert into quotations (number, company_id, project_id, rep_id, status, notes, created_at, updated_at)
     select nextval('quotation_numbers'), company_id, project_id, rep_id, 'requested', notes, now(), now()
       from quotations where id = $1::uuid
     returning id, number`,
    [source.id],
  );
  const label = quotationLabel(inserted.number, 1);

  try {
    await query("select pg_notify('kladra', $1::text)", [
      JSON.stringify({
        userIds: [rawanId],
        event: {
          type: "quotation",
          id: inserted.id,
          number: label,
          status: "requested",
        },
      }),
    ]);

    await expect(labelOnScreen(page, label)).toBeVisible(COLD);
  } finally {
    await query("delete from quotation_items where quotation_id = $1::uuid", [inserted.id]);
    await query("delete from quotations where id = $1::uuid", [inserted.id]);
  }
});
