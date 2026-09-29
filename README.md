

## Registry consistency check

Use `checkregistry` via whisper to scan all configured chamber signs and compare them with `data/stasis.json`. The command is read-only and returns the bot to its start position when finished.

## Admin permissions

Admin usernames are configured in:

`data/admins.json`

Example:

```json
{
  "admins": [
    "ButterToast187",
    "AnotherAdmin"
  ]
}
```

Admin-only commands are `route`, `scan`, and `checkregistry`. Username matching is case-insensitive. Restart the bot after changing `admins.json`.

## 24/7 operation and automatic reconnect

`npm start` now launches a supervisor process instead of loading the bot directly.

If the Minecraft connection ends (including a kick or a Minecraft server restart), the bot process exits and the supervisor waits **60 seconds** before starting a fresh Mineflayer process. This avoids reusing a broken/disconnected client object.

Manual `Ctrl+C` stops both the bot and supervisor and does **not** trigger a reconnect.

Typical console output after a disconnect:

```text
[END] Verbindung beendet.
[SUPERVISOR] Bot-Prozess beendet (code=75, signal=none).
[SUPERVISOR] Neuer Verbindungsversuch in 60 Sekunden ...
```

### Host machine reboot

The reconnect supervisor can only work while Node.js itself is running. For a complete reboot of the machine/VPS, configure OS autostart once:

- Windows: `deploy/windows/install-autostart.ps1`
- Linux: `deploy/linux/stasisbot.service.template` and `deploy/linux/INSTALL.md`

On Windows, run `install-autostart.ps1` from an Administrator PowerShell on the machine that will permanently host the bot. Do this only on the final host, not on a temporary development PC.

On Linux, follow `deploy/linux/INSTALL.md` to enable the included systemd service.

## StasisBot ban system

Admin-only whisper commands:
- `ban <username>` - permanently blocks a player from using StasisBot.
- `unban <username>` - removes that block.
- `banlist` - shows the current blocked-player list.

Bans are stored in `data/bans.json` and survive bot/VPS restarts. Banned players cannot use normal StasisBot commands. Admins can still manage a banned player's stasis with the existing admin target commands such as `pull <username>`, `createstasis <username>`, and `removestasis <username>`.
