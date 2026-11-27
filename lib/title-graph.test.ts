import { test } from "node:test";
import assert from "node:assert/strict";
import { personIdOf, personWeb } from "./title-graph";
import type { PersonWorks } from "./anilist-shared";

const work = (id: number, popularity: number) => ({
  anilistId: id, entryType: "anime" as const, title: `Show ${id}`, cover: null, format: "TV", year: 2020, popularity,
});
const person: PersonWorks = {
  id: 7, name: "P", image: null,
  roles: Array.from({ length: 40 }, (_, i) => ({ ...work(i + 1, 1000 - i), character: { id: 100 + i, name: `C${i}`, image: null, role: i ? "SUPPORTING" : "MAIN" } })),
  credits: [{ ...work(5, 900), role: "Director" }, { ...work(1, 1000), role: "Storyboard" }],
};

test("person ids come only from cast and staff nodes", () => {
  assert.equal(personIdOf("cast", "va:95185"), 95185);
  assert.equal(personIdOf("staff", "staff:12"), 12);
  assert.equal(personIdOf("characters", "char:12"), null);
  assert.equal(personIdOf("cast", "cast:char:3"), null);
});

test("a person web leaves out the show you came from and caps its size", () => {
  const roles = personWeb(person, "cast", 1);
  assert.equal(roles.length, 30);
  assert.ok(roles.every((n) => n.detail.type === "title" && n.detail.anilistId !== 1));
  assert.equal(roles[0].label, "C1");
  const credits = personWeb(person, "staff", 1);
  assert.deepEqual(credits.map((n) => n.id), ["pw:5"]);
  assert.equal(credits[0].detail.type === "title" && credits[0].detail.href, "/anime/5");
});
