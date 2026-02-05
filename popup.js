/**
 * MaiZone Browser Extension
 * Popup Script - Xử lý các tính năng chính của giao diện người dùng
 * @feature f03 - Break Reminder (UI part)
 * @feature f04 - Deep Work Mode (UI part)
 * @feature f06 - ClipMD (Clipboard to Markdown)
 * @feature f08 - Mindfulness Reminders (UI part)
 * @feature f13 - Intent Gate for Distracting Sites (always on)
 */

import { sendMessageSafely } from './messaging.js';
import { getStateSafely, updateStateSafely } from './state_helpers.js';
import { messageActions } from './actions.js';
import { CLIPMD_POPUP_PORT_NAME } from './constants.js';

/******************************************************************************
 * ELEMENT REFERENCES AND VARIABLES
 ******************************************************************************/

// Reference đến các DOM elements chính
const breakReminderToggle = document.getElementById('break-reminder-toggle');      // Toggle nhắc nhở nghỉ ngơi
const mindfulnessReminderToggle = document.getElementById('mindfulness-reminder-toggle'); // Toggle nhắc nhở mindfulness
const exerciseReminderToggle = document.getElementById('exercise-reminder-toggle'); // Toggle nhắc tập thể dục
const helpButton = document.getElementById('help-button');                               // Nút mở hướng dẫn nhanh
const settingsButton = document.getElementById('settings-button');                 // Nút mở trang cài đặt
const statusText = document.getElementById('status-text');                         // Hiển thị trạng thái hiện tại
const breakReminderCountdown = document.getElementById('break-reminder-countdown'); // Hiển thị thời gian còn lại
const exerciseReminderCountdown = document.getElementById('exercise-reminder-countdown'); // Hiển thị thời gian còn lại (tập thể dục)
const taskInput = document.getElementById('task-input');  // Input field để nhập task cần tập trung

// Biến toàn cục quản lý trạng thái
let countdownInterval = null; // Interval cho đồng hồ đếm ngược
let exerciseCountdownInterval = null; // Interval cho đồng hồ đếm ngược (tập thể dục)
let clipmdPopupPort = null;

/******************************************************************************
 * INITIALIZATION
 ******************************************************************************/

document.addEventListener('DOMContentLoaded', initializePopup);

/**
 * Khởi tạo popup và đăng ký các event listeners
 */
function initializePopup() {
  console.log('🌸 Mai popup initialized');
  loadState();  // Load các cài đặt từ background state
  setupClipmdPopupLifecyclePort(); // [f06] Detect popup close (cancel inspect if idle)
  startClipmdOnPopupOpen(); // [f06] Auto-start ClipMD on current tab

  // Đăng ký các event listeners
  console.log('🌸 Registering event listeners...');
  breakReminderToggle.addEventListener('change', () => handleToggle('breakReminderEnabled'));
  mindfulnessReminderToggle.addEventListener('change', () => handleToggle('mindfulnessReminderEnabled'));
  exerciseReminderToggle.addEventListener('change', () => handleToggle('exerciseReminderEnabled'));
  helpButton?.addEventListener('click', openOnboarding);
  settingsButton.addEventListener('click', openSettings);
  
  // Event listener cho task input - Deep Work Flow với phím Enter
  taskInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      setCurrentTask();
    }
  });

  // Khởi động đồng hồ đếm ngược
  startCountdownTimer();
  startExerciseCountdownTimer();
  
  // Listen for state updates from background script
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.action === messageActions.stateUpdated) {
      handleStateUpdate(message.delta || message.state);
    }
  });
  
  // Get current tab for status display
  updateCurrentStatus();
}

/******************************************************************************
 * CLIPMD QUICK START [f06]
 ******************************************************************************/

/**
 * Open a long-lived Port so background can detect popup close reliably.
 * @feature f06 - ClipMD (Clipboard to Markdown)
 * @returns {void}
 */
function setupClipmdPopupLifecyclePort() {
  try {
    clipmdPopupPort = chrome.runtime.connect({ name: CLIPMD_POPUP_PORT_NAME });
  } catch {
    clipmdPopupPort = null;
    return;
  }

  try {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs?.[0]?.id;
      if (typeof tabId !== 'number') return;
      try {
        clipmdPopupPort?.postMessage?.({ tabId });
      } catch {
        // ignore
      }
    });
  } catch {
    // ignore
  }
}

/**
 * Start ClipMD pick mode as soon as the popup opens (best-effort).
 * @feature f06 - ClipMD (Clipboard to Markdown)
 * @returns {void}
 */
function startClipmdOnPopupOpen() {
  // Fire-and-forget: popup may close quickly; ClipMD lives in the tab.
  (async () => {
    try {
      const activeTab = await new Promise((resolve) => {
        try {
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => resolve(tabs?.[0] || null));
        } catch {
          resolve(null);
        }
      });

      const url = typeof activeTab?.url === 'string' ? activeTab.url : '';
      if (!url.startsWith('http://') && !url.startsWith('https://')) return;

      const reply = await sendMessageSafely(
        { action: messageActions.clipmdStart, data: { mode: 'markdown', source: 'popupOpen' } },
        { timeoutMs: 2500 }
      );

      if (reply?.success) return;

      console.warn('🌸🌸🌸 ClipMD quick start failed');
      if (!statusText) return;
      statusText.textContent = 'Mai chưa bật được ClipMD trên tab này. Hãy mở trang http/https rồi thử lại nhé.';
      setTimeout(() => updateCurrentStatus(), 2500);
    } catch (error) {
      console.warn('🌸🌸🌸 ClipMD quick start error:', error);
    }
  })();
}

/******************************************************************************
 * STATE MANAGEMENT
 ******************************************************************************/

/**
 * Get the label element containing the countdown (avoid :has() for compatibility)
 */
function getBreakReminderLabel() {
  if (!breakReminderCountdown) return null;
  const label = breakReminderCountdown.parentElement;
  if (!label || !label.classList?.contains('switch-label')) return null;
  return label;
}

/**
 * Update the break reminder label text while preserving the countdown element
 */
function setBreakReminderLabelText(text) {
  const label = getBreakReminderLabel();
  if (!label || !breakReminderCountdown) return;
  label.textContent = `${text} `;
  label.appendChild(breakReminderCountdown);
}

/**
 * Load state from background script
 */
function loadState() {
  const defaults = {
    breakReminderEnabled: false,
    mindfulnessReminderEnabled: false,
    exerciseReminderEnabled: true,
    isInFlow: false,
    currentTask: ''
  };

  getStateSafely()
    .then((state) => updateUI({ ...defaults, ...(state || {}) }))
    .catch((error) => {
      console.error('🌸🌸🌸 Error loading state:', error);
      updateUI(defaults);
    });
}

/**
 * Update UI based on state
 */
function updateUI(state) {
  // Update toggles
  breakReminderToggle.checked = state.breakReminderEnabled;
  mindfulnessReminderToggle.checked = state.mindfulnessReminderEnabled;
  if (exerciseReminderToggle) exerciseReminderToggle.checked = !!state.exerciseReminderEnabled;
  
  // Update task input
  taskInput.value = state.currentTask || '';
  taskInput.disabled = state.isInFlow;
  
  // Update task label
  setBreakReminderLabelText(state.isInFlow ? 'Đang Deep Work...' : 'Khung Deep Work');
}

/**
 * Update UI when state changes
 */
function handleStateUpdate(updates) {
  // Only update relevant UI elements for the changes
  if ('breakReminderEnabled' in updates) {
    breakReminderToggle.checked = updates.breakReminderEnabled;
  }

  if ('mindfulnessReminderEnabled' in updates) {
    mindfulnessReminderToggle.checked = updates.mindfulnessReminderEnabled;
  }

  if ('exerciseReminderEnabled' in updates && exerciseReminderToggle) {
    exerciseReminderToggle.checked = !!updates.exerciseReminderEnabled;
  }
  
  if ('isInFlow' in updates) {
    taskInput.disabled = updates.isInFlow;
    
    // Update task label
    setBreakReminderLabelText(updates.isInFlow ? 'Đang Deep Work...' : 'Khung Deep Work');
  }
  
  if ('currentTask' in updates) {
    taskInput.value = updates.currentTask || '';
  }
}

/******************************************************************************
 * EVENT HANDLERS
 ******************************************************************************/

/**
 * Handle toggle changes
 * @feature f03 - Break Reminder
 * @feature f04 - Deep Work Mode
 * @feature f05 - State Management
 * @feature f13 - Intent Gate for Distracting Sites
 */
function handleToggle(settingKey) {
  const toggleMap = {
    'breakReminderEnabled': breakReminderToggle,
    'mindfulnessReminderEnabled': mindfulnessReminderToggle,
    'exerciseReminderEnabled': exerciseReminderToggle
  };
  
  const toggle = toggleMap[settingKey];
  if (!toggle) return;

  const value = toggle.checked;
  
  // Special handling for break reminder toggle
  if (settingKey === 'breakReminderEnabled') {
    if (!value) {
      // When disabling break reminder, also exit deep work
      updateStateSafely({
        breakReminderEnabled: false,
        isInFlow: false,
        currentTask: ''
      });

      // Reset UI
      taskInput.value = '';
      taskInput.disabled = false;

      // Reset label
      setBreakReminderLabelText('Khung Deep Work');

      // Clear badge
      chrome.action.setBadgeText({ text: '' });

      return;
    }

    // Enabling Deep Work requires a task
    const task = taskInput?.value?.trim?.() || '';
    if (!task) {
      alert('Hãy nhập công việc cần tập trung trước khi bật Deep Work.');
      breakReminderToggle.checked = false;
      setBreakReminderLabelText('Khung Deep Work');
      return;
    }

    setCurrentTask();
    return;
  }

  // Update state in background (with fallback)
  updateStateSafely({ [settingKey]: value });
}

/******************************************************************************
 * SETTINGS
 ******************************************************************************/

/**
 * Open options page
 */
function openSettings() {
  chrome.runtime.openOptionsPage();
}

/******************************************************************************
 * ONBOARDING [f09]
 ******************************************************************************/

/**
 * Open onboarding quick start page.
 * @feature f09 - Onboarding
 * @returns {void}
 */
function openOnboarding() {
  try {
    const url = chrome.runtime.getURL('onboarding.html');
    chrome.tabs.create({ url });
  } catch {
    // ignore
  }
}

/******************************************************************************
 * DEEP WORK
 ******************************************************************************/

/**
 * Set current task and enter deep work mode
 * @feature f04 - Deep Work Mode
 */
function setCurrentTask() {
  const task = taskInput.value.trim();
  if (!task) {
    alert('Vui lòng nhập công việc cần tập trung');
    breakReminderToggle.checked = false;
    return;
  }
  
  // Optimistic UI update for responsiveness
  taskInput.disabled = true;
  breakReminderToggle.checked = true;
  setBreakReminderLabelText('Đang Deep Work...');

  // Reset break reminder timer (authoritative start)
  sendMessageSafely({
    action: messageActions.resetBreakReminder,
    data: { task }
  }).then((response) => {
    if (!response?.success) {
      console.warn('🌸🌸🌸 resetBreakReminder failed, falling back to updateState');
      updateStateSafely({
        currentTask: task,
        isInFlow: true,
        breakReminderEnabled: true
      });
    }
  });
  
  // Update status message temporarily
  statusText.textContent = `Mai sẽ giúp bạn tập trung vào: ${task}`;
  setTimeout(updateCurrentStatus, 3000);
}

/******************************************************************************
 * COUNTDOWN TIMER
 ******************************************************************************/

/**
 * Start countdown timer for break reminder
 */
function startCountdownTimer() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
  }
  
  updateCountdownTimer();
  countdownInterval = setInterval(updateCountdownTimer, 1000);
}

/**
 * Update countdown timer display
 */
function updateCountdownTimer() {
  if (!breakReminderCountdown) {
    console.warn('🌸🌸🌸 Countdown element not found');
    return;
  }

  sendMessageSafely({ action: messageActions.getBreakReminderState })
    .then((state) => {
      if (!state || !state.enabled || !state.startTime) {
        breakReminderCountdown.textContent = '(40:00)';
        try {
          chrome.action.setBadgeText({ text: '' });
        } catch {
          // ignore
        }
        return;
      }

      const now = Date.now();
      const elapsed = now - state.startTime;
      const remaining = state.interval - elapsed;

      if (remaining <= 0) {
        breakReminderCountdown.textContent = '(00:00)';
        try {
          chrome.action.setBadgeText({ text: '00:00' });
        } catch {
          // ignore
        }
        return;
      }

      const minutes = Math.floor(remaining / 60000).toString().padStart(2, '0');
      const seconds = Math.floor((remaining % 60000) / 1000).toString().padStart(2, '0');

      const text = `${minutes}:${seconds}`;
      breakReminderCountdown.textContent = `(${text})`;

      // Keep badge in sync while popup is open (helps browsers that throttle alarms).
      try {
        chrome.action.setBadgeText({ text });
      } catch {
        // ignore
      }
    })
    .catch(error => {
      console.error('🌸🌸🌸 Error updating countdown:', error);
      breakReminderCountdown.textContent = '(40:00)';
    });
}

/**
 * Start countdown timer for exercise reminder
 */
function startExerciseCountdownTimer() {
  if (exerciseCountdownInterval) {
    clearInterval(exerciseCountdownInterval);
  }

  updateExerciseCountdownTimer();
  exerciseCountdownInterval = setInterval(updateExerciseCountdownTimer, 1000);
}

/**
 * Update countdown timer display for exercise reminder
 */
function updateExerciseCountdownTimer() {
  if (!exerciseReminderCountdown) return;

  sendMessageSafely({ action: messageActions.exerciseGetState })
    .then((state) => {
      if (!state || !state.enabled) {
        exerciseReminderCountdown.textContent = '(--:--)';
        return;
      }

      if (state.paused) {
        // Deep work pause; show remaining if known.
        if (typeof state.remainingMs === 'number' && Number.isFinite(state.remainingMs)) {
          const safe = Math.max(0, state.remainingMs);
          const minutes = Math.floor(safe / 60000).toString().padStart(2, '0');
          const seconds = Math.floor((safe % 60000) / 1000).toString().padStart(2, '0');
          exerciseReminderCountdown.textContent = `(${minutes}:${seconds})`;
        } else {
          exerciseReminderCountdown.textContent = '(--:--)';
        }
        return;
      }

      if (typeof state.remainingMs !== 'number' || !Number.isFinite(state.remainingMs)) {
        exerciseReminderCountdown.textContent = '(--:--)';
        return;
      }

      const remaining = Math.max(0, state.remainingMs);
      const minutes = Math.floor(remaining / 60000).toString().padStart(2, '0');
      const seconds = Math.floor((remaining % 60000) / 1000).toString().padStart(2, '0');
      exerciseReminderCountdown.textContent = `(${minutes}:${seconds})`;
    })
    .catch(() => {
      exerciseReminderCountdown.textContent = '(--:--)';
    });
}

/******************************************************************************
 * UI STATUS UPDATE
 ******************************************************************************/

/**
 * Update status message based on current tab
 */
function updateCurrentStatus() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs?.length) return;

    const currentTab = tabs[0];

    if (currentTab.url) {
      try {
        const url = new URL(currentTab.url);
        const hostname = url.hostname.replace(/^www\./, '');

        // Site-specific messages
        const messages = {
          'youtube.com': 'Mai đang quan sát YouTube... Nhớ đừng xem quá lâu nhé!',
          'facebook.com': 'Mai đang theo dõi Facebook... Đừng scroll quá nhiều nhé!',
          'gmail.com': 'Mai đang hỗ trợ bạn đọc email... Trả lời ngắn gọn thôi nhé!',
          'netflix.com': 'Mai nhắc bạn đừng xem phim quá khuya nhé!',
          'github.com': 'Mai đang theo dõi bạn code trên GitHub... hấn hảo!',
          'google.com': 'Mai đang quan sát bạn tìm kiếm... Tìm được gì hay chưa?'
        };

        statusText.textContent = messages[hostname] || `Mai đang quan sát ${hostname}...`;
      } catch (err) {
        statusText.textContent = 'Mai đang quan sát âm thầm...';
      }
    } else {
      statusText.textContent = 'Mai đang quan sát âm thầm...';
    }
  });
}
