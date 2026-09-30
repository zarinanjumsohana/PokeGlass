# PokéGlass: Pokémon Card Explorer

A glassmorphic Pokémon search app built with plain HTML, CSS and JavaScript. No frameworks, no WebGL or Three.js, and no API keys.

## Run it

Open `index.html` in a browser. It needs an internet connection to reach PokéAPI.

## Files

- `index.html` – structure
- `style.css` – glass theme, type tints, CSS 3D, backdrop scenes, effects
- `script.js` – fetching, rendering, interaction

## Endpoints used

| Endpoint | Used for |
| --- | --- |
| `GET /api/v2/pokemon/{name}` | Main card data (required) |
| `GET /api/v2/pokemon-species/{name}` | Genus and Pokédex text, legendary or mythical tag |
| `GET /api/v2/type/{type}` | Weaknesses, resistances, immunities |
| `GET /api/v2/ability/{name}` | Ability description when an ability is clicked |
| `GET /api/v2/pokemon?limit=100000` | Full name index for the List / Choose panel |

## Fields read from `/pokemon/{name}`

| Field | Use |
| --- | --- |
| `id`, `name` | Pokédex number and title |
| `types[].type.name` | Type badges, colour tint, impact effects |
| `height` (dm), `weight` (hg) | Divided by 10 for metres and kilograms |
| `base_experience` | Fact tile |
| `stats[].base_stat` | Six stat bars and the power rating (their sum) |
| `abilities[].ability`, `is_hidden` | Ability chips |
| `moves[].move.name` | First ten moves |
| `sprites.other['official-artwork']` | 3D artwork (normal and shiny) |
| `cries.latest` | Cry audio |
| `species.url` | Follow-up species request |

## API handling

- Input is trimmed, lowercased and hyphenated, then validated before any request.
- `fetch()` with `async`/`await`; `response.ok` is checked and a 404 is told apart from network failure.
- Loading, success, empty and error states each have their own UI and screen-reader announcements.
- A token guards against out-of-order responses when searches overlap.
- API text is inserted with `textContent`, never `innerHTML`.

## Extra features

- Two parallax backdrops (Sky and Space) that react to the pointer and scroll
- Floating 3D Pokémon in the hero; click one to search it
- Type-tinted glass theme that fades between Pokémon
- Extruded 3D Pokémon that flies in, hovers, tilts with the pointer and spins when dragged
- Click or press Enter on the stage to attack: shockwave, flash, screen shake, particles and cry
- Ambient particles per type (embers, bubbles, sparks, leaves, and so on)
- Shiny toggle, previous/next, random, ability details, type matchups, power rating
- List / Choose: every Pokémon in the API as type-tinted cards, sorted A to Z, with a name filter and letter buttons. Types come from the 18 `/type/{type}` endpoints, and cards load in batches of 60 as you scroll.

## Screenshots to add for submission

1. A successful search (for example `aipom`)
2. An error state (for example `notapokemon`)
