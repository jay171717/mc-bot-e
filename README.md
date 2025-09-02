
# MC Bot Web (Render-ready)

A Node.js + Socket.IO + Vue app to control multiple **Mineflayer** bots with a live dashboard.

## Deploy on Render
1. Fork/Upload this repo to GitHub (or use Render's **"Deploy from a Public Repo/Upload"**).
2. On Render, create a **Web Service** and point to this repo.
3. Ensure these environment variables (already in `render.yaml`):
   - `MC_HOST=fakesalmon.aternos.me`
   - `MC_PORT=25565`
   - `MC_VERSION=1.21.4`
   - `WEB_PORT=10000` (Render assigns PORT; the app will use `process.env.PORT` if set)
4. Click **Deploy**. Open the URL → dashboard loads. Anyone with the URL can see/control.

## Local run
```bash
npm install
npm start
# open http://localhost:3000
```

## Features
- Server banner: online/offline, IP, version, uptime/ping, **non-bot players** list.
- Add multiple bots (cracked/offline login). Toggle connect/disconnect. Delete.
- Per-bot control panels (Status, Inventory, Movement/Looking, Actions, Misc, Debug).
- Auto toggles: Auto-Jump, Auto-Reconnect, Auto-Respawn, Auto-Sprint, Auto-Sleep.
- Inventory 36 slots + armor + offhand. Equip-on-click, swap hands, unequip armor.
- Movement: WASD (step X blocks or continuous + Stop), Jump. Pathfind to XYZ.
- Looking: live pitch/yaw; rotate by increments; lookAt yaw/pitch or coordinates.
- Actions: Left click, Right click, Jump, Sneak, Drop with modes (Once/Interval/Continuous/Stop) + Drop Stack option.
- Debug stream and list of active actions. 1s snapshots via Socket.IO.

> Notes: Aternos may sleep; Auto-Reconnect will retry. Heads via Crafatar. Item icons omitted by default (names shown).

