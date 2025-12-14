# MaiZone MV3 Extension — Architecture/Quality Review (Round 2, after refactor)

## Context
MaiZone là Chrome extension (MV3) với mục tiêu: “do one thing at a time”.
Core features:
- f01: Cảnh báo/chặn trang gây sao nhãng (webNavigation + content UI)
- f03/f04: Deep Work 40 phút + nhắc nghỉ (timer/badge/notification)
- f05: State management tập trung (sanitize + invariants + broadcast)

Mục tiêu kỹ thuật:
- **MV3 reliability** (service worker sleep/wake, tránh race, tránh “random bugs”)
- **Maintainability** (SRP, boundaries rõ, clean data flow, giảm coupling)
- **Least-privilege + privacy-first**
- Không bundler / không dependency nặng (repo phẳng)
- Vietnamese user-facing strings, logging 🌸/🌸🌸🌸
- Không có bất kỳ code/tính năng liên quan Gemini/LLM key

## What changed since Round 1 (applied your feedback)
Mình đã triển khai các điểm chính từ Round 1 (P0/P1):
- Thêm **MV3 init gating** `ensureInitialized()` để tránh đọc DEFAULT_STATE trước khi hydrate.
- Serialize `updateState()` bằng **promise queue** để tránh race giữa popup/alarms/webNavigation.
- Chuẩn hoá broadcast: `stateUpdated` gửi `{ delta }` (giữ `{ state }` alias tạm).
- Debounce warning theo tab+hostname để tránh spam do webNavigation/SPA.
- Harden fallback UI: nếu background unreachable thì fallback storage write vẫn chạy sanitize/invariants + diff, chỉ set **delta**.
- Tách “pure state core” sang `state_core.js` (schema + sanitize + invariants + diff) dùng chung background/UI.

Commit refs (để bạn hiểu intent, không cần đọc git):
- `15114c4`: MV3 gating + serialize update + delta broadcast + debounce + state_core + hardened fallback
- `43d3289`: Fix BreakReminder await `updateState()` sau khi serialize update queue

## Current Architecture (source-of-truth)
- `background.js`: register listeners sync, init modules, kick `ensureInitialized()`
- `background_state.js`: hydrate state, queued updates, storage persistence, broadcast `stateUpdated`
- `state_core.js`: pure functions (schema/sanitize/invariants/diff)
- `state_helpers.js`: UI get/update state (message-first, fallback sanitized)
- `background_distraction.js`: webNavigation blocking + warning to content (debounce)
- `background_breakReminder.js`: alarms-based timer + badge + notification
- `content.js`: classic script (no import), privacy-first, minimal footprint + YouTube SPA observer

---

## Analysis Needed (Round 2 — push harder, focus edgecases + maintainability)

### 1) Fresh gaps analysis (P0/P1/P2) — sau refactor
Hãy rà soát lại với góc nhìn “MV3 service worker unreliable by default”:
- P0: bug/race nào vẫn có thể xảy ra? (init timing, message channel, alarms, state drift…)
- P1: pin/cpu/perf issues (alarms wake, webNavigation spam, content overhead, storage churn…)
- P2: maintainability traps (coupling, naming, unclear contracts, future feature creep…)

### 2) State design review (state_core + background_state)
Hãy review như security auditor + maintainer 10 năm:
- Invariants hiện tại có “quá tay” không? (ví dụ disable extension wipe flow/task, hoặc !isInFlow wipe reminder fields)
- Có cần tách “validity invariants” vs “policy decisions” không? Nếu có, đề xuất API và migration path ít rủi ro.
- `diffState`/`computeNextState` hiện tại đủ chặt chưa? Có edgecases kiểu array order/duplicates/normalization drift?
- Có nên thêm **internal subscribers** (in-process) thay vì background modules tự nghe `stateUpdated` qua runtime messaging?
  - Nếu đề xuất: chỉ ra interface tối giản và lợi ích thực tế (giảm coupling/overhead/bugs).

### 3) Messaging contract & validation (no bundler, content = classic)
Hiện tại:
- `actions.js` có `messageActions`, nhưng `content.js` phải dùng string literals.
Hãy đề xuất cách giảm mismatch mà **không bundler**:
- Option A: 1 file `actions_shared.js` dạng UMD/global? (rủi ro gì?)
- Option B: generate step? (không muốn build phức tạp)
- Option C: chấp nhận string, nhưng thêm validation layer ở background (whitelist/schema).

Mình muốn bạn đưa ra:
- 3 lựa chọn + tradeoffs + recommendation.
- Checklist validate payload per action (types, required fields, bounds).

### 4) Permissions & security posture (least-privilege)
Manifest hiện có: `storage`, `alarms`, `webNavigation`, `notifications`, `tabs`, host permissions `http/https`.
Hãy audit:
- `tabs` có thể giảm scope không? (activeTab/optional permissions/đổi kiến trúc)
- `webNavigation` vs alternative (declarativeNetRequest?) có đáng không trong constraint?
- Content overlay có risk UX/security nào (clickjacking cảm giác, CSS conflicts, PII exposure by accident)?

Deliverable: bảng “permission -> used for -> can reduce? -> cost/benefit”.

### 5) webNavigation correctness/perf
Hiện lắng nghe `onCompleted` + `onHistoryStateUpdated`, filter frameId=0, scheme http/https.
Hãy review:
- Có event nào phù hợp hơn? (onCommitted?) và tại sao.
- Có trường hợp warning bị miss hoặc bị double không?
- Debounce theo hostname+tabId 4s có đủ hợp lý không? Có scenario UX xấu?
- Memory leak: map debounce có cần cleanup theo tab lifecycle không?

### 6) Break Reminder correctness in MV3
Timer dùng `chrome.alarms`:
- Badge tick 1 phút: có vấn đề UX/accuracy không?
- Alarm end early/late: logic reschedule hiện tại ok chưa?
- Edgecases: Chrome restart giữa chừng, disable/enable extension, user spam start/stop nhanh.

### 7) “Clean & maintainable” roadmap (next 3 phases)
Hãy đề xuất plan 3 phases (lowest-risk first) sau refactor này:
- Phase 1: fix P0/P1 còn lại (minimal behavior change)
- Phase 2: least-privilege + security hardening
- Phase 3: architecture improvements (nếu thật sự đáng)

Mỗi phase yêu cầu:
- danh sách thay đổi cụ thể
- rủi ro/rollback plan
- manual test checklist

### 8) Bonus: 3 perspectives
Hãy phân tích ngắn gọn từ 3 góc nhìn:
1) Junior dev: phần nào sẽ gây hiểu nhầm nhất?
2) Security auditor: phần nào dễ bị abuse/PII risk nhất?
3) 10-years maintainer: điều gì sẽ hối hận nhất nếu không sửa ngay?

---

## Constraints (nhắc lại)
- No bundler / no heavy deps
- Keep repo flat, ES modules (trừ content script)
- Vietnamese user-facing strings
- Logging: 🌸 normal, 🌸🌸🌸 errors only
- No Gemini/LLM code/keys

---

## Code (self-contained excerpts — current)

### manifest.json (relevant)
```json
{
  "manifest_version": 3,
  "permissions": ["storage", "alarms", "webNavigation", "notifications", "tabs"],
  "host_permissions": ["http://*/*", "https://*/*"],
  "background": { "service_worker": "background.js", "type": "module" },
  "content_scripts": [
    { "matches": ["http://*/*", "https://*/*"], "js": ["content.js"], "run_at": "document_idle" }
  ]
}
```

### background.js (register listeners sync + hydrate)
```js
import { ensureInitialized, setupStateListeners } from './background_state.js';
import { initDistraction } from './background_distraction.js';
import { initBreakReminder } from './background_breakReminder.js';

function initBackgroundScript() {
  setupStateListeners();
  initDistraction();
  initBreakReminder();

  ensureInitialized().catch(() => {});
}
initBackgroundScript();
```

### state_core.js (pure schema + sanitize + invariants + diff)
```js
export const DEFAULT_STATE = Object.freeze({
  isEnabled: true,
  currentTask: '',
  isInFlow: false,
  blockDistractions: true,
  breakReminderEnabled: false,
  distractingSites: Object.freeze([...DEFAULT_DISTRACTING_SITES]),
  deepWorkBlockedSites: Object.freeze([...DEFAULT_DEEPWORK_BLOCKED_SITES]),
  reminderStartTime: null,
  reminderInterval: null,
  reminderExpectedEndTime: null
});

export function sanitizeStoredState(storedState) { /* normalize types + enforce invariants */ }
export function computeNextState(currentState, updates) { /* sanitize patch -> next state */ }
export function diffState(prevState, nextState) { /* value-based diff (arrays by value) */ }
```

### background_state.js (MV3-safe hydrate + queued update + delta broadcast)
```js
let state = getDefaultState();
let initPromise = null;
let hasInitialized = false;
let updateChain = Promise.resolve();

export function ensureInitialized() {
  if (hasInitialized) return Promise.resolve({ ...state });
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const stored = await chrome.storage.local.get(null);
    // remove deprecated keys...
    const nextState = sanitizeStoredState(stored);
    const deltaToStore = diffState(filteredStored, nextState);
    if (Object.keys(deltaToStore).length) await chrome.storage.local.set(deltaToStore);
    state = nextState;
    hasInitialized = true;
    return { ...state };
  })().catch(() => {
    state = sanitizeStoredState(null);
    hasInitialized = true;
    return { ...state };
  }).finally(() => { initPromise = null; });
  return initPromise;
}

export async function updateState(updates) {
  updateChain = updateChain.then(async () => {
    await ensureInitialized();
    const nextState = computeNextState(state, updates);
    const delta = diffState(state, nextState);
    if (!Object.keys(delta).length) return true;
    state = nextState;
    await chrome.storage.local.set(delta);
    chrome.runtime.sendMessage({ action: 'stateUpdated', delta, state: delta }).catch(() => {});
    return true;
  }).catch(() => false);
  return updateChain;
}
```

### state_helpers.js (UI safe fallback)
```js
export async function updateStateSafely(payload) {
  const res = await sendMessageSafely({ action: 'updateState', payload });
  if (res?.success) return true;

  const stored = await chrome.storage.local.get(null);
  const current = sanitizeStoredState(stored);
  const next = computeNextState(current, payload);
  const delta = diffState(current, next);
  if (!Object.keys(delta).length) return true;
  await chrome.storage.local.set(delta);
  return true;
}
```

### background_distraction.js (scheme filter + debounce)
```js
const WARNING_COOLDOWN_MS = 4000;
const lastWarningByTabId = new Map();

function shouldSendWarning(tabId, url) { /* tabId+hostname cooldown */ }

async function handleWebNavigation(details) {
  if (details.frameId !== 0) return;
  if (!details.url?.startsWith('http')) return;
  await ensureInitialized();
  // if distracting -> sendWarningToTab(tabId, url) (debounced)
}
```

### background_breakReminder.js (alarms + await queued updates)
```js
export function initBreakReminder() {
  setupAlarmListeners();
  ensureInitialized().then(() => initializeBreakReminderIfEnabled()).catch(() => initializeBreakReminderIfEnabled());
}

async function handleAlarm(alarm) {
  await ensureInitialized();
  if (alarm.name === END) await handleBreakReminderEnd();
}

async function startBreakReminder() {
  await updateState({ reminderStartTime, reminderInterval, reminderExpectedEndTime });
  scheduleAlarms(reminderExpectedEndTime);
}
```

### content.js (high-level notes)
- Classic script (no import), local `sendMessageSafely`
- Không theo dõi `input[type=password]`, không lưu text user gõ (chỉ metadata như length)
- Gating theo `isEnabled` + detach listeners khi disabled
- `checkCurrentUrl` on load + YouTube SPA observer gửi `youtubeNavigation`

