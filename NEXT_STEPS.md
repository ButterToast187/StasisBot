# StasisBot – Current Status / Next Steps

Status: Phase 4. The real player-bound `pull` command is implemented and live-tested. The old `testpull` debug command has now been removed from the public command handler.

## Current commands

- `ping`
- `status`
- `pos`
- `route`
- `scan`
- `checkregistry`
- `createstasis`
- `removestasis`
- `pull`

All player-facing replies are sent via Minecraft `/msg <player> <message>` and are now in English. Console/debug logs may remain German.

## Chamber layout

There are currently 40 chambers. Chambers 1–10 and 21–30 are on the left side; Chambers 11–20 and 31–40 are on the right side. The bot visits the complete left side first and then the complete right side. The chamber count is derived dynamically from `config.chambers`.

Each chamber has a sign and a spruce trapdoor. The trapdoor is one block below and one block behind the sign relative to the chamber-facing direction.

## `createstasis`

The bot searches for a free chamber, writes the player's name to the sign, stores the assignment in `data/stasis.json`, returns to the start position, and tells the player which stasis they received.

Example reply:

`Your stasis was created successfully. Your chamber is Stasis 3.`

Current known registry assignments include:

- ButterToast187 -> Stasis 1
- Luna1037 -> Stasis 2
- strander013 -> Stasis 3

## `pull`

The player only sends:

`pull`

The bot uses the whisper sender's username to look up the assigned chamber in `data/stasis.json`. Players cannot choose another chamber through the normal `pull` command.

Flow:

1. Look up the sender in the registry.
2. Walk to the assigned chamber.
3. Find the chamber sign.
4. Resolve the trapdoor one block below and one block behind the sign.
5. Right-click the trapdoor once to pull the stasis.
6. Wait briefly.
7. Right-click the same trapdoor again to reset it.
8. Return to the start position.
9. Tell the player to place a new pearl.

Example success reply:

`Your Stasis 3 has been pulled. Please place a new pearl in your stasis now.`

If the player has no registered stasis:

`You don't have a registered stasis yet. Use 'createstasis' first.`

## Removed debug command

`testpull <chamber>` has been removed from the command list and whisper command handler because the physical pull/reset mechanism has already been successfully tested. The internal reusable pull logic in `src/stasisInteraction.js` remains in place for the real `pull` command.

## Recommended next feature: `removestasis`

Suggested flow:

1. Find the player's registry entry.
2. Walk to their chamber.
3. Clear/reset the player name on the sign.
4. Verify the sign was updated successfully.
5. Remove the registry entry only after the world update succeeds.
6. Return to the start position.
7. Confirm removal to the player via `/msg`.

After that, useful improvements would be admin/debug permissions, registry/world consistency checks, recovery after disconnects or failed pathfinding, and optional cooldown/rate-limit handling.

## Implemented now: `removestasis`

`removestasis` is now implemented.

Flow:

1. Look up the whisper sender in `data/stasis.json`.
2. Walk to the assigned chamber.
3. Find and validate the chamber sign.
4. Refuse removal if the visible sign belongs to a different player.
5. Rewrite the sign to only contain `Stasis <number>`.
6. Verify that the player name disappeared from the sign.
7. Only after the world update succeeds, remove the player from `data/stasis.json`.
8. Return to the start position.
9. Confirm to the player that the chamber is free.

Player command:

`removestasis`

Example success reply:

`Your Stasis 3 was removed successfully. The chamber is now free.`

## Recommended next feature

The next useful step is a registry/world consistency check. An admin/debug command could scan all configured chamber signs and compare them with `data/stasis.json`, reporting mismatches such as a player existing only on a sign, only in the registry, or being assigned to different chambers.

## Implemented now: `checkregistry`

The registry/world consistency check is now implemented as a read-only command:

`checkregistry`

It scans all configured chambers, compares the visible player name on each chamber sign with `data/stasis.json`, and then returns to the start position.

It detects:

- a correctly occupied chamber
- a correctly free chamber
- a player name that exists only on a sign
- a player assignment that exists only in the registry
- a sign owner that is registered to a different chamber
- a sign/registry owner mismatch
- missing/ambiguous signs or scan errors
- duplicate chamber assignments if `stasis.json` was manually corrupted

The check never writes to signs and never changes `stasis.json`. A short summary and up to eight issues are sent to the command sender via `/msg`; the complete report is always printed in the bot console.

## Recommended next feature

Add admin/debug permissions so expensive/debug commands such as `route`, `scan`, and `checkregistry` can only be started by configured admins. After that, add recovery handling for disconnects/pathfinding failures and optional cooldown/rate limiting.

## Implemented now: admin permissions

Admin/debug permissions are now implemented.

Admin list:

`data/admins.json`

Default configured admin:

- `ButterToast187`

Admin-only commands:

- `route`
- `scan`
- `checkregistry`

The username comparison is case-insensitive. If a non-admin tries one of these commands, the bot refuses without starting a route or changing the busy state and replies:

`You do not have permission to use this command.`

Normal player commands remain available to everyone:

- `ping`
- `status`
- `pos`
- `createstasis`
- `removestasis`
- `pull`

To add another admin, add the Minecraft username to the `admins` array in `data/admins.json` and restart the bot.

## Recommended next feature

Add recovery handling for disconnects, kicks, failed pathfinding, or commands interrupted while the bot is away from the start position. After that, optional per-player cooldown/rate limiting can prevent command spam.

## Implemented now: 24/7 reconnect + host autostart support

The bot now uses a parent supervisor in `scripts/bootstrap.js`.

Behavior:

1. `npm start` starts the supervisor.
2. The supervisor starts `src/index.js` as a separate child process.
3. If Mineflayer is kicked or the connection ends, `src/index.js` exits cleanly with restart code 75.
4. The supervisor waits 60 seconds.
5. A completely fresh bot process is started and reconnects to Minecraft.
6. If that connection also fails, the same 60-second retry cycle continues.
7. Manual `Ctrl+C` stops the supervisor and does not reconnect.

This is intended for the Minecraft server's two scheduled daily restarts as well as temporary connection failures.

For a reboot of the machine/VPS hosting StasisBot itself, deployment helpers are included:

- Windows Task Scheduler: `deploy/windows/install-autostart.ps1`
- Linux systemd: `deploy/linux/stasisbot.service.template`

The OS autostart launches `npm start`, after which the internal supervisor handles Minecraft reconnects.

## Recommended next feature

Add recovery for a command that gets interrupted while the bot is physically away from its start position, then add optional per-player cooldown/rate limiting to prevent command spam.
