/** Seed registry shared by the fake CLI and the test fixtures. */
/**
 * Build a fresh fake registry.
 * @returns {Record<string, any>} registry with three accounts.
 */
export function createSeed() {
  const iso = (offsetMs) => new Date(Date.now() + offsetMs).toISOString()
  const now = new Date().toISOString()
  return {
    currentId: 'acct_personal01',
    accounts: [
      {
        id: 'acct_personal01',
        email: 'personal@example.com',
        alias: 'personal',
        plan: 'Pro',
        auth_method: 'consumer',
        added_at: '2026-10-20T15:58:44Z',
        last_used_at: '2026-11-03T09:12:00Z',
        usage: {
          five_hour: { remaining_percent: 74, resets_at: iso(3 * 3600 * 1000) },
          weekly: { remaining_percent: 52, resets_at: iso(4 * 86400 * 1000) },
          updated_at: now,
        },
      },
      {
        id: 'acct_work02',
        email: 'work@example.com',
        alias: 'work',
        plan: 'Standard',
        auth_method: 'consumer',
        added_at: '2026-10-21T10:20:00Z',
        last_used_at: '2026-10-30T18:05:00Z',
        usage: {
          five_hour: { remaining_percent: 18, resets_at: iso(40 * 60 * 1000) },
          weekly: { remaining_percent: 81, resets_at: iso(3 * 86400 * 1000) },
          updated_at: now,
        },
      },
      {
        id: 'acct_test03',
        email: 'test@example.com',
        alias: null,
        plan: 'Free',
        auth_method: 'consumer',
        added_at: '2026-10-22T08:00:00Z',
        last_used_at: '2026-10-22T08:00:00Z',
        usage: {
          five_hour: { remaining_percent: 0, resets_at: iso(90 * 60 * 1000) },
          weekly: { remaining_percent: 35, resets_at: iso(2 * 86400 * 1000) },
          updated_at: now,
        },
      },
    ],
  }
}
