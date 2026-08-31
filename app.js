let currentSessionId = 'implantes-user-' + Date.now();
let recognition = null;
let isRecording = false;

document.addEventListener('DOMContentLoaded', () => {
  runCalculator();
  loadAdminStats();

  const input = document.getElementById('user-input');
  if (input) {
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') submitMessage();
    });
  }
});

// Treatment Pricing in COP
const PRICES = {
  implante_simple: { cop: 2500000, fixed: false },
  all_on_4: { cop: 14000000, fixed: true },
  injerto_oseo: { cop: 900000, fixed: false },
  seno_maxilar: { cop: 1400000, fixed: false },
  corona_zirconio: { cop: 1200000, fixed: false }
};

function runCalculator() {
  const treatment = document.getElementById('calc-treatment').value;
  const qty = parseInt(document.getElementById('calc-qty').value) || 1;
  const price = PRICES[treatment] || PRICES.implante_simple;

  const totalCop = price.fixed ? price.cop : price.cop * qty;
  const monthlyCop = Math.round(totalCop / 12);

  document.getElementById('res-total-cop').textContent = `$${totalCop.toLocaleString('es-CO')} COP`;
  document.getElementById('res-monthly-cop').textContent = `$${monthlyCop.toLocaleString('es-CO')} COP/mes`;
}

function sendQuickMessage(txt) {
  document.getElementById('user-input').value = txt;
  submitMessage();
}

async function submitMessage() {
  const input = document.getElementById('user-input');
  const msg = input.value.trim();
  if (!msg) return;

  appendMessage('outgoing', msg);
  input.value = '';

  const typing = document.getElementById('typing-notice');
  typing.style.display = 'block';

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: currentSessionId, message: msg })
    });
    const data = await res.json();
    typing.style.display = 'none';

    if (data.reply) {
      appendMessage('incoming', data.reply);
      playNeuralVoice(data.reply);
      loadAdminStats();
    }
  } catch (err) {
    typing.style.display = 'none';
    appendMessage('incoming', 'Estimado paciente, por favor comuníquese directamente a nuestro PBX Quirúrgico: (604) 444 8212.');
  }
}

function appendMessage(type, text) {
  const stream = document.getElementById('chat-stream');
  const div = document.createElement('div');
  div.className = `msg ${type}`;

  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  div.innerHTML = `
    <div class="bubble">
      <p>${text.replace(/\n/g, '<br>')}</p>
      <span class="msg-time">${time}</span>
    </div>
  `;
  stream.appendChild(div);
  stream.scrollTop = stream.scrollHeight;
}

// Neural TTS Player
let currentAudio = null;
function playNeuralVoice(text) {
  const voiceIndicator = document.getElementById('voice-indicator');
  if (voiceIndicator) voiceIndicator.style.display = 'flex';

  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }

  const encoded = encodeURIComponent(text);
  currentAudio = new Audio(`/api/tts?text=${encoded}`);
  currentAudio.play().catch(e => console.log('Audio autoplay prevented:', e));

  currentAudio.onended = () => {
    if (voiceIndicator) voiceIndicator.style.display = 'none';
  };
}

// Speech Recognition
function toggleVoiceInput() {
  const micBtn = document.getElementById('voice-mic-btn');
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    alert('Tu navegador no soporta reconocimiento de voz. Escribe tu mensaje en la barra de consulta.');
    return;
  }

  if (!recognition) {
    recognition = new SpeechRecognition();
    recognition.lang = 'es-CO';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      document.getElementById('user-input').value = transcript;
      submitMessage();
    };

    recognition.onend = () => {
      isRecording = false;
      if (micBtn) micBtn.classList.remove('mic-active');
    };
  }

  if (!isRecording) {
    recognition.start();
    isRecording = true;
    if (micBtn) micBtn.classList.add('mic-active');
  } else {
    recognition.stop();
    isRecording = false;
    if (micBtn) micBtn.classList.remove('mic-active');
  }
}

// Admin Modal
function openAdminModal() {
  document.getElementById('admin-modal').style.display = 'flex';
  loadAdminStats();
}

function closeAdminModal() {
  document.getElementById('admin-modal').style.display = 'none';
}

async function loadAdminStats() {
  try {
    const res = await fetch('/api/admin/leads');
    const data = await res.json();

    const badge = document.getElementById('lead-count-badge');
    const countEl = document.getElementById('stat-leads-count');
    const valEl = document.getElementById('stat-leads-val');
    const tbody = document.getElementById('leads-tbody');

    if (badge) badge.textContent = data.stats.totalLeads;
    if (countEl) countEl.textContent = data.stats.totalLeads;
    if (valEl) valEl.textContent = `$${data.stats.totalValue.toLocaleString('es-CO')} COP`;

    if (tbody) {
      if (data.leads.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;">No hay solicitudes quirúrgicas pendientes.</td></tr>';
      } else {
        tbody.innerHTML = data.leads.map(l => `
          <tr>
            <td>${l.id}</td>
            <td>${l.created_at.substring(0, 16)}</td>
            <td><strong>${l.name}</strong></td>
            <td>${l.phone}</td>
            <td>${l.treatment}</td>
            <td><span style="font-weight:700;color:#059669;">${l.bone_condition}</span></td>
            <td>${l.dates}</td>
            <td><strong>$${(l.budget_cop || 0).toLocaleString('es-CO')} COP</strong></td>
            <td><span style="color:#fff;font-weight:800;background:#33317c;padding:2px 8px;border-radius:4px;">${l.status}</span></td>
          </tr>
        `).join('');
      }
    }
  } catch (e) {
    console.error('Error loading admin stats:', e);
  }
}

function resetChat() {
  currentSessionId = 'implantes-user-' + Date.now();
  const stream = document.getElementById('chat-stream');
  stream.innerHTML = `
    <div class="date-badge">Hoy</div>
    <div class="msg incoming">
      <div class="bubble">
        <p>¡Hola! Bienvenido a la <strong>Clínica Colombiana de Implantes Dentales</strong> 🦷⚡</p>
        <p>Le habla el <strong>Dr. Felipe Restrepo</strong>. ¿Qué tipo de tratamiento requiere o le gustaría agendar una tomografía 3D?</p>
        <span class="msg-time">09:00</span>
      </div>
    </div>
  `;
}

