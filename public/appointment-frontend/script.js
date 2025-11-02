  // Helper to set text content for fields
  function set(id, value) {
    var el = document.getElementById(id);
    if (el) el.textContent = value;
  }
(function(){
  const qs = new URLSearchParams(location.search);
  const id = qs.get('id');
  const app = document.getElementById('info');
  const info = document.getElementById('info');
  const loading = document.getElementById('loading');
  const errorBox = document.getElementById('error');
  const errmsg = document.getElementById('errmsg');

  // Updated for Vercel deployment: apiBase can be https://clarastokes.vercel.app or your backend URL
  const apiBase = qs.get('api') || '';
  const preloaded = (() => {
    try {
      const d = qs.get('data');
      if (!d) return null;
      return JSON.parse(decodeURIComponent(escape(atob(d))));
    } catch(_) { return null; }
  })();

  async function fetchDetails(appointmentId){
    // Prefer direct backend call via ?api= to avoid missing proxy routes on Vercel
    const url = apiBase
      ? `${apiBase.replace(/\/$/, '')}/api/appointment/${encodeURIComponent(appointmentId)}`
      : `/api/appointment/${encodeURIComponent(appointmentId)}`;
    const res = await fetch(url, { credentials: 'omit' });
    if(!res.ok) throw new Error(res.status === 404 ? 'Appointment not found' : 'Server error');
    return res.json();
  }

  function render(d){
    info.style.display='block';
    set('f-id', d.appointmentId||id||'-');
    set('f-client', d.clientName||'-');
    set('f-staff', d.staffName||'-');
    set('f-dept', d.department||'Computer Science Engineering');
    set('f-purpose', d.purpose||'Video Consultation');
    set('f-date', d.date||new Date().toLocaleDateString());
    set('f-time', d.time||new Date().toLocaleTimeString());
    set('f-status', d.status ? d.status.charAt(0).toUpperCase() + d.status.slice(1) : 'Confirmed');
    set('f-location', d.location||'College Campus');
    set('f-contact', (d.contact||d.staffEmail||'staff@example.com'));
  }

  function escapeHtml(s){
    return s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
  }

  async function init(){
    try{
      let data;
      if(preloaded && preloaded.appointmentId){
        data = preloaded;
      } else if(id){
        data = await fetchDetails(id);
      } else {
        // sample demo data (for style preview)
        data = {
          appointmentId: 'call_1758460216159_8eigm830l',
          clientName: 'dhanush',
          staffName: 'Prof. Anitha C S',
          department: 'Computer Science Engineering',
          purpose: 'Video Consultation',
          date: '21/09/2025',
          time: '18:40:29',
          location: 'College Campus',
          status: 'confirmed',
          contact: 'STAFF@EXAMPLE.COM'
        };
      }
      render(data);
      loading.style.display='none';
      app.style.display='block';
    }catch(err){
      loading.style.display='none';
      errorBox.style.display='flex';
      if(errmsg) errmsg.textContent = err.message || 'Unknown error';
      console.error(err);
    }
  }

  // Add refresh button logic
  document.addEventListener('DOMContentLoaded', function(){
    const refreshBtn = document.getElementById('refresh');
    if(refreshBtn){
      refreshBtn.addEventListener('click', function(){
        loading.style.display='block';
        info.style.display='none';
        errorBox.style.display='none';
        init();
      });
    }
  });

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
})();


