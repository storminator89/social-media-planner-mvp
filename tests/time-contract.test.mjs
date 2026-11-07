import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveLocalTime as dataTime } from '../modules/data/domain.mjs';
import { resolveLocalTime as workflowTime } from '../modules/workflows/workflows.mjs';

test('workflow and persistent API share exact IANA timezone results across date boundaries', () => {
  for (const zone of ['Europe/Berlin', 'America/Los_Angeles', 'America/New_York', 'Asia/Kathmandu', 'Asia/Tokyo', 'Australia/Lord_Howe', 'Pacific/Apia', 'UTC']) {
    for (const local of ['2027-01-01T00:15', '2027-04-04T12:30', '2027-07-31T23:45', '2027-12-31T23:50']) {
      assert.equal(dataTime(local, zone), workflowTime(local.slice(0, 10), local.slice(11), zone).instant, `${zone} ${local}`);
    }
  }
});

test('both engines reject nonexistent and ambiguous civil times without choosing silently', () => {
  for (const [local, zone, code] of [
    ['2027-03-28T02:30', 'Europe/Berlin', 'DST_GAP'],
    ['2027-10-31T02:30', 'Europe/Berlin', 'DST_AMBIGUOUS'],
    ['2027-03-14T02:30', 'America/New_York', 'DST_GAP'],
    ['2027-11-07T01:30', 'America/New_York', 'DST_AMBIGUOUS']
  ]) {
    assert.throws(() => dataTime(local, zone), e => e.code === code);
    assert.throws(() => workflowTime(local.slice(0, 10), local.slice(11), zone), e => e.code === code);
  }
});
