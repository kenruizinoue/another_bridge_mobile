# Changelog

All notable changes to this project are documented here. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
project adheres to [Semantic Versioning](https://semver.org/).

## [1.1.0] - 2026-07-02

### Added

- File attachments: the composer's + button opens an attach menu (Photo
  Library or Files). PDF, txt, md, csv, json, code files, and other
  text-readable formats are uploaded to the Mac, where Claude reads them
  with its own Read tool. Max 5 files, 20MB each; images keep the
  existing inline pipeline (max 10, compressed).
- File chips in the attachment strip with name, size, and per-chip
  remove.
- The app version is shown in the session list header.
- Requires another_bridge >= 0.2.0 for the files field.

### Changed

- The image-only attach button was replaced by the single + attach menu.

## [1.0.0] - 2026-07-01

### Added

- Initial release: session browser, terminal-styled chat view with
  markdown, streaming resume over SSE, image attachments, server-side
  send queue, reconnection catch-up, 97 Jest tests, Detox E2E against a
  mocked bridge, GitHub Actions CI.
