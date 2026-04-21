/* ═══════════════════════════════════════════════════════
   EMS — Knowledge Chat Drawer Controller
   Right-side slide-in drawer for conversational Q&A
   over selected EMS documents.
   ═══════════════════════════════════════════════════════ */
window.EMS_KnowledgeChat = (() => {

  const PROXY = '/unifiedwp/api/doceval-proxy';

  let _sessionId   = null;
  let _chatHistory = [];
  let _bound       = false;

  /* ─── helpers ────────────────────────────────────────── */
  function _drawer()   { return document.getElementById('knowledgeChatWrap'); }
  function _backdrop() { return document.getElementById('kcBackdrop'); }

  function _drawerOpen() {
    _drawer()?.classList.add('kc-open');
    _backdrop()?.classList.add('kc-open');
    document.body.style.overflow = 'hidden';
  }

  function _drawerClose() {
    _drawer()?.classList.remove('kc-open');
    _backdrop()?.classList.remove('kc-open');
    document.body.style.overflow = '';
  }

  /* ─── Public: openLoading ───────────────────────────── */
  // Called by documents.js immediately when the action is triggered.
  // Shows the drawer in loading state while files are being fetched/ingested.
  function openLoading(docNames) {
    _sessionId   = null;
    _chatHistory = [];

    // Reset to loading state
    document.getElementById('knowledgeChatLoading')?.classList.remove('d-none');
    document.getElementById('kcChatBody')?.classList.add('d-none');
    document.getElementById('knowledgeChatTitle').textContent = 'Ask Documents';

    const sub = document.getElementById('kcDocSubtitle');
    if (sub) sub.textContent = docNames.length === 1
      ? docNames[0]
      : `${docNames.length} documents selected`;

    document.getElementById('kcDocChips').innerHTML = '';
    document.getElementById('kcMessages').innerHTML = '';

    _drawerOpen();
    if (!_bound) { _bindEvents(); _bound = true; }
  }

  /* ─── Public: open ──────────────────────────────────── */
  // Called by documents.js after a successful ingest.
  function open(sessionId, docNames) {
    _sessionId   = sessionId;
    _chatHistory = [];

    // Switch from loading → chat
    document.getElementById('knowledgeChatLoading')?.classList.add('d-none');
    document.getElementById('kcChatBody')?.classList.remove('d-none');

    const title = document.getElementById('knowledgeChatTitle');
    if (title) title.textContent = 'Ask Documents';

    const sub = document.getElementById('kcDocSubtitle');
    if (sub) sub.textContent = docNames.length === 1
      ? docNames[0]
      : `${docNames.length} documents`;

    // Doc chips
    const chips = document.getElementById('kcDocChips');
    if (chips) chips.innerHTML = docNames.map(n =>
      `<span class="kc-doc-chip"><i class="bi bi-file-earmark-text"></i>${_esc(n)}</span>`
    ).join('');

    // Greeting message
    _appendMsg('assistant',
      `I've indexed ${docNames.length} document${docNames.length !== 1 ? 's' : ''}. Ask me anything about their contents.`
    );

    setTimeout(() => document.getElementById('kcInput')?.focus(), 150);
  }

  /* ─── Public: close ─────────────────────────────────── */
  function close() {
    _drawerClose();
    _sessionId   = null;
    _chatHistory = [];
  }

  /* ─── Private: send message ─────────────────────────── */
  async function _sendMessage() {
    const input = document.getElementById('kcInput');
    const btn   = document.getElementById('kcSendBtn');
    const text  = input?.value.trim();
    if (!text || !_sessionId) return;

    input.value  = '';
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm" style="width:13px;height:13px;"></span>';

    _appendMsg('user', text);
    const snapshot = [..._chatHistory];
    _chatHistory.push({ role: 'user', content: text });
    _showTyping();

    try {
      const resp = await fetch(PROXY + '/api/general/query', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: _sessionId, question: text, chat_history: snapshot })
      });
      if (!resp.ok) throw new Error(resp.statusText);
      const data = await resp.json();
      _removeTyping();
      _appendMsg('assistant', data.answer || 'No answer returned.', data.sources);
      _chatHistory.push({ role: 'assistant', content: data.answer || '' });
    } catch (err) {
      _removeTyping();
      _appendMsg('assistant', 'Something went wrong. Please try again.');
      _chatHistory.pop();
    } finally {
      btn.disabled  = false;
      btn.innerHTML = '<i class="bi bi-send"></i>';
      input?.focus();
    }
  }

  /* ─── Private: rendering ─────────────────────────────── */
  function _appendMsg(role, text, sources) {
    const container = document.getElementById('kcMessages');
    if (!container) return;
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const sourcesHtml = (role === 'assistant' && sources?.length)
      ? `<div class="chat-sources">${sources.map(s =>
          `<span class="source-chip"><i class="bi bi-file-earmark-text me-1"></i>${_esc(s)}</span>`
        ).join('')}</div>` : '';
    const div = document.createElement('div');
    div.className = `chat-msg ${role}`;
    div.innerHTML = `<div class="chat-bubble">${_esc(text)}</div>${sourcesHtml}<div class="chat-time">${time}</div>`;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  function _showTyping() {
    const container = document.getElementById('kcMessages');
    if (!container) return;
    const div = document.createElement('div');
    div.className = 'chat-msg assistant';
    div.id = 'kcTyping';
    div.innerHTML = '<div class="chat-bubble chat-typing"><span></span><span></span><span></span></div>';
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  function _removeTyping() { document.getElementById('kcTyping')?.remove(); }

  /* ─── Private: events (bound once) ──────────────────── */
  function _bindEvents() {
    document.getElementById('btnBackFromChat')?.addEventListener('click', close);
    document.getElementById('kcBackdrop')?.addEventListener('click', close);
    document.getElementById('kcSendBtn')?.addEventListener('click', _sendMessage);
    document.getElementById('kcInput')?.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); _sendMessage(); }
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && _drawer()?.classList.contains('kc-open')) close();
    });
  }

  function _esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  return { openLoading, open, close };
})();
