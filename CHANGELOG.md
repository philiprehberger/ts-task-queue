# Changelog

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
