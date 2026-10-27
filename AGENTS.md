# Continuing work

Read `HANDOFF.md` before working to understand current progress, evidence locations, and remaining work. New user instructions take precedence.

- The Steam service is in `steam-multi-account/`, research reports in `rust-research/`, and research tools in `tools/rust-research/`. English documentation is indexed in `docs/ENGLISH_INDEX.md`.
- Keep raw captures and local research material in ignored `captures/` or `work/` directories. Protect credentials in `data/`; never print or commit keys, cookies, refresh tokens, authentication tickets, or remote-administration credentials.
- Distinguish Steam activity, A2S replies, actual Rust player admission, valid EAC sessions, and Facepunch public counts. State supporting evidence and what remains unverified.
- Use relative paths or paths explicitly supplied by the user; do not depend on a particular computer's username or checkout directory.
- The user requests completed change batches to be committed and pushed. The current publication target is `https://github.com/oldboy1026/rust-game-server-fake-player.git` (`main`); retain the previous Gitee remote as a mirror. Verify the remote SHA after pushing. Report authentication/network failures explicitly; a local commit alone is not an uploaded result.
- All previously imported local accounts were explicitly deleted on 2026-10-27. Do not restore accounts from historical snapshots or rerun old reconnection scripts.
