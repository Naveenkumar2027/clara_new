import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js';
import { getFirestore, doc, getDoc, onSnapshot } from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js';

const qs = new URLSearchParams(location.search);
// Support both path-based /appointment/:id (Firebase Hosting rewrites) and query ?id=
let pathId = (location.pathname.match(/appointment\/(.+)$/) || [])[1] || '';
const id = qs.get('id') || decodeURIComponent(pathId || '');

// Elements
const loading = document.getElementById('loading');
const errorBox = document.getElementById('error');
const errmsg = document.getElementById('errmsg');
const info = document.getElementById('info');

// Fill these with your Firebase project settings
const firebaseConfig = {
  apiKey: '__FIREBASE_API_KEY__',
  authDomain: 'clara-ai.firebaseapp.com',
  projectId: '__FIREBASE_PROJECT_ID__',
};

async function main() {
  if (!id) return showError('Missing appointment id');
  // Allow backend fallback via ?api= to fetch JSON when Firestore is not used yet
  const apiBase = qs.get('api');
  if (apiBase) {
    try {
      const res = await fetch(`${apiBase}/api/appointment/${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error('Backend error');
      const docData = await res.json();
      render(docData);
      loading.style.display = 'none';
      return;
    } catch (e) {
      // continue to Firestore below
    }
  }

  try {
    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);
    const ref = doc(db, 'appointments', id);
    // Real-time updates
    onSnapshot(ref, (snap) => {
      if (!snap.exists()) {
        showError('Appointment not found');
        return;
      }
      render(snap.data());
      loading.style.display = 'none';
    }, (err) => showError(err.message || 'Realtime error'));
  } catch (e) {
    showError(e.message || 'Failed to load appointment');
  }
}

function render(d) {
  info.style.display = 'block';
  setText('f-id', d.appointmentId || id);
  setText('f-client', d.clientName || '-');
  setText('f-staff', d.staffName || '-');
  setText('f-dept', d.department || 'Computer Science Engineering');
  setText('f-purpose', d.purpose || '-');
  setText('f-date', d.date || '-');
  setText('f-time', d.time || '-');
  setText('f-status', d.status || 'confirmed');
  setText('f-location', d.location || 'College Campus');
  setText('f-contact', d.contact || d.staffEmail || '-');
}

function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = String(val); }
function showError(msg) { loading.style.display = 'none'; errorBox.style.display = 'block'; errmsg.textContent = msg; }

main();





