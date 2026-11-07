import assert from 'node:assert/strict';
export function legacyScheduleProjection(rows) {
  return rows.map(input => {
    const row = {...input};
    for (const key of ['posting_schedule_json', 'schedule_binding_json']) {
      if (Object.hasOwn(row, key)) { assert.equal(row[key], null, 'Legacy rows must not acquire scheduling metadata'); delete row[key]; }
    }
    return row;
  });
}
