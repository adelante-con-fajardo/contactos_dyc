/* ═══════════════════════════════════════════
   RED FAJARDO — app.js
   Supabase + bcryptjs para hashing de PINs
   ═══════════════════════════════════════════ */

// ─── SUPABASE CONFIG ────────────────────────────────────────────────────
// ✏️  REEMPLAZA estos dos valores con los de tu proyecto en supabase.com
//     Project Settings → API → Project URL  y  anon public key
const SUPABASE_URL = 'https://ppvifhshcxthxgoiygtk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBwdmlmaHNoY3h0aHhnb2l5Z3RrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MjcxNTksImV4cCI6MjA5MTEwMzE1OX0.WEhkYpTOvl2CXl_K8ydc4Z5YbFQHPH2c0T6ik1MOcBU';

// ─── BCRYPT CONFIG ──────────────────────────────────────────────────────
// Cost factor: 10 es el estándar recomendado (más alto = más seguro pero más lento)
const BCRYPT_ROUNDS = 10;

// El CDN bcryptjs lo expone como dcodeIO.bcrypt
const bcrypt = dcodeIO.bcrypt;

let supabaseClient = null;
let currentUser    = null;  // { id, phone, name }
let editingId      = null;  // ID del contacto en edición
let allContacts    = [];    // cache local

// ─── BCRYPT HELPERS ──────────────────────────────────────────────────────
// El PIN que se hashea es: PIN + "1234"  (ej: "5678" → hashea "56781234")
function buildRawPin(pin) {
  return pin + '1234';
}

async function hashPin(pin) {
  const raw  = buildRawPin(pin);
  const salt = bcrypt.genSaltSync(BCRYPT_ROUNDS);
  return bcrypt.hashSync(raw, salt);
}

async function verifyPin(pin, storedHash) {
  const raw = buildRawPin(pin);
  return bcrypt.compareSync(raw, storedHash);
}

// ─── INIT ────────────────────────────────────────────────────────────────
(function init() {
  supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  const session = localStorage.getItem('fajardo_session');
  if (session) {
    try {
      currentUser = JSON.parse(session);
      showDashboard();
    } catch (_) {
      showLogin();
    }
  } else {
    showLogin();
  }
})();

// ─── SCREENS ────────────────────────────────────────────────────────────
function showLogin() {
  document.getElementById('screen-dashboard').classList.remove('active');
  document.getElementById('screen-login').classList.add('active');
}

function showDashboard() {
  document.getElementById('screen-login').classList.remove('active');
  document.getElementById('screen-dashboard').classList.add('active');
  document.getElementById('user-greeting').textContent = `Hola, ${currentUser.name} 👋`;
  loadContacts();
}

// ─── TABS (login / registro) ─────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const target = tab.dataset.tab;
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`tab-${target}`).classList.add('active');
  });
});

// ─── PIN BOXES — navegación automática ───────────────────────────────────
document.querySelectorAll('.pin-inputs').forEach(group => {
  const boxes = group.querySelectorAll('.pin-box');
  boxes.forEach((box, i) => {
    box.addEventListener('input', () => {
      box.value = box.value.replace(/\D/g, '').slice(-1);
      if (box.value && i < boxes.length - 1) boxes[i + 1].focus();
    });
    box.addEventListener('keydown', e => {
      if (e.key === 'Backspace' && !box.value && i > 0) boxes[i - 1].focus();
    });
    box.addEventListener('paste', e => {
      e.preventDefault();
      const digits = (e.clipboardData.getData('text') || '').replace(/\D/g, '').split('');
      boxes.forEach((b, j) => { if (digits[j]) b.value = digits[j]; });
      boxes[Math.min(digits.length, boxes.length - 1)].focus();
    });
  });
});

function getPin(containerId) {
  const sel = `#${containerId} .pin-box`;
  return [...document.querySelectorAll(sel)].map(b => b.value).join('');
}

// ─── NORMALIZAR NÚMERO ───────────────────────────────────────────────────
function normalizePhone(phone) {
  return phone.replace(/\D/g, '');
}

// ─── LOGIN ───────────────────────────────────────────────────────────────
document.getElementById('btn-login').addEventListener('click', async () => {
  const btn   = document.getElementById('btn-login');
  const err   = document.getElementById('login-error');
  const phone = normalizePhone(document.getElementById('login-phone').value);
  const pin   = getPin('tab-login');
  err.textContent = '';

  if (!phone || phone.length < 7) { err.textContent = 'Ingresa un número válido.'; return; }
  if (pin.length !== 4) { err.textContent = 'El PIN debe tener 4 dígitos.'; return; }

  btn.innerHTML = '<span class="spinner"></span> Verificando...';
  btn.disabled = true;

  try {
    const { data: users, error } = await supabaseClient
      .from('users')
      .select('*')
      .eq('phone', phone)
      .limit(1);

    if (error) throw error;
    if (!users || users.length === 0) {
      err.textContent = 'Número no registrado. Crea una cuenta primero.';
      return;
    }

    const user = users[0];

    // ✅ Verificar PIN con bcrypt
    const valid = await verifyPin(pin, user.pin_hash);
    if (!valid) {
      err.textContent = 'PIN incorrecto.';
      return;
    }

    currentUser = { id: user.id, phone: user.phone, name: user.first_name };
    localStorage.setItem('fajardo_session', JSON.stringify(currentUser));
    showDashboard();
  } catch (e) {
    err.textContent = 'Error al iniciar sesión: ' + (e.message || e);
  } finally {
    btn.innerHTML = 'Entrar →';
    btn.disabled = false;
  }
});

// ─── REGISTRO ────────────────────────────────────────────────────────────
document.getElementById('btn-register').addEventListener('click', async () => {
  const btn   = document.getElementById('btn-register');
  const err   = document.getElementById('reg-error');
  const name  = document.getElementById('reg-name').value.trim();
  const phone = normalizePhone(document.getElementById('reg-phone').value);
  const pin   = getPin('reg-pins');
  err.textContent = '';

  if (!name) { err.textContent = 'Ingresa tu primer nombre.'; return; }
  if (!phone || phone.length < 7) { err.textContent = 'Ingresa un número válido.'; return; }
  if (pin.length !== 4) { err.textContent = 'El PIN debe tener 4 dígitos.'; return; }

  btn.innerHTML = '<span class="spinner"></span> Creando cuenta...';
  btn.disabled = true;

  try {
    // Verificar si ya existe
    const { data: existing } = await supabaseClient
      .from('users')
      .select('id')
      .eq('phone', phone)
      .limit(1);

    if (existing && existing.length > 0) {
      err.textContent = 'Ese número ya está registrado.';
      return;
    }

    // ✅ Hashear PIN con bcrypt antes de guardar
    btn.innerHTML = '<span class="spinner"></span> Cifrando PIN...';
    const pin_hash = await hashPin(pin);

    const { data, error } = await supabaseClient
      .from('users')
      .insert([{ first_name: name, phone, pin_hash }])
      .select()
      .single();

    if (error) throw error;

    currentUser = { id: data.id, phone: data.phone, name: data.first_name };
    localStorage.setItem('fajardo_session', JSON.stringify(currentUser));
    showDashboard();
  } catch (e) {
    err.textContent = 'Error al registrar: ' + (e.message || e);
  } finally {
    btn.innerHTML = 'Crear Cuenta →';
    btn.disabled = false;
  }
});

// ─── LOGOUT ──────────────────────────────────────────────────────────────
document.getElementById('btn-logout').addEventListener('click', () => {
  localStorage.removeItem('fajardo_session');
  currentUser = null;
  allContacts = [];
  showLogin();
});

// ─── CARGAR CONTACTOS ─────────────────────────────────────────────────────
async function loadContacts() {
  const grid = document.getElementById('contacts-grid');
  grid.innerHTML = '<p style="color:var(--text-muted);padding:1rem;">Cargando...</p>';

  try {
    const { data, error } = await supabaseClient
      .from('contacts')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    allContacts = data || [];
    renderContacts(allContacts);
  } catch (e) {
    grid.innerHTML = `<p style="color:var(--danger);">Error: ${e.message}</p>`;
  }
}

function renderContacts(contacts) {
  const grid  = document.getElementById('contacts-grid');
  const empty = document.getElementById('empty-state');
  document.getElementById('contact-count').textContent = contacts.length;

  if (!contacts.length) {
    grid.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  grid.innerHTML = contacts.map(c => {
    const initials = (c.name || '?').substring(0, 2).toUpperCase();
    const tags = [
      c.facebook  ? '<span class="tag fb">FB</span>'  : '',
      c.instagram ? '<span class="tag ig">IG</span>'  : '',
      c.phone     ? '<span class="tag wa">📱</span>'  : '',
      c.tiktok    ? '<span class="tag tt">TT</span>'  : '',
    ].join('');

    return `
      <div class="contact-card" onclick="viewContact('${c.id}')">
        <div class="contact-avatar">${initials}</div>
        <div class="contact-name">${esc(c.name)}</div>
        <div class="contact-meta">
          ${c.phone ? `<span>📱 ${esc(c.phone)}</span>` : ''}
          ${c.city  ? `<span>📍 ${esc(c.city)}</span>`  : ''}
          ${c.polling_station ? `<span>🗳 ${esc(c.polling_station)}</span>` : ''}
        </div>
        ${tags ? `<div class="contact-tags">${tags}</div>` : ''}
      </div>`;
  }).join('');
}

// ─── BÚSQUEDA ────────────────────────────────────────────────────────────
document.getElementById('search-input').addEventListener('input', e => {
  const q = e.target.value.toLowerCase();
  if (!q) { renderContacts(allContacts); return; }
  const filtered = allContacts.filter(c =>
    (c.name || '').toLowerCase().includes(q) ||
    (c.phone || '').includes(q) ||
    (c.city || '').toLowerCase().includes(q) ||
    (c.neighborhood || '').toLowerCase().includes(q) ||
    (c.facebook || '').toLowerCase().includes(q) ||
    (c.instagram || '').toLowerCase().includes(q) ||
    (c.notes || '').toLowerCase().includes(q)
  );
  renderContacts(filtered);
});

// ─── MODAL CONTACTO ──────────────────────────────────────────────────────
function openModal(contact = null) {
  editingId = contact ? contact.id : null;
  document.getElementById('modal-title').textContent = contact ? 'Editar Contacto' : 'Nuevo Contacto';

  const fields = ['name','city','phone','email','facebook','instagram','tiktok','notes'];
  const keys   = ['name','city','phone','email','facebook','instagram','tiktok','notes'];

  fields.forEach((f, i) => {
    document.getElementById(`c-${f}`).value = contact ? (contact[keys[i]] || '') : '';
  });

  document.getElementById('contact-error').textContent = '';
  document.getElementById('modal-overlay').style.display = 'flex';
}

document.getElementById('btn-open-modal').addEventListener('click', () => openModal());
document.getElementById('btn-close-modal').addEventListener('click', closeModal);
document.getElementById('btn-cancel-modal').addEventListener('click', closeModal);
document.getElementById('modal-overlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeModal();
});

function closeModal() {
  document.getElementById('modal-overlay').style.display = 'none';
  editingId = null;
}

// ─── GUARDAR CONTACTO ─────────────────────────────────────────────────────
document.getElementById('btn-save-contact').addEventListener('click', async () => {
  const btn = document.getElementById('btn-save-contact');
  const err = document.getElementById('contact-error');
  err.textContent = '';

  const name = document.getElementById('c-name').value.trim();
  if (!name) { err.textContent = 'El nombre es obligatorio.'; return; }

  const payload = {
    user_id:         currentUser.id,
    name,
    city:            document.getElementById('c-city').value.trim(),
    phone:           document.getElementById('c-phone').value.trim(),
    email:           document.getElementById('c-email').value.trim(),
    facebook:        document.getElementById('c-facebook').value.trim(),
    instagram:       document.getElementById('c-instagram').value.trim(),
    tiktok:          document.getElementById('c-tiktok').value.trim(),
    notes:           document.getElementById('c-notes').value.trim(),
  };

  btn.innerHTML = '<span class="spinner"></span> Guardando...';
  btn.disabled = true;

  try {
    let error;
    if (editingId) {
      ({ error } = await supabaseClient.from('contacts').update(payload).eq('id', editingId));
    } else {
      ({ error } = await supabaseClient.from('contacts').insert([payload]));
    }
    if (error) throw error;
    closeModal();
    await loadContacts();
  } catch (e) {
    err.textContent = 'Error al guardar: ' + (e.message || e);
  } finally {
    btn.innerHTML = 'Guardar Contacto';
    btn.disabled = false;
  }
});

// ─── VER CONTACTO ────────────────────────────────────────────────────────
function viewContact(id) {
  const c = allContacts.find(x => x.id === id);
  if (!c) return;

  document.getElementById('view-name').textContent = c.name;

  const rows = [
    ['WhatsApp / Celular', c.phone,          c.phone ? `<a href="https://wa.me/${c.phone.replace(/\D/g,'')}" target="_blank">${esc(c.phone)}</a>` : null],
    ['Teléfono Fijo',      c.landline,       null],
    ['Correo',             c.email,          c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : null],
    ['Ciudad',             c.city,           null],
    ['Barrio / Vereda',    c.neighborhood,   null],
    ['Puesto de Votación', c.polling_station,null],
    ['Facebook',           c.facebook,       c.facebook  ? linkify(c.facebook, 'facebook') : null],
    ['Instagram',          c.instagram,      c.instagram ? `<a href="https://instagram.com/${c.instagram.replace('@','')}" target="_blank">${esc(c.instagram)}</a>` : null],
    ['TikTok / Enlace',    c.tiktok,         c.tiktok    ? linkify(c.tiktok, 'other') : null],
    ['Notas',              c.notes,          null],
  ];

  const html = rows
    .filter(r => r[1])
    .map(r => `
      <div class="detail-row">
        <div class="detail-label">${r[0]}</div>
        <div class="detail-value">${r[2] || esc(r[1])}</div>
      </div>`)
    .join('');

  document.getElementById('view-body').innerHTML = html || '<p style="color:var(--text-muted)">Sin información adicional.</p>';

  document.getElementById('btn-edit-contact').onclick   = () => { closeView(); openModal(c); };
  document.getElementById('btn-delete-contact').onclick = () => deleteContact(id);

  document.getElementById('modal-view').style.display = 'flex';
}

function closeView() {
  document.getElementById('modal-view').style.display = 'none';
}

document.getElementById('btn-close-view').addEventListener('click', closeView);
document.getElementById('modal-view').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeView();
});

// ─── ELIMINAR CONTACTO ───────────────────────────────────────────────────
async function deleteContact(id) {
  if (!confirm('¿Eliminar este contacto? Esta acción no se puede deshacer.')) return;
  try {
    const { error } = await supabaseClient.from('contacts').delete().eq('id', id);
    if (error) throw error;
    closeView();
    await loadContacts();
  } catch (e) {
    alert('Error al eliminar: ' + e.message);
  }
}

// ─── UTILIDADES ──────────────────────────────────────────────────────────
function esc(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function linkify(str, type) {
  if (!str) return '';
  if (str.startsWith('http')) return `<a href="${esc(str)}" target="_blank">${esc(str)}</a>`;
  if (type === 'facebook') {
    const clean = str.replace(/^@/, '');
    return `<a href="https://facebook.com/${esc(clean)}" target="_blank">${esc(str)}</a>`;
  }
  return esc(str);
}
