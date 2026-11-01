# Priority Lost

A shared, priority-ordered shopping list for the family. Open it on any phone, add what you need, and keep the most important thing at the top so you never buy the small stuff first.

## Features
- Add items (name, quantity, est. price, note) — to the bottom, or straight to **#1**
- Re-prioritise with ⤒ / ▲ / ▼
- Every item shows the **date added** and who added it; bought items show the date bought
- "Buy next" highlight on #1, and a gentle warning if you mark something bought while a higher-priority item is still waiting
- Bought history with "put back on list", duplicate warning, estimated total
- Installable on a phone home screen (PWA), works offline, light/dark mode
- People: Me, JD (add your daughter with "+ Add person…")

## Run it
No build step. Serve the folder with any static server, e.g. `python3 -m http.server`, or host free on GitHub Pages (Settings → Pages → deploy from `main`).

By default the list is stored **on that device only**. To share one list between phones:

## Turn on sharing (Firebase, free tier)
1. Create a project at https://console.firebase.google.com → add a **Web app** → copy its config.
2. Build → **Firestore Database** → create (production mode), then set rules to:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{db}/documents {
       match /lists/{code} { allow read, write: if true; }
     }
   }
   ```
   (Anyone who knows your list code can edit it — use a non-obvious code. Fine for a shopping list.)
3. Paste the config into `config.js`, commit, and open the site on each phone. Everyone enters the **same list code** on first launch.
