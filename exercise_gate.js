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
const heroTitleEl = document.getElementById('hero-title');
const heroSubtitleEl = document.getElementById('hero-subtitle');
const motivationEl = document.getElementById('motivation');

const FUNNY_TITLES = [
  { title: '🦵 Chân đang phản đối việc ngồi quá lâu!', subtitle: 'Đứng dậy đi, đừng để chân nó đình công!' },
  { title: '💀 Xương sống gửi lời kêu cứu khẩn cấp!', subtitle: 'Cột sống đang cong như dấu hỏi rồi!' },
  { title: '🐌 Não đang chạy chậm như ốc sên...', subtitle: 'Cần oxygen gấp! Vận động để não chạy turbo!' },
  { title: '🍑 Mông đang bẹp dí như bánh tráng!', subtitle: 'Cứu lấy vòng 3 trước khi quá muộn!' },
  { title: '🪑 Ghế đang xin được nghỉ ngơi!', subtitle: 'Bạn ngồi lâu quá, ghế cũng mệt rồi!' },
  { title: '🩸 Máu đang ùn tắc như đường giờ cao điểm!', subtitle: 'Vận động để máu lưu thông trở lại!' },
  { title: '🧟 Cơ thể đang biến thành zombie văn phòng!', subtitle: 'Tập thể dục để trở lại làm người!' },
  { title: '🦴 Các khớp đang kêu cót két như cửa ma!', subtitle: 'Bôi trơn bằng vận động ngay thôi!' },
  { title: '🧊 Chân đang đông cứng như que kem!', subtitle: 'Làm tan băng bằng vài cái squat nào!' },
  { title: '🐙 Tư thế ngồi đang giống bạch tuộc!', subtitle: 'Duỗi thẳng người ra, bạn là người mà!' },
];

const MOTIVATIONS = [
  '💡 Mỗi cái chống đẩy là một bước gần hơn tới body trong mơ... hoặc ít nhất là hết đau lưng!',
  '🏋️ Arnold Schwarzenegger cũng bắt đầu từ con số 0. Nhưng ông ấy không ngồi code 8 tiếng/ngày.',
  '🧠 Nghiên cứu cho thấy: tập thể dục giúp thông minh hơn. Bugs sẽ sợ bạn!',
  '🦸 Không cần cape để làm siêu anh hùng. Chỉ cần 10 cái squat!',
  '🎮 Coi như đây là mini-game. Hoàn thành để unlock màn tiếp theo!',
  '☕ Tập xong uống cà phê ngon hơn 69%. Khoa học chứng minh. Có thể.',
  '🐕 Chó đi dạo mỗi ngày và luôn vui vẻ. Trùng hợp? Tôi không nghĩ vậy!',
  '🌟 Cơ thể bạn là phương tiện duy nhất không thể đổi mới. Hãy bảo trì nó!',
];

const BUTTON_TEXTS = [
  '🔓 Xong rồi, thả tôi ra!',
  '🏃 Tập xong, chuồn thôi!',
  '💪 Đủ rồi, mở cửa đi!',
  '🎉 Xong! Trả lại tự do!',
  '🚀 Nạp năng lượng xong, bay thôi!',
];

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function initFunnyContent() {
  const content = pickRandom(FUNNY_TITLES);
  if (heroTitleEl) heroTitleEl.textContent = content.title;
  if (heroSubtitleEl) heroSubtitleEl.textContent = content.subtitle;
  if (motivationEl) motivationEl.textContent = pickRandom(MOTIVATIONS);
  if (submitEl) submitEl.textContent = pickRandom(BUTTON_TEXTS);
}

initFunnyContent();

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

const REP_COMMENTS = [
  { min: 5, messages: ['👍 Khởi động tốt!', '🌱 Bắt đầu rồi đấy!', '✨ Có tiến bộ!'] },
  { min: 10, messages: ['🔥 Máu lên rồi!', '💪 Ngon lành!', '🎯 Chính xác!'] },
  { min: 15, messages: ['🏆 Cơ bắp cảm ơn bạn!', '⚡ Năng lượng tràn đầy!', '🌟 Tuyệt vời!'] },
  { min: 20, messages: ['🦸 Quái vật!', '👑 Huyền thoại!', '🚀 Siêu nhân!'] },
];

function getRepComment(total) {
  for (let i = REP_COMMENTS.length - 1; i >= 0; i--) {
    if (total >= REP_COMMENTS[i].min) {
      return pickRandom(REP_COMMENTS[i].messages);
    }
  }
  return '';
}

function updateRepFeedback() {
  const total = parseCount(pushupsEl) + parseCount(situpsEl) + parseCount(squatsEl);
  const comment = getRepComment(total);
  if (motivationEl) {
    motivationEl.textContent = comment || pickRandom(MOTIVATIONS);
  }
}

function normalizeNumericInput(el) {
  if (!el) return;
  el.addEventListener('input', () => {
    const next = String(el.value || '').replace(/[^0-9]/g, '');
    el.value = next.length ? String(Number(next)) : '0';
    updateRepFeedback();
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
