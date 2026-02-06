import assert from 'node:assert/strict';
import test from 'node:test';

import { getHostnameFromUrl, isHostnameInList } from '../distraction_matcher.js';
import { getIntentGateAllowMinutes, getIntentGateMatch } from '../intent_gate_helpers.js';

test('getHostnameFromUrl normalizes hostnames', () => {
  assert.equal(getHostnameFromUrl('https://WWW.FACEBOOK.COM/some/path?x=1'), 'facebook.com');
  assert.equal(getHostnameFromUrl('http://m.facebook.com'), 'm.facebook.com');
  assert.equal(getHostnameFromUrl('chrome://extensions'), '');
});

test('isHostnameInList matches exact and subdomains', () => {
  const sites = ['facebook.com'];
  assert.equal(isHostnameInList('facebook.com', sites), true);
  assert.equal(isHostnameInList('m.facebook.com', sites), true);
  assert.equal(isHostnameInList('notfacebook.com', sites), false);
});

test('getIntentGateMatch detects standard distracting sites', () => {
  const state = {
    isInFlow: false,
    distractingSites: ['facebook.com'],
    deepWorkBlockedSites: ['messenger.com']
  };

  const match = getIntentGateMatch('https://facebook.com', state);
  assert.equal(match.shouldGate, true);
  assert.equal(match.isDeepWorkBlocked, false);
  assert.equal(match.hostname, 'facebook.com');
});

test('getIntentGateMatch detects deep work blocked sites only in flow', () => {
  const baseState = {
    distractingSites: ['facebook.com'],
    deepWorkBlockedSites: ['messenger.com']
  };

  const notInFlow = getIntentGateMatch('https://messenger.com', { ...baseState, isInFlow: false });
  assert.equal(notInFlow.shouldGate, false);
  assert.equal(notInFlow.isDeepWorkBlocked, false);

  const inFlow = getIntentGateMatch('https://messenger.com', { ...baseState, isInFlow: true });
  assert.equal(inFlow.shouldGate, true);
  assert.equal(inFlow.isDeepWorkBlocked, true);
});

test('getIntentGateMatch returns false when site not in lists', () => {
  const state = {
    isInFlow: true,
    distractingSites: ['facebook.com'],
    deepWorkBlockedSites: ['messenger.com']
  };

  const match = getIntentGateMatch('https://example.com', state);
  assert.equal(match.shouldGate, false);
});

test('getIntentGateAllowMinutes gives YouTube study reason a 60-minute window', () => {
  assert.equal(
    getIntentGateAllowMinutes({
      url: 'https://www.youtube.com/watch?v=abc123',
      reason: '  Học   bài  '
    }),
    60
  );

  assert.equal(
    getIntentGateAllowMinutes({
      url: 'https://m.youtube.com/',
      reason: 'hoc bai'
    }),
    60
  );
});

test('getIntentGateAllowMinutes falls back to default for non-matching cases', () => {
  assert.equal(
    getIntentGateAllowMinutes({
      url: 'https://youtube.com/',
      reason: 'xem giải trí'
    }),
    5
  );

  assert.equal(
    getIntentGateAllowMinutes({
      url: 'https://facebook.com/',
      reason: 'hoc bai',
      defaultMinutes: 7
    }),
    7
  );
});
