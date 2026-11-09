const $ = selector => document.querySelector(selector);
const STORE_KEY = 'xenai-conversations-v1';
let conversations = loadConversations();
let activeId = conversations[0]?.id || null;
let selectedImage = null;
let busy = false;
let toastTimer;

function loadConversations() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || '[]'); } catch { return []; }
}
function save() { localStorage.setItem(STORE_KEY, JSON.stringify(conversations)); }
function current() { return conversations.find(item => item.id === activeId); }
function escapeHTML(value) { return String(value).replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[ch]); }
function notify(message) {
  const toast = $('#toast'); toast.textContent = message; toast.classList.add('visible');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('visible'), 3600);
}
function renderSidebar() {
  $('#conversationList').replaceChildren();
  conversations.forEach(chat => {
    const row = document.createElement('div'); row.className = `conversation-row${chat.id === activeId ? ' active' : ''}`;
    const select = document.createElement('button'); select.className = 'conversation-select'; select.textContent = chat.title; select.title = chat.title;
    select.addEventListener('click', () => { activeId = chat.id; render(); $('#sidebar').classList.remove('open'); });
    const remove = document.createElement('button'); remove.className = 'conversation-delete'; remove.textContent = '×'; remove.title = 'حذف المحادثة'; remove.setAttribute('aria-label', `حذف ${chat.title}`);
    remove.addEventListener('click', () => deleteConversation(chat.id));
    row.append(select, remove); $('#conversationList').append(row);
  });
}
function renderMessages() {
  const chat = current(); const messages = $('#messages'); messages.replaceChildren();
  $('#welcome').hidden = Boolean(chat?.messages.length);
  if (!chat) return;
  chat.messages.forEach(message => {
    const wrap = document.createElement('article'); wrap.className = `message ${message.role === 'assistant' ? 'assistant-message' : 'user-message'}`;
    const avatar = document.createElement('div'); avatar.className = `message-avatar ${message.role === 'assistant' ? 'x-avatar' : ''}`; avatar.textContent = message.role === 'assistant' ? 'X' : 'أنت';
    const body = document.createElement('div'); body.className = 'message-body';
    const label = document.createElement('div'); label.className = 'message-label'; label.textContent = message.role === 'assistant' ? 'XENAI' : 'أنت';
    const content = document.createElement('div'); content.className = 'message-content'; content.innerHTML = escapeHTML(message.content).replace(/\n/g, '<br>');
    body.append(label, content);
    if (message.image) { const image = document.createElement('img'); image.className = 'sent-image'; image.src = message.image; image.alt = 'الصورة المرسلة'; body.append(image); }
    if (message.role === 'assistant') {
      const speak = document.createElement('button'); speak.className = 'speak-button'; speak.textContent = '◖ صوت'; speak.addEventListener('click', () => speakText(message.content)); body.append(speak);
    }
    wrap.append(avatar, body); messages.append(wrap);
  });
  if (busy) {
    const typing = document.createElement('div'); typing.className = 'typing-indicator'; typing.innerHTML = '<span></span><span></span><span></span><small>XENAI يفكر...</small>'; messages.append(typing);
  }
  $('#chatArea').scrollTop = $('#chatArea').scrollHeight;
}
function render() { renderSidebar(); renderMessages(); }
function newChat() {
  activeId = null; selectedImage = null; $('#attachmentPreview').hidden = true; $('#messageInput').value = ''; render(); $('#messageInput').focus();
}
function deleteConversation(id) {
  conversations = conversations.filter(chat => chat.id !== id);
  if (activeId === id) activeId = conversations[0]?.id || null;
  save(); render();
}
function appendMessage(role, content, image = null) {
  if (!current()) { const chat = { id: crypto.randomUUID(), title: content.slice(0, 34) || 'صورة جديدة', messages: [] }; conversations.unshift(chat); activeId = chat.id; }
  const chat = current(); chat.messages.push({ role, content, ...(image ? { image } : {}) });
  if (chat.messages.length === 1 && content) chat.title = content.slice(0, 34);
  save(); render();
}
async function sendMessage(text) {
  if (busy || (!text.trim() && !selectedImage)) return;
  const image = selectedImage;
  appendMessage('user', text.trim(), image);
  $('#messageInput').value = ''; selectedImage = null; $('#attachmentPreview').hidden = true; $('#imageInput').value = '';
  busy = true; renderMessages();
  try {
    const payload = { messages: current().messages.map(({ role, content }) => ({ role, content })) };
    if (image) payload.image = image;
    const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'حدث خطأ أثناء الاتصال.');
    appendMessage('assistant', result.reply);
  } catch (error) {
    notify(error.message || 'تعذر الاتصال. تحقق من اتصالك وإعدادات المحرك.');
  } finally { busy = false; renderMessages(); }
}
function speakText(text) {
  if (!('speechSynthesis' in window)) return notify('ميزة القراءة الصوتية غير مدعومة في هذا المتصفح.');
  speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(text); utterance.lang = 'ar-SA'; utterance.rate = 1; speechSynthesis.speak(utterance);
}

$('#newChat').addEventListener('click', newChat);
$('#chatForm').addEventListener('submit', event => { event.preventDefault(); sendMessage($('#messageInput').value); });
$('#messageInput').addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); $('#chatForm').requestSubmit(); } });
$('#messageInput').addEventListener('input', event => { event.target.style.height = 'auto'; event.target.style.height = `${Math.min(event.target.scrollHeight, 150)}px`; });
$('#clearChats').addEventListener('click', () => { if (!conversations.length) return; if (confirm('هل تريد حذف جميع المحادثات؟')) { conversations = []; activeId = null; save(); render(); } });
$('#imageButton').addEventListener('click', () => $('#imageInput').click());
$('#imageInput').addEventListener('change', event => {
  const file = event.target.files?.[0]; if (!file) return;
  if (file.size > 7 * 1024 * 1024) { notify('حجم الصورة أكبر من 7 ميغابايت.'); event.target.value = ''; return; }
  const reader = new FileReader(); reader.onload = () => { selectedImage = reader.result; $('#previewImage').src = selectedImage; $('#fileName').textContent = file.name; $('#attachmentPreview').hidden = false; }; reader.readAsDataURL(file);
});
$('#removeImage').addEventListener('click', () => { selectedImage = null; $('#imageInput').value = ''; $('#attachmentPreview').hidden = true; });
$('#stickerButton').addEventListener('click', () => { $('#stickerPopover').hidden = !$('#stickerPopover').hidden; });
$('#stickerPopover').addEventListener('click', event => { if (event.target.tagName !== 'BUTTON') return; $('#messageInput').value += event.target.textContent; $('#messageInput').focus(); $('#stickerPopover').hidden = true; });
$('#micButton').addEventListener('click', () => {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) return notify('الإملاء الصوتي غير مدعوم. جرّب Chrome أو Edge.');
  const recognition = new Recognition(); recognition.lang = 'ar-SA'; recognition.interimResults = false;
  recognition.onresult = event => { $('#messageInput').value += event.results[0][0].transcript; $('#messageInput').dispatchEvent(new Event('input')); };
  recognition.onerror = () => notify('لم يتم التقاط الصوت. تحقق من إذن الميكروفون.'); recognition.start();
});
$('#themeButton').addEventListener('click', () => { document.body.classList.toggle('light-theme'); localStorage.setItem('xenai-theme', document.body.classList.contains('light-theme') ? 'light' : 'dark'); });
$('#menuButton').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
document.querySelectorAll('.suggestion').forEach(button => button.addEventListener('click', () => sendMessage(button.dataset.prompt)));
if (localStorage.getItem('xenai-theme') === 'light') document.body.classList.add('light-theme');
render();
fetch('/api/health').then(response => response.json()).then(data => { $('#engineStatus').textContent = data.ready ? 'المحرك متصل وجاهز' : 'المحرك يحتاج إعداد المفتاح'; document.querySelector('.status-dot').classList.toggle('ready', data.ready); }).catch(() => { $('#engineStatus').textContent = 'المحرك غير متاح'; });
