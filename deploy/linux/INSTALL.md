# Linux autostart with systemd

1. Copy `stasisbot.service.template` to `/etc/systemd/system/stasisbot.service`.
2. Replace `CHANGE_ME` with the Linux user that owns/runs the bot.
3. Replace `/absolute/path/to/stasisbot` with the absolute project directory.
4. Confirm the npm path with `which npm`. Adjust `ExecStart` if needed.
5. Run:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now stasisbot
sudo systemctl status stasisbot
```

Logs:

```bash
journalctl -u stasisbot -f
```
