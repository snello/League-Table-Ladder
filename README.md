# ⚽ Football Ladder

A beautiful, interactive web-based visualization of football league standings with advanced analytics and real-time data.

![Premier League Table](https://img.shields.io/badge/Premier%20League-Active-4ade80) ![Multiple Leagues](https://img.shields.io/badge/Leagues-6-d4af37) ![Live Data](https://img.shields.io/badge/Data%20Source-football--data.org-007bff)

## Features

### 🎨 Visual Design
- **Golden Ladder System** — Teams positioned on an elegant visual ladder representing their league standing
- **Dark Theme** — Optimized for readability with a sophisticated dark interface and gold accents
- **Responsive** — Works seamlessly on mobile and desktop
- **Live Indicators** — Visual markers for champions (⭐), relegation zone (↓), and safety lines

### 📊 Analytics & Data
- **Multi-League Support** — Track standings for 6 major leagues simultaneously
- **Historical Seasons** — View standings across multiple seasons for any league
- **Safety Line Calculation** — Mathematically determines the safe points total to avoid relegation
- **40-Point Rule** — Shows the historical wisdom threshold for safety
- **Form-Based Projections** — Project final league position based on recent form (last 1-5 games)

### 🔮 Interactive Features
- **Tap for Details** — Click any team to view comprehensive statistics
- **Fixture Prediction** — Set predicted results for upcoming fixtures to project final standings
- **Dynamic Updates** — Real-time standings pulled from authoritative football data API
- **Season Switching** — Toggle between different seasons with a single click
- **Form Analysis** — See team form history with detailed win/draw/loss breakdown

### 📈 Statistics Panel
When you tap a team, view:
- Current and projected points
- Win/Draw/Loss records
- Goals for, against, and difference
- Recent form
- Remaining fixtures (in projection mode)
- Detailed venue breakdowns

## Supported Leagues

| League | Code | Country |
|--------|------|---------|
| Premier League | PL | England |
| EFL Championship | ELC | England |
| La Liga | PD | Spain |
| Bundesliga | BL1 | Germany |
| Serie A | SA | Italy |
| Ligue 1 | FL1 | France |

## Getting Started

### View Live
1. Open `index.html` in a modern web browser
2. Select a league from the dropdown
3. Choose a season (if available)
4. Browse the ladder or tap teams for details

### Modes

**Current Table** — Live standings based on actual match results
- Shows real-time league position
- Displays safety lines (green) and relegation zone (red)
- Shows 40-point wisdom line (gold)

**Final Positions** — Projected final standings
- Estimates final points based on recent form
- Adjustable form window (last 1-5 games)
- Set predicted results for remaining fixtures
- Dynamic projection updates as results are set

## Data & Updates

### Fetching Live Data

This project pulls real standings from [football-data.org](https://www.football-data.org/):

```bash
export FOOTBALL_DATA_API_KEY="your_api_key_here"
./refresh.sh
```

The `refresh.sh` script:
- Fetches standings for all 6 leagues
- Updates `data.json` with team data
- Handles multi-season data structure
- Includes rate limiting (7-second delays between API calls)
- Deploys updated data to hosting

### Data Structure

`data.json` stores standings organized by league and season:
```json
{
  "PL": {
    "name": "Premier League",
    "defaultSeason": "2026",
    "seasons": {
      "2026": {
        "matchday": 15,
        "teams": [
          {
            "id": 57,
            "pos": 1,
            "name": "Arsenal",
            "short": "Arsenal",
            "played": 14,
            "won": 10,
            "drawn": 2,
            "lost": 2,
            "gf": 35,
            "ga": 12,
            "gd": 23,
            "pts": 32,
            "color": "#EF0107",
            "form": ["W", "W", "D", "W", "L"]
          }
        ]
      }
    }
  }
}
```

## How to Use

### Explore the Ladder
1. **Scroll vertically** — The ladder represents points (0–max current points)
2. **Read positions** — Teams lined up horizontally at their point level
3. **Identify zones**:
   - 🔵 **Blue band** — Top 4 (UEFA Champions League places)
   - 🔴 **Red band** — Bottom 3 (Relegation)
   - 🟢 **Green line** — Safety threshold
   - 🔵 **Cyan line** — Safety by form (projected)
   - 🟡 **Gold line** — 40-point rule

### View Team Details
- **Tap any team** to see full statistics
- **Toggle modes** to switch between current and projected standings
- **Adjust form window** (1–5 games) to change projection sensitivity

### Set Predicted Results
In **Final Positions** mode:
1. Tap a team
2. Scroll down to "Remaining Fixtures"
3. Click a fixture card
4. Select W/D/L to record your prediction
5. Watch the projection update in real-time

## Keyboard & Navigation

- **Escape** — Close team detail panel or result picker
- **Click backdrop** — Close open panels
- **Tap teams** — Open statistics
- **Tap fixtures** — Set predicted results

## Technical Stack

- **Frontend**: HTML5, CSS3, vanilla JavaScript
- **Backend**: Node.js (ES modules)
- **Data Source**: [football-data.org API](https://www.football-data.org/)
- **Storage**: JSON files + localStorage (for user predictions)
- **Deployment**: Shell scripts (bash)

### Key Files

| File | Purpose |
|------|---------|
| `index.html` | Main interactive web interface |
| `data.json` | League standings cache |
| `comps.json` | League metadata (names, emblems) |
| `fetch-standings.mjs` | Node.js script to fetch fresh data from API |
| `refresh.sh` | Orchestrates full data update |
| `deploy.sh` | Handles deployment to hosting |
| `cache-bust.js` | Updates version tokens to invalidate caches |
| `fixtures/` | Stores match schedules and fixture data |

## Configuration

### Environment Variables

Set before running refresh scripts:

```bash
export FOOTBALL_DATA_API_KEY="your_key_here"
export NODE_BIN="/path/to/node"                    # Optional: explicit node path
export LEAGUE_LADDER_ENV_FILE="/path/to/env"      # Optional: env file path
```

### Customization

**Colors & Styling** — Edit CSS variables in `<style>` section:
```css
:root {
  --bg: #0e0018;              /* Background */
  --rail-color: #d4af37;      /* Primary accent (gold) */
  --rung-filled: rgba(...);   /* Active rung color */
}
```

**Leagues** — Edit `fetch-standings.mjs` to add/remove leagues

**Team Overrides** — Customize team names, colors, and badges in `fetch-standings.mjs`

## Safety & Relegation Logic

### Safety Line
The **green safety line** marks the minimum points needed to mathematically guarantee safety:

```
Safety = 18th place team's points + (remaining games × 3) + 1
```

This is the highest point total the 18th-place team can possibly achieve, so any team above this line cannot be relegated.

### Safety by Form
The **cyan line** projects safety based on current form:

```
Projected Safety = Current points + ceil(PPG × games remaining) + 1
```

Where PPG = points per game in the current season.

### 40-Point Rule
The **gold 40-point line** represents the historical "wisdom" threshold—the experience-based safe total across most seasons.

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers (iOS Safari, Chrome Android)

## Performance

- Lightweight frontend (~50KB HTML/CSS/JS)
- Minimal dependencies (vanilla JavaScript)
- Lazy loading for team badges
- Smooth scrolling and animations
- Touch-optimized for mobile

## Contributing

To enhance or modify the ladder:

1. **Add leagues** — Update `fetch-standings.mjs` with new league codes
2. **Adjust thresholds** — Modify safety line calculations in `buildLadder()`
3. **Customize UI** — Edit CSS or adjust layout in HTML
4. **Extend features** — Add new statistics or analytics to the detail panel

## Troubleshooting

**"Failed to load data"** — Check that `data.json` exists and is valid JSON

**Outdated standings** — Run `./refresh.sh` with valid API key

**Missing team badges** — Verify `images/` directory exists or check CDN URLs

**Sticky predictions** — Clear localStorage: Open DevTools → Application → Local Storage → Clear All

## License

This project is provided as-is for personal use and experimentation.

## Data Attribution

League standings and fixture data sourced from [football-data.org](https://www.football-data.org/). Team crests from official Premier League and federation sources.

---

**Made with ⚽ and 🥇**
