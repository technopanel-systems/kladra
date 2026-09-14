import { test, expect } from "@playwright/test";
import { PROJECT_STAGES, projectStage, type StageFacts } from "@/lib/project-stage";

/**
 * The projects board's column rule, asked directly (SPEC §3 P13, D170).
 *
 * A pure spec, like tests/lists.spec.ts: the seeded floor has a job in every
 * column, but only one shape of each, and the rule has branches the demo cannot
 * reach — a lost job that is still being dispatched, a job won on one paper
 * with a second price out, a load approved with nothing priced behind it. The
 * screen reads the SQL twin (`projectStageSql`), and tests/project-board.spec.ts
 * holds the two together on every seeded project; this holds the rule itself.
 */

/** Nothing has happened to it: made, and nothing asked for. */
const NOTHING: StageFacts = {
  lost: false,
  dispatching: false,
  dispatched: false,
  toGo: false,
  acceptedDone: false,
  priced: false,
};

const facts = (over: Partial<StageFacts>): StageFacts => ({ ...NOTHING, ...over });

test("a project with nothing priced is open, and a price out makes it quoted", () => {
  expect(projectStage(NOTHING)).toBe("open");
  // A request still on the desk for the first time has lines but no price.
  expect(projectStage(facts({ toGo: false, priced: false }))).toBe("open");
  expect(projectStage(facts({ priced: true, toGo: true }))).toBe("quoted");
  // An accepted paper with nothing gone out yet is still with the customer.
  expect(projectStage(facts({ priced: true, toGo: true, acceptedDone: false }))).toBe("quoted");
});

test("a load approved with sheets still to go on its paper is dispatching, whatever else is true", () => {
  const moving = facts({ priced: true, dispatched: true, toGo: true, dispatching: true });
  expect(projectStage(moving)).toBe("dispatching");
  // An older paper that went out whole does not make a job won while another
  // is still on the road.
  expect(projectStage({ ...moving, acceptedDone: true })).toBe("dispatching");
});

test("everything dispatched, or an accepted paper gone out whole, is won", () => {
  // Everything priced went out.
  expect(projectStage(facts({ priced: true, dispatched: true, toGo: false }))).toBe("won");
  // The accepted paper went out whole; an alternative price for the same job
  // was issued and never taken, and still has every sheet on it.
  expect(
    projectStage(facts({ priced: true, dispatched: true, toGo: true, acceptedDone: true })),
  ).toBe("won");
  // A load with no price standing behind it at all — nothing is left to go.
  expect(projectStage(facts({ dispatched: true }))).toBe("won");
});

test("a paper sent out whole but never accepted, with a second price out, is quoted", () => {
  // Nothing on the road, nothing accepted, a price with the customer.
  expect(projectStage(facts({ priced: true, dispatched: true, toGo: true }))).toBe("quoted");
});

test("lost beats every other fact, and every stage is reachable", () => {
  const everything: StageFacts = {
    lost: true,
    dispatching: true,
    dispatched: true,
    toGo: true,
    acceptedDone: true,
    priced: true,
  };
  expect(projectStage(everything)).toBe("lost");

  // Every combination lands in exactly one of the five, and each of the five
  // is where at least one of them lands: no column the rule can never fill.
  const keys = Object.keys(NOTHING) as (keyof StageFacts)[];
  const seen = new Set<string>();
  for (let mask = 0; mask < 1 << keys.length; mask += 1) {
    const combination = Object.fromEntries(
      keys.map((key, bit) => [key, Boolean(mask & (1 << bit))]),
    ) as StageFacts;
    const stage = projectStage(combination);
    expect(PROJECT_STAGES).toContain(stage);
    seen.add(stage);
  }
  expect([...seen].sort()).toEqual([...PROJECT_STAGES].sort());
});
