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
 * data.json structure:
 *   {
 *     "PL":  { "name": "Premier League", "season": "2025", "matchday": 31, "teams": [...] },
 *     "BL1": { "name": "Bundesliga",     "season": "2025", "matchday": 28, "teams": [...] }
 *   }
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { parseArgs } from "util";
import { fileURLToPath } from "url";
import { join, dirname } from "path";

// ─── Args ─────────────────────────────────────────────────────────────────────
const { values: args } = parseArgs({
    options: {
        league: { type: "string", default: "PL"       },
        season: { type: "string", default: "2025"     },
        out:    { type: "string", default: "data.json" },
    },
    strict: false,
});

const LEAGUE = args.league.toUpperCase();

// ─── API key ──────────────────────────────────────────────────────────────────
const API_KEY = process.env.FOOTBALL_DATA_API_KEY;
if (!API_KEY) {
    console.error("Error: FOOTBALL_DATA_API_KEY environment variable is not set.");
    console.error("  export FOOTBALL_DATA_API_KEY=your_key_here");
    process.exit(1);
}

// ─── Team metadata ────────────────────────────────────────────────────────────
// Keyed by football-data.org team ID.
// code  → Premier League badge CDN id (resources.premierleague.com/…/t{code}.png)
// color → primary club colour used for badge ring
// short → display name used in the app
// Note: teams from other leagues will fall back to shortName / crest URL / #888888
const TEAM_META = {
    // Premier League
    57:   { code: 3,  color: "#EF0107", short: "Arsenal"       },
    65:   { code: 43, color: "#6CABDD", short: "Man City"       },
    66:   { code: 1,  color: "#DA291C", short: "Man Utd"        },
    58:   { code: 7,  color: "#670E36", short: "Aston Villa"    },
    61:   { code: 8,  color: "#034694", short: "Chelsea"        },
    64:   { code: 14, color: "#C8102E", short: "Liverpool"      },
    402:  { code: 94, color: "#E30613", short: "Brentford"      },
    62:   { code: 11, color: "#003399", short: "Everton"        },
    1044: { code: 91, color: "#DA291C", short: "Bournemouth"    },
    71:   { code: 56, color: "#EB172B", short: "Sunderland"     },
    63:   { code: 54, color: "#B0B0B0", short: "Fulham"         },
    67:   { code: 4,  color: "#241F20", short: "Newcastle"      },
    397:  { code: 36, color: "#0057B8", short: "Brighton"       },
    354:  { code: 31, color: "#C4122E", short: "C. Palace"      },
    341:  { code: 2,  color: "#0d3464", short: "Leeds"          },
    73:   { code: 6,  color: "#132257", short: "Tottenham"      },
    351:  { code: 17, color: "#DD0000", short: "Nott'm Forest"  },
    563:  { code: 21, color: "#7A263A", short: "West Ham"       },
    328:  { code: 90, color: "#6C1D45", short: "Burnley"        },
    76:   { code: 39, color: "#FDB913", short: "Wolves"         },
};

// ─── Transform ────────────────────────────────────────────────────────────────
function transform(apiData) {
    const total = apiData.standings.find((s) => s.type === "TOTAL");
    if (!total) throw new Error("No TOTAL standings table found in API response.");

    return total.table.map((entry) => {
        const meta = TEAM_META[entry.team.id];
        if (!meta) {
            console.warn(
                `  Warning: no metadata for team ID ${entry.team.id} ` +
                `(${entry.team.name}) — add an entry to TEAM_META for badge/colour.`
            );
        }

        // Strip trailing "FC" / "AFC" suffixes ("Arsenal FC" → "Arsenal",
        // "Sunderland AFC" → "Sunderland"). Leading "AFC Bournemouth" is unchanged.
        const name = entry.team.name.replace(/\s+A?FC$/, "").trim();

        // API form is a comma-separated string, newest result last: "W,D,W,L,W"
        const form = entry.form
            ? entry.form.split(",").map((r) => r.trim()).filter(Boolean)
            : [];

        return {
            id:     entry.team.id,
            pos:    entry.position,
            name,
            short:  meta?.short ?? entry.team.shortName,
            played: entry.playedGames,
            won:    entry.won,
            drawn:  entry.draw,
            lost:   entry.lost,
            gf:     entry.goalsFor,
            ga:     entry.goalsAgainst,
            gd:     entry.goalDifference,
            pts:    entry.points,
            code:   meta?.code  ?? null,
            color:  meta?.color ?? "#888888",
            crest:  entry.team.crest ?? null,
            form,
        };
    });
}

// ─── Fetch ────────────────────────────────────────────────────────────────────
const endpoint =
    `https://api.football-data.org/v4/competitions/${LEAGUE}/standings?season=${args.season}`;

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
    } catch {
        console.warn("  Warning: could not parse existing data.json — starting fresh.");
    }
}

existing[LEAGUE] = {
    name:      apiData.competition.name,
    season:    args.season,
    matchday:  apiData.season.currentMatchday,
    teams:     transform(apiData),
};

writeFileSync(outPath, JSON.stringify(existing, null, 2));

console.log(`Wrote ${existing[LEAGUE].teams.length} teams under "${LEAGUE}" → ${args.out}`);
console.log(`Matchday: ${apiData.season.currentMatchday}`);

// ─── Download missing team logos ──────────────────────────────────────────────
const baseDir = dirname(fileURLToPath(import.meta.url));
const imgDir  = join(baseDir, "images", LEAGUE);
mkdirSync(imgDir, { recursive: true });

let imagesUpdated = false;
for (const team of existing[LEAGUE].teams) {
    if (!team.crest) continue;

    // Derive extension from the crest URL (e.g. ".png", ".svg")
    const ext = (team.crest.split("?")[0].split(".").pop() || "png").toLowerCase();
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
