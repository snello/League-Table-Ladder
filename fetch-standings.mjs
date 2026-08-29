#!/usr/bin/env node
/**
 * fetch-standings.mjs — requires Node 18+
 *
 * Fetches standings for a competition from football-data.org and merges the
 * result into data.json under the league's code key.
 *
 * Usage:
 *   FOOTBALL_DATA_API_KEY=<key> node fetch-standings.mjs
 *   FOOTBALL_DATA_API_KEY=<key> node fetch-standings.mjs --league PL
 *   FOOTBALL_DATA_API_KEY=<key> node fetch-standings.mjs --league BL1 --season 2024
 *   FOOTBALL_DATA_API_KEY=<key> node fetch-standings.mjs --league SA --out data.json
 *
 * data.json stores multiple seasons per league:
 *   { "PL": { "name": "Premier League", "defaultSeason": "2026",
 *     "seasons": { "2026": { "matchday": 1, "teams": [...] } } } }
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { parseArgs } from "util";
import { fileURLToPath } from "url";
import { join, dirname } from "path";

// ─── Args ─────────────────────────────────────────────────────────────────────
const { values: args } = parseArgs({
  options: {
    league: { type: "string", default: "PL" },
    season: { type: "string", default: "2026" },
    out: { type: "string", default: "data.json" },
  },
  strict: false,
});

const LEAGUE = args.league.toUpperCase();

// ─── API key ──────────────────────────────────────────────────────────────────
const API_KEY = process.env.FOOTBALL_DATA_API_KEY;
if (!API_KEY) {
  console.error(
    "Error: FOOTBALL_DATA_API_KEY environment variable is not set.",
  );
  console.error("  export FOOTBALL_DATA_API_KEY=your_key_here");
  process.exit(1);
}

// ─── Optional team overrides ─────────────────────────────────────────────────
// API data is authoritative. These overrides only provide preferred display
// names, ring colours, and Premier League CDN badge codes where known.
const TEAM_OVERRIDES = {
  // Premier League
  57: { code: 3, color: "#EF0107", short: "Arsenal" },
  65: { code: 43, color: "#6CABDD", short: "Man City" },
  66: { code: 1, color: "#DA291C", short: "Man Utd" },
  58: { code: 7, color: "#670E36", short: "Aston Villa" },
  61: { code: 8, color: "#034694", short: "Chelsea" },
  64: { code: 14, color: "#C8102E", short: "Liverpool" },
  402: { code: 94, color: "#E30613", short: "Brentford" },
  62: { code: 11, color: "#003399", short: "Everton" },
  1044: { code: 91, color: "#DA291C", short: "Bournemouth" },
  71: { code: 56, color: "#EB172B", short: "Sunderland" },
  63: { code: 54, color: "#B0B0B0", short: "Fulham" },
  67: { code: 4, color: "#241F20", short: "Newcastle" },
  397: { code: 36, color: "#0057B8", short: "Brighton" },
  354: { code: 31, color: "#C4122E", short: "C. Palace" },
  341: { code: 2, color: "#0d3464", short: "Leeds" },
  73: { code: 6, color: "#132257", short: "Tottenham" },
  351: { code: 17, color: "#DD0000", short: "Nott'm Forest" },
  563: { code: 21, color: "#7A263A", short: "West Ham" },
  328: { code: 90, color: "#6C1D45", short: "Burnley" },
  76: { code: 39, color: "#FDB913", short: "Wolves" },
};

const FALLBACK_COLORS = [
  "#4F8CFF",
  "#7D5CFF",
  "#E45BFF",
  "#FF5F8F",
  "#FF7A45",
  "#F2C94C",
  "#38C98A",
  "#35B9C8",
];

function fallbackColor(team) {
  const key = String(team.id ?? team.name);
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return FALLBACK_COLORS[Math.abs(hash) % FALLBACK_COLORS.length];
}

// ─── Transform ────────────────────────────────────────────────────────────────
function transform(apiData) {
  const total = apiData.standings.find((s) => s.type === "TOTAL");
  if (!total)
    throw new Error("No TOTAL standings table found in API response.");

  return total.table.map((entry) => {
    const meta = TEAM_OVERRIDES[entry.team.id];

    // Strip trailing "FC" / "AFC" suffixes ("Arsenal FC" → "Arsenal",
    // "Sunderland AFC" → "Sunderland"). Leading "AFC Bournemouth" is unchanged.
    const name = entry.team.name.replace(/\s+A?FC$/, "").trim();

    // API form is a comma-separated string, newest result last: "W,D,W,L,W"
    const form = entry.form
      ? entry.form
          .split(",")
          .map((r) => r.trim())
          .filter(Boolean)
      : [];

    return {
      id: entry.team.id,
      pos: entry.position,
      name,
      short: meta?.short ?? entry.team.shortName ?? name,
      played: entry.playedGames,
      won: entry.won,
      drawn: entry.draw,
      lost: entry.lost,
      gf: entry.goalsFor,
      ga: entry.goalsAgainst,
      gd: entry.goalDifference,
      pts: entry.points,
      code: meta?.code ?? null,
      color: meta?.color ?? fallbackColor(entry.team),
      crest: entry.team.crest ?? null,
      form,
    };
  });
}

// ─── Fetch ────────────────────────────────────────────────────────────────────
const endpoint = `https://api.football-data.org/v4/competitions/${LEAGUE}/standings?season=${args.season}`;

console.log(`Fetching: ${endpoint}`);

const res = await fetch(endpoint, {
  headers: { "X-Auth-Token": API_KEY },
});

if (!res.ok) {
  const body = await res.text();
  console.error(`HTTP ${res.status} ${res.statusText}`);
  console.error(body);
  process.exit(1);
}

const apiData = await res.json();

// ─── Merge & write ────────────────────────────────────────────────────────────
const outPath = join(dirname(fileURLToPath(import.meta.url)), args.out);

// Read existing file so other leagues are preserved
let existing = {};
if (existsSync(outPath)) {
  try {
    const raw = JSON.parse(readFileSync(outPath, "utf8"));
    // Handle legacy format (plain array) by wrapping it under PL
    existing = Array.isArray(raw) ? { PL: { teams: raw } } : raw;
    for (const [code, league] of Object.entries(existing)) {
      if (league?.teams && !league.seasons) {
        const legacySeason = league.season ?? "2025";
        existing[code] = {
          name: league.name,
          defaultSeason: legacySeason,
          legacyFixtureSeason: legacySeason,
          seasons: {
            [legacySeason]: {
              matchday: league.matchday,
              teams: league.teams,
            },
          },
        };
      }
    }
  } catch {
    console.warn(
      "  Warning: could not parse existing data.json — starting fresh.",
    );
  }
}

const leagueData = existing[LEAGUE] ?? {
  name: apiData.competition.name,
  defaultSeason: args.season,
  seasons: {},
};
leagueData.name = apiData.competition.name;
if (!leagueData.defaultSeason || Number(args.season) >= Number(leagueData.defaultSeason)) {
  leagueData.defaultSeason = args.season;
}
leagueData.seasons = leagueData.seasons ?? {};
leagueData.seasons[args.season] = {
  matchday: apiData.season.currentMatchday,
  teams: transform(apiData),
};
existing[LEAGUE] = leagueData;

writeFileSync(outPath, JSON.stringify(existing, null, 2));

console.log(`Wrote ${existing[LEAGUE].seasons[args.season].teams.length} teams under "${LEAGUE}" season ${args.season} → ${args.out}`);
console.log(`Matchday: ${apiData.season.currentMatchday}`);

// ─── Download missing team logos ──────────────────────────────────────────────
const baseDir = dirname(fileURLToPath(import.meta.url));
const imgDir = join(baseDir, "images", LEAGUE);
mkdirSync(imgDir, { recursive: true });

let imagesUpdated = false;
for (const team of existing[LEAGUE].seasons[args.season].teams) {
  if (!team.crest) continue;

  // Derive extension from the crest URL (e.g. ".png", ".svg")
  const ext = (
    team.crest.split("?")[0].split(".").pop() || "png"
  ).toLowerCase();
  const localFile = join(imgDir, `${team.id}.${ext}`);
  const localPath = `images/${LEAGUE}/${team.id}.${ext}`;

  if (existsSync(localFile)) {
    team.image = localPath;
    imagesUpdated = true;
    continue;
  }

  try {
    process.stdout.write(`  Downloading badge for ${team.name} … `);
    const imgRes = await fetch(team.crest);
    if (!imgRes.ok) throw new Error(`HTTP ${imgRes.status}`);
    writeFileSync(localFile, Buffer.from(await imgRes.arrayBuffer()));
    team.image = localPath;
    imagesUpdated = true;
    console.log("✓");
  } catch (err) {
    console.log(`failed (${err.message})`);
  }
}

if (imagesUpdated) {
  writeFileSync(outPath, JSON.stringify(existing, null, 2));
  console.log(`Badge paths written to ${args.out}`);
}

// ─── Fetch remaining fixtures for each team ───────────────────────────────────
const fixturesDir = join(baseDir, "fixtures", LEAGUE, args.season);
mkdirSync(fixturesDir, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const seasonStart = apiData.season.startDate ?? `${args.season}-08-01`;
const seasonEnd = apiData.season.endDate ?? "2026-12-31";

console.log("\nFetching fixtures…");
for (const team of existing[LEAGUE].seasons[args.season].teams) {
  const fixtureFile = join(fixturesDir, `${team.id}.json`);

  if (existsSync(fixtureFile)) {
    console.log(`  ${team.name}: cached`);
    continue;
  }

  await sleep(6200);

  // Fetch the whole season so archived seasons retain their completed fixtures.
  // competitions filter requires the numeric ID, not the string code
  const fixtureEndpoint =
    `https://api.football-data.org/v4/teams/${team.id}/matches` +
    `?season=${args.season}&competitions=${apiData.competition.id}&dateFrom=${seasonStart}&dateTo=${seasonEnd}`;

  try {
    process.stdout.write(`  ${team.name}: fetching… `);
    const fr = await fetch(fixtureEndpoint, {
      headers: { "X-Auth-Token": API_KEY },
    });
    if (!fr.ok) {
      const reason = fr.statusText ? fr.statusText : await fr.text();
      throw new Error(`HTTP ${fr.status} - ${reason}`);
    }
    const json = await fr.json();
    const matches = json.matches ?? [];
    writeFileSync(fixtureFile, JSON.stringify(matches, null, 2));
    console.log(
      `${matches.length} fixture${matches.length !== 1 ? "s" : ""} ✓`,
    );
  } catch (err) {
    console.log(`failed (${err.message})`);
  }
}
