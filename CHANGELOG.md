# Changelog

## 0.2.0
- Fix ID collisions across multiple queue instances (per-queue counter)
- Fix deduplication returning stale job — re-adding with same key now updates priority and data
- Add job timeout support (queue-level default + per-job override)
- Add test suite (24 tests)

## 0.1.0
- Initial release
