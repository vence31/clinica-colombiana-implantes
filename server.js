const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { exec } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const app = express();
const PORT = process.env.PORT || 3005;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// SQLite DB Initialization (Node.js 24 native built-in)
const db = new DatabaseSync(path.join(__dirname, 'implantes_leads.db'));
db.exec(`
  CREATE TABLE IF NOT EXISTS implantes_leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    name TEXT,
    phone TEXT,
    treatment TEXT,
    bone_condition TEXT DEFAULT 'Evaluación 3D requerida',
    dates TEXT,
    budget_cop INTEGER,
    status TEXT DEFAULT 'Quirúrgico'
  )
`);

// Seed initial test leads if table is empty
const count = db.prepare('SELECT COUNT(*) as count FROM implantes_leads').get().count;
if (count === 0) {
  db.prepare(`
    INSERT INTO implantes_leads (name, phone, treatment, bone_condition, dates, budget_cop, status)
    VALUES 
      ('Guillermo Henao', '+57 318 350 4919', 'Implante Titanio Individual', 'Buena densidad ósea', 'Martes 9:00 AM', 2500000, 'Evaluación Tomográfica'),
      ('Martha Lucía Gómez', '+57 300 812 4433', 'Rehabilitación All-on-4 Carga Inmediata', 'Requiere injerto óseo', 'Próxima semana', 14000000, 'Pre-Quirúrgico')
  `).run();
}

// Conversation Sessions
const sessions = {};

// AI Concierge Dr. Felipe
app.post('/api/chat', (req, res) => {
  const { sessionId = 'default-implantes', message = '' } = req.body;
  const lower = message.toLowerCase().trim();

  if (!sessions[sessionId]) {
    sessions[sessionId] = { step: 0, lead: { bone_condition: 'Por evaluar' } };
  }
  const session = sessions[sessionId];

  let reply = '';

  if (session.step === 0) {
    if (lower.includes('all-on-4') || lower.includes('all on 4') || lower.includes('todos') || lower.includes('completa') || lower.includes('arcada')) {
      session.lead.treatment = 'Rehabilitación Total All-on-4 / All-on-6';
      session.step = 1;
      reply = "¡Excelente! En la Clínica Colombiana de Implantes somos el centro quirúrgico de referencia en Medellín para rehabilitaciones All-on-4 y carga inmediata en 24 horas. ¿Actualmente cuentas con alguna tomografía previa o radiografía panorámica?";
    } else if (lower.includes('implante') || lower.includes('titanio') || lower.includes('diente') || lower.includes('pieza')) {
      session.lead.treatment = 'Implante Dental Titanio Guiado 3D';
      session.step = 1;
      reply = "Nuestros implantes de titanio oseointegrable de grado médico cuentan con garantía de por vida y colocación guiada por computador. ¿Has perdido la pieza recientemente o requieres también extracción dental?";
    } else if (lower.includes('hueso') || lower.includes('injerto') || lower.includes('seno') || lower.includes('regeneracion')) {
      session.lead.treatment = 'Regeneración Ósea Guiada & Injerto de Hueso';
      session.step = 1;
      reply = "Somos especialistas en casos complejos con poco hueso, aplicando biomateriales suizos y elevación de seno maxilar. ¿Cuándo te gustaría realizar tu tomografía computarizada en nuestra sede de Laureles/Estadio?";
    } else {
      reply = "¡Hola! Te habla el Dr. Felipe, coordinador quirúrgico de la Clínica Colombiana de Implantes Dentales (Laureles / Estadio). ¿Deseas consultar sobre Implantes de Titanio individuales, Prótesis Fijas All-on-4 de Carga Inmediata o Regeneración Ósea?";
    }
  } else if (session.step === 1) {
    session.lead.bone_condition = message;
    session.step = 2;
    reply = "Comprendo perfectamente. En nuestras instalaciones de la Diagonal 75E # 33A-160 contamos con tomógrafo Cone Beam 3D para evaluar la anatomía ósea en la misma cita. ¿Qué día y hora te convendría más para tu valoración quirúrgica?";
  } else if (session.step === 2) {
    session.lead.dates = message;
    session.step = 3;
    reply = "Perfecto. Por favor indícame tu nombre completo y número de teléfono o WhatsApp para apartar tu cita en el quirófano ambulatorio y enviarte la confirmación médica.";
  } else if (session.step === 3) {
    session.lead.name = message.split(/[,;\n]/)[0].trim();
    session.lead.phone = message;
    session.step = 4;

    try {
      db.prepare(`
        INSERT INTO implantes_leads (name, phone, treatment, bone_condition, dates, budget_cop, status)
        VALUES (?, ?, ?, ?, ?, ?, 'Quirúrgico')
      `).run(
        session.lead.name || 'Paciente Implantes',
        session.lead.phone || 'WhatsApp',
        session.lead.treatment || 'Consulta Implantología',
        session.lead.bone_condition || 'Valoración Tomográfica',
        session.lead.dates || 'Por confirmar',
        session.lead.treatment.includes('All-on-4') ? 14000000 : 2500000
      );
    } catch (e) {
      console.error('Error saving lead:', e);
    }

    reply = `¡Estimado(a) ${session.lead.name}! Su cita de valoración quirúrgica para ${session.lead.treatment} en la Clínica Colombiana de Implantes (Diagonal 75E # 33A-160, Sector Estadio) ha quedado agendada para ${session.lead.dates}. Nuestro equipo médico le contactará a su WhatsApp (+57 318 350 4919). ¡Recuperarás la firmeza de tu mordida!`;
  } else {
    reply = "Su cita de implantología está confirmada. Si tiene dudas sobre anestesia local computarizada o indicaciones previas a la tomografía, con gusto le aclaro.";
  }

  res.json({ reply, step: session.step, lead: session.lead });
});

// Admin Leads API
app.get('/api/admin/leads', (req, res) => {
  try {
    const leads = db.prepare('SELECT * FROM implantes_leads ORDER BY id DESC').all();
    const stats = db.prepare(`
      SELECT 
        COUNT(*) as totalLeads,
        COALESCE(SUM(budget_cop), 0) as totalValue
      FROM implantes_leads
    `).get();
    res.json({ stats, leads });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Drip Sequences API
app.get('/api/admin/drip-sequences', (req, res) => {
  try {
    const leads = db.prepare('SELECT * FROM implantes_leads ORDER BY id DESC LIMIT 10').all();
    const sequences = leads.map(l => ({
      leadId: l.id,
      patient: l.name || 'Paciente',
      treatment: l.treatment || 'Implante Dental',
      messages: [
        {
          step: '24h Confirmación Quirúrgica',
          msg: `Apreciado(a) ${l.name || ''}, Dr. Felipe de la Clínica Colombiana de Implantes. Le confirmamos su valoración para ${l.treatment}. Disponemos de tomografía 3D de cortesía para su diagnóstico.`
        },
        {
          step: '48h Protocolo Carga Inmediata',
          msg: `Hola ${l.name || ''}, recuerde que en nuestra clínica realizamos colocación de dientes provisionales en 24h gracias a nuestra técnica de carga inmediata. ¡Lo esperamos en Laureles/Estadio!`
        }
      ]
    }));
    res.json({ success: true, sequences });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// CSV Export API
app.get('/api/admin/export-csv', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM implantes_leads ORDER BY id DESC').all();
    let csv = 'ID,Date,Name,Phone,Treatment,BoneCondition,Dates,BudgetCOP,Status\n';
    rows.forEach(r => {
      csv += `"${r.id}","${r.created_at}","${(r.name||'').replace(/"/g, '""')}","${(r.phone||'').replace(/"/g, '""')}","${(r.treatment||'').replace(/"/g, '""')}","${(r.bone_condition||'').replace(/"/g, '""')}","${(r.dates||'').replace(/"/g, '""')}",${r.budget_cop},"${r.status}"\n`;
    });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="clinica_implantes_medellin_leads.csv"');
    res.send(csv);
  } catch (e) {
    res.status(500).send('Error generating CSV');
  }
});

// Neural TTS Endpoint
app.get('/api/tts', (req, res) => {
  const rawText = req.query.text || '';
  const cleanText = rawText.replace(/[\n\r]/g, ' ').replace(/[#*_`]/g, '').trim().substring(0, 500);
  const voice = 'es-CO-GonzaloNeural'; // Doctor Felipe Restrepo voice

  if (!cleanText) return res.status(400).json({ error: 'Text required' });

  const hash = crypto.createHash('md5').update(`${voice}_${cleanText}`).digest('hex');
  const tmpFile = path.join(os.tmpdir(), `tts_implantes_${hash}.mp3`);

  if (fs.existsSync(tmpFile)) {
    res.setHeader('Content-Type', 'audio/mpeg');
    return fs.createReadStream(tmpFile).pipe(res);
  }

  const cmd = `edge-tts --voice "${voice}" --text "${cleanText.replace(/"/g, '\\"')}" --write-media "${tmpFile}"`;
  exec(cmd, (err) => {
    if (err) return res.status(500).json({ error: 'TTS synthesis error', details: err.message });
    res.setHeader('Content-Type', 'audio/mpeg');
    fs.createReadStream(tmpFile).pipe(res);
  });
});

app.listen(PORT, () => {
  console.log(`Clínica Colombiana de Implantes running on http://localhost:${PORT}`);
});

