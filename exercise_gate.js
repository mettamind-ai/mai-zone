/**
 * MaiZone Browser Extension
 * Exercise Gate UI: collect reps to unlock browser
 * @feature f14 - Exercise Reminder
 */

import { sendMessageSafely } from './messaging.js';
import { messageActions } from './actions.js';

const pushupsEl = document.getElementById('pushups');
const situpsEl = document.getElementById('situps');
const squatsEl = document.getElementById('squats');
const submitEl = document.getElementById('submit');
const errorEl = document.getElementById('error');
const statPushupsEl = document.getElementById('stat-pushups');
const statSitupsEl = document.getElementById('stat-situps');
const statSquatsEl = document.getElementById('stat-squats');

function parseCount(el) {
  const raw = typeof el?.value === 'string' ? el.value.trim() : '';
  if (!raw) return 0;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

function setError(message) {
  if (!errorEl) return;
  if (!message) {
    errorEl.style.display = 'none';
    errorEl.textContent = '';
    return;
  }
  errorEl.style.display = 'block';
  errorEl.textContent = message;
}

function normalizeNumericInput(el) {
  if (!el) return;
  el.addEventListener('input', () => {
    const next = String(el.value || '').replace(/[^0-9]/g, '');
    el.value = next.length ? String(Number(next)) : '0';
  });
}

normalizeNumericInput(pushupsEl);
normalizeNumericInput(situpsEl);
normalizeNumericInput(squatsEl);

function updateTodayStats(stats) {
  if (!stats) return;
  if (statPushupsEl) statPushupsEl.textContent = `Hôm nay ${stats.pushUps || 0}`;
  if (statSitupsEl) statSitupsEl.textContent = `Hôm nay ${stats.sitUps || 0}`;
  if (statSquatsEl) statSquatsEl.textContent = `Hôm nay ${stats.squats || 0}`;
}

async function loadTodayStats() {
  const res = await sendMessageSafely(
    { action: messageActions.exerciseGetState },
    { timeoutMs: 3000 }
  );
  if (res?.todayStats) {
    updateTodayStats(res.todayStats);
  }
}

loadTodayStats();

submitEl?.addEventListener('click', async () => {
  setError('');

  const pushUps = parseCount(pushupsEl);
  const sitUps = parseCount(situpsEl);
  const squats = parseCount(squatsEl);

  if (pushUps + sitUps + squats <= 0) {
    setError('Bạn cần nhập ít nhất 1 lần cho một bài tập.');
    return;
  }

  submitEl.disabled = true;

  const res = await sendMessageSafely(
    { action: messageActions.exerciseSubmit, data: { pushUps, sitUps, squats } },
    { timeoutMs: 6000 }
  );

  if (!res?.success) {
    submitEl.disabled = false;
    setError('Chưa ghi nhận được. Hãy thử lại.');
    return;
  }

  // Gate will be closed by background; keep UI calm.
  setError('');
});
