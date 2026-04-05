# Changelog

## 0.3.6

- Fix README GitHub URLs to use correct repo name (ts-task-queue)

## 0.3.5

- Standardize README to 3-badge format with emoji Support section
- Update CI actions to v5 for Node.js 24 compatibility
- Add GitHub issue templates, dependabot config, and PR template

## 0.3.4

- Fix CI and License badge URLs in README

## 0.3.3

- Add Development section to README
- Fix CI badge to reference publish.yml

## 0.3.0
- Fix timeout timer leak — clear `setTimeout` when handler resolves before timeout
- Add `maxSize` option to limit pending queue length (throws on overflow)
- Add `clear()` method to remove all pending jobs and return count removed

## 0.2.0
- Fix ID collisions across multiple queue instances (per-queue counter)
- Fix deduplication returning stale job — re-adding with same key now updates priority and data
- Add job timeout support (queue-level default + per-job override)
- Add test suite (24 tests)

## 0.1.0
- Initial release
