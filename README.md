# Election Atlas — November 3, 2026

A premium, self-hosted election-night dashboard with a **personal 54-item Azusa ballot**, the **Los Angeles mayoral race**, **all California State Assembly (80), State Senate (20 scheduled) and Governor races**, **all 435 U.S. House seats**, **35 scheduled U.S. Senate races**, and a clickable 50-state geographic choropleth map with Alaska/Hawaii insets.

## Start (no installation or API keys)

1. Install Node.js 20+ if you do not have it (Node 22 preferred). For convenience, macOS users can launch `START-MAC.command`, and Windows users can launch `START-WINDOWS.bat`.
2. In a terminal, from this folder, run `npm start` (or `node server.mjs`).
3. Open **http://localhost:8787** in a browser.
4. The interface refreshes on a 60-second cycle. Click **Refresh** for an immediate re-render (provider responses are cached for 60 seconds).

On macOS Terminal:
```sh
cd /path/to/Election_2026_Live_Dashboard
npm start
```

Optional: `HOST=0.0.0.0 PORT=8787 npm start` to listen on a network interface. Only do so behind a properly configured reverse proxy if exposing beyond your trusted network. In production, deploy the folder to Render / Railway / Fly.io as a Node web service running `npm start`, use HTTPS, set `HOST=0.0.0.0`, and choose the host's supplied `PORT` environment variable.

## Providers and data scope

- **LA County Registrar**: [official November 3 JSON feed](https://results.lavote.gov/electionresults/json?electionid=4348). Countywide local races, Superior Court judges, county measures and city of LA Mayor. State and federal results in this LA source are *Los Angeles County only*.
- **California Secretary of State**: official [R26GG](https://media.sos.ca.gov/media/R26GG.txt) (contest names), [C26GG](https://media.sos.ca.gov/media/C26GG.txt) (candidates) and [V26GG](https://media.sos.ca.gov/media/V26GG.txt) (reported votes), as defined in the [official feed documentation](https://cms.cdn.sos.ca.gov/media/2-ascii-file-format-v19.pdf). County code **59** represents California statewide / districtwide totals. This is what powers all California legislative and governor results as well as California races on the personal ballot.
- **Open America**: [documented public 2026 federal results feed](https://openamerica.io/elections/api/), receiving vote counts directly from election-office data for **22 states**. Crucially: **does not call winners**, and missing seats must not be mistaken for zero votes.
- **watch.vote**: [2026 elections results API](https://watch.vote/docs/api-reference/elections); secondary national enrichment source. The live response schema may change; no source results are fabricated.

**Important:** no free source checked in advance guarantees complete live coverage of every federal district nationwide. The app always lists all 435 House seats and all 35 Senate contests, marks unavailable source coverage explicitly, and shows only actual provider counts. If a feed is inaccessible or returns a format that the parser does not recognize, the interface remains usable but marks coverage as unavailable. This is not a claim of complete nationwide election-night data.

Results are scheduled to become available after California polls close at **8 p.m. PST, November 3, 2026**, and later reporting may take days or weeks. The LA feed is published in advance with zeroes; the app treats zero-vote entries as **not yet reported**.

### Race status semantics

- **Awaiting results**: no counted votes observed.
- **Leading**: a candidate has the most votes *so far*, **not a called winner**.
- **Called**: only when a source explicitly reports a race call (never inferred by this app).
- **Official source scope** is printed on each race; do not treat LA County subtotals as statewide results.
- **Demo preview** (optional switch) is clearly labeled with simulated values; cannot overwrite live data.

## Source/coverage diagnostics

- `GET /api/health`
- `GET /api/ballot` — all 54 personal items plus LA Mayor and the source timestamps
- `GET /api/california` — 101 California governor, Senate and Assembly contests (includes placeholders for races without data)
- `GET /api/national?office=house` — 435 rows
- `GET /api/national?office=senate` — 35 rows

## Development / tests

Run `npm test`. The tests verify California SOS C/R/V parsing, LA County JSON parsing, 54-item ballot resolution, CA and national skeleton counts, and correct pre-results handling.

No npm packages are required, no tracking or analytics, and no ballot selections or user addresses are transmitted. The app contains the 54 **contest titles**, not the user's address, voter ID, selections or political profile.

## Limitations

1. Data provider sites occasionally change URL, schema, CORS or access limits. This app uses a local Node data proxy and surfaces source failures. The server must have outbound HTTPS access.
2. The federal results board uses provider coverage, which may be partial; rows without verified returns are plainly shown as missing.
3. California legislative lists cover the scheduled 20 even-numbered Senate seats and 80 Assembly seats, and do not assume unscheduled special elections.
4. State tiles are an interactive **cartogram, not a boundary-accurate map**. Their color reflects leading parties in available reported House district counts, not statewide party preference, seat calls, or certification.
5. App was assembled before polls closed. We could test parsing on published pre-election feeds but **could not verify the post-8:00 p.m. feed schema or returns in advance**.

## Geographic U.S. map

The U.S. map uses Census-derived state boundaries via the ISC-licensed [us-atlas](https://github.com/topojson/us-atlas) package. Render installs this dependency with npm install. The server exposes projected TopoJSON at /api/map-topology and the dashboard converts it to an interactive SVG. No browser CDN, API key or external map service is required.

Gray indicates no reported votes. When reporting, state fills identify which party leads in more of that state's **reporting U.S. House districts**; they do not indicate race calls, projected winners, or statewide vote totals. Select a state for its district breakdown.

## Candidate rosters, party affiliations, and portraits

- California SOS publishes **contest codes (R26GG.txt)** and **candidate records (C26GG.txt)** separately from **vote totals (V26GG.txt)**. Candidate rosters now populate even before vote reporting begins. The optional vote file may be unavailable before 8 p.m. Pacific.
- Federal House/Senate candidate rosters are loaded separately from [DeepSyte's 2026 general-election roster](https://deepsyte.app/data/candidates-2026.csv), sourced to state-certified ballot lists where available and nominee records elsewhere. This independent list is *not* an official certification of every candidate in every state. The parser reports errors through `/api/national?office=house` or `senate` instead of silently guessing.
- The personal 54-item ballot also preserves party names from the bundled ballot choices when a source has not provided them. The nonpartisan Los Angeles mayoral election uses the two [City Clerk-certified finalists](https://clerk.lacity.gov/elections/municipal-elections).
- A small, manually identified set of notable candidates can show photographs from Wikipedia/Wikimedia Commons when available. Other candidates display styled initial avatars. This avoids mismatched photographs and gracefully handles missing images.
- Names, images, and party affiliations are **independent of vote totals**. No returns or winners are invented.


## Federal candidate portrait enrichment (optional)

The public **House & Senate** view now requests additional **verified portrait metadata** for named federal candidates. The browser sends batches of up to 100 candidate identities (name, office, state and House district) to `POST /api/portrait-enrichment` on our Render server. The server then calls watch.vote's [verified 2026 candidate portrait service](https://watch.vote/docs/api-reference/elections), which documents a 150-lookup batch endpoint.

**Safeguards**
- Names alone never identify a photograph. A returned photo must match the candidate identity; unrecognized provider response formats or anonymous ordered lists are *not* trusted.
- Cache verified matches for 24 hours and verified misses for 6 hours. Cap requests globally within 10-minute windows, respect 429 Retry-After and use bounded individual GET fallbacks if the batch schema cannot be safely parsed.
- No third-party calls from the browser. Photo enrichment is separate from election-result routes and cannot modify votes, reporting states or candidate names.
- Preserve the curated local official-portrait catalog, avoid replacing it with unrelated images, and show initials for unresolved or unavailable photos.
- The Data Sources view reports attempted federal lookups, matching photo metadata and provider errors. Source/author/license metadata is retained and shown with image title text.

**Known limitation:** watch.vote verifies overrides and currently serving members; many challengers may still have no licensable verified photo. On November 3, a GitHub Actions live probe confirmed the POST batch route accepts `{lookups:[...]}` and returns named `portraits` and `unavailable` records with attribution and licensing. Individual GET requests returned HTTP 403 from the GitHub runner, so normal operation avoids GET fallback when the batch contract succeeds. Internet-dependent portrait coverage must still be checked on Render after merging. The feature does not claim complete coverage of all federal candidates.

## Reviewed Commons fallback for federal candidates

The automated watch.vote portrait directory deliberately leaves many challengers and former members without photos. The dashboard therefore supports a second, *reviewed* source at `public/federal-portrait-overrides.json`: Wikimedia Commons photographs with verified identities, source URLs, author credits, and license terms.

**Candidate matching is seat-specific:** office + state + district (for House) + normalized name. In particular, the 2026 Michigan U.S. Senate candidate Mike Rogers is a former Michigan U.S. representative; Commons also has images of an unrelated former Alabama U.S. representative of the same name. The two must never be conflated. Reviewed Commons photos override missing watch.vote photos; no image lookup is allowed to alter vote counts or contest lists.

Currently documented Michigan Senate examples:

- Abdul El-Sayed: [2025 photo by Kenneth C. Zirkel](https://commons.wikimedia.org/wiki/File:Abdul_El-Sayed.jpg), CC BY-SA 4.0. The app displays author/license attribution.
- Mike Rogers (Michigan): [official earlier congressional portrait](https://commons.wikimedia.org/wiki/File:Mike-Rogers-Head-Shot-2.jpg), U.S. federal government public domain.

Images may be fetched from Wikimedia or retried through the app's same-origin proxy using only the fixed, reviewed manifest. When an image source fails, the candidate's initials remain visible. Do not copy copyrighted campaign or news images without permission. Further candidate coverage requires verified portrait sources; no name-only automatic image search is used.


## Automatic Commons discovery by exact FEC ID

For federal candidates not covered by the verified watch.vote directory or the reviewed override list, Election Atlas can now look up their **FEC candidate ID** (from the source's 2026 federal candidate roster) in **Wikidata property P1839** and read the linked **Wikimedia Commons photo (P18)**. A November 3 live probe confirmed that 1,228 of 1,294 source roster records have FEC IDs, Wikidata's SPARQL endpoint resolves a subset to photos, and Wikimedia Commons' `imageinfo` API returns actual author and license metadata.

- Only a valid ID that agrees with **office + state** is eligible. The Wikidata match must be an exact P1839 ID, never a name-only match. Conflicting Wikidata identities or image files are rejected.
- Candidate images must come from `thumb.wikimedia.org` or `upload.wikimedia.org`, and Commons metadata must explicitly permit reuse (public domain, CC0, CC BY or CC BY-SA). Noncommercial/no-derivatives/nonfree or unclear images are ignored.
- Image attribution and source license are linked in expanded candidate details. A same-origin cached image proxy is available for verified FEC-ID images.
- Photo lookups are optional and separate from all election-result API calls. Candidate rosters, votes and state filters remain accessible if Wikidata, Commons or watch.vote fails. Cache misses briefly, cache photos longer, and cool down after upstream errors.

A valid FEC ID does not guarantee that Wikidata has a matching person with an openly licensed photograph. The app will show initials when the exact matching process returns no usable image. The curated Michigan Senate overrides remain an independent fallback.
