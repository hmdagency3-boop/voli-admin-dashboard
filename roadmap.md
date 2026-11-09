# Unified bans
- [x] Add owner-run SQL for unified codes, existing account bans, device-linked account enforcement and ID/device history lookup.
- [x] Add dedicated bans page; keep device history separate and link member actions to bans.
- [x] Add and run rule tests; 21 tests passed, isolated SQL and UI fixtures verified. Real signed-out redirect verified.
- [x] Document external database/app activation requirements in sql/016_README.md.
- [ ] Activate on Voli database: requires owner to run sql/016_unified_bans.sql.
- [ ] Verify real member enforcement and device reports: requires the separate Voli app integration and real admin session; unavailable in this standalone console.