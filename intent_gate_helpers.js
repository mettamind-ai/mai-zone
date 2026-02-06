/**
 * MaiZone Browser Extension
 * Intent Gate Helpers: Pure helpers for distracting sites intention gate
 * @feature f13 - Intent Gate for Distracting Sites
 */

import { getHostnameFromUrl, isHostnameInList } from './distraction_matcher.js';

const STUDY_REASON_NORMALIZED = 'hoc bai';
const YOUTUBE_HOSTS = ['youtube.com', 'youtu.be'];
const YOUTUBE_STUDY_ALLOW_MINUTES = 60;
const FALLBACK_ALLOW_MINUTES = 5;

/**
 * Normalize free-text reason for intent matching:
 * - lowercase
 * - strip Vietnamese diacritics
 * - collapse repeated whitespace
 * @param {string} reason - Raw reason text
 * @returns {string}
 */
function normalizeReason(reason) {
  if (typeof reason !== 'string') return '';
  return reason
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Compute allow window (minutes) based on URL + reason.
 * Rule:
 * - YouTube + reason "học bài" / "hoc bai" => 60 minutes.
 * - Otherwise fallback to default minutes.
 * @param {Object} params - Input payload
 * @param {string} params.url - Pending URL
 * @param {string} params.reason - User-entered reason
 * @param {number} [params.defaultMinutes=5] - Fallback allow window
 * @returns {number}
 */
export function getIntentGateAllowMinutes({ url, reason, defaultMinutes = FALLBACK_ALLOW_MINUTES } = {}) {
  const fallback =
    Number.isFinite(defaultMinutes) && defaultMinutes > 0
      ? Math.max(1, Math.floor(defaultMinutes))
      : FALLBACK_ALLOW_MINUTES;

  const hostname = getHostnameFromUrl(url);
  if (!isHostnameInList(hostname, YOUTUBE_HOSTS)) return fallback;

  return normalizeReason(reason) === STUDY_REASON_NORMALIZED ? YOUTUBE_STUDY_ALLOW_MINUTES : fallback;
}

/***** MATCHING *****/

/**
 * Compute whether a URL should trigger intent gate.
 * @param {string} url - Full URL
 * @param {Object} state - Current state snapshot
 * @returns {{hostname: string, shouldGate: boolean, isDeepWorkBlocked: boolean}}
 */
export function getIntentGateMatch(url, state) {
  const s = state && typeof state === 'object' ? state : {};
  const hostname = getHostnameFromUrl(url);
  if (!hostname) return { hostname: '', shouldGate: false, isDeepWorkBlocked: false };

  const distractingSites = Array.isArray(s.distractingSites) ? s.distractingSites : [];
  const deepWorkBlockedSites = Array.isArray(s.deepWorkBlockedSites) ? s.deepWorkBlockedSites : [];
  const isInFlow = !!s.isInFlow;

  const isStandardDistracting = isHostnameInList(hostname, distractingSites);
  const isDeepWorkBlocked = isInFlow && isHostnameInList(hostname, deepWorkBlockedSites);

  return {
    hostname,
    shouldGate: isStandardDistracting || isDeepWorkBlocked,
    isDeepWorkBlocked
  };
}
