const qs = new URLSearchParams(location.search);
const id = qs.get('id');
const api = qs.get('api') || '';
const dataParam = qs.get('data');

const loading = document.getElementById('loading');
const errorBox = document.getElementById('error');
const errmsg = document.getElementById('errmsg');
const info = document.getElementById('info');

function set(idSel, val){ const el=document.getElementById(idSel); if(el) el.textContent = String(val||''); }
function showError(msg){ loading.style.display='none'; errorBox.style.display='block'; errmsg.textContent = msg; }

function decodeData(d){
  try{ return JSON.parse(decodeURIComponent(escape(atob(d)))); }catch(_){ return null; }
}

async function fetchBackend(appointmentId){
  const base = (api||'').replace(/\/$/, '');
  const url = base ? `${base}/api/appointment/${encodeURIComponent(appointmentId)}` : `/api/appointment/${encodeURIComponent(appointmentId)}`;
  const res = await fetch(url, { credentials: 'omit' });
  if(!res.ok) throw new Error(res.status===404?'Appointment not found':'Server error');
  return res.json();
}

async function init(){
  try{
    let data = null;
    if(dataParam){ data = decodeData(dataParam); }
    if(!data && id){
      try{ data = await fetchBackend(id); }catch(e){ /* continue to sample */ }
    }
    if(!data){
      showError('Appointment not found');
      return;
    }
    info.style.display='block';
    set('f-id', data.appointmentId||id||'-');
    set('f-client', data.clientName||'-');
    set('f-staff', data.staffName||'-');
    set('f-dept', data.department||'Computer Science Engineering');
    set('f-purpose', data.purpose||'Video Consultation');
    set('f-date', data.date||'-');
    set('f-time', data.time||'-');
    set('f-status', data.status||'confirmed');
    set('f-location', data.location||'College Campus');
    set('f-contact', data.contact||data.staffEmail||'-');
    loading.style.display='none';
  }catch(e){ showError(e.message||'Failed to load'); }
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();





