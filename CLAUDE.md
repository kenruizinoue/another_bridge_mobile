@AGENTS.md

# another_bridge_mobile

Terminal-styled iOS client for another_bridge: browse the Claude Code sessions
on the Mac, read them, and continue them by text, attachments or voice.

## How to work in this repo

The engineering rules this app follows are copied into `standards/`. Read them
from the source files each time; this file never summarizes or copies their
content, so nothing gets lost.

- Always mandatory: `standards/base-sdlc.md`.
- Stack rules: read `standards/react-native.md` before working on any app
  ticket.
- Read the exact versioned Expo docs (see `AGENTS.md`) before writing code.
- Plan and ticket status: `docs/PROJECT_PLAN.md`. Work is delivered as numbered
  tickets, each ending with the verification commands in `README.md` and an
  update to the plan's status table.
- The default branch is `master`. Work happens on a feature branch and merges
  into `master` through a PR.
- The server lives in `../another_bridge`. A change to an endpoint contract
  needs the matching server change and a note in both changelogs.
- Every build installed on Ken's iPhone gets a new version, so the version
  in the app header tells him at a glance that it updated: a patch bump
  (1.5.1) for fixes and small changes, a minor bump (1.6.0) for new
  features. Bump `app.json` and `package.json` and add a CHANGELOG entry
  before building. Never install a changed build under a version already
  installed (Ken, October 26, 2026).
