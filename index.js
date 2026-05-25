// ╔══════════════════════════════════════════════════════╗
// ║  FIREBASE CONFIGURATION                              ║
// ║  ➜ Replace ALL values below with your own Firebase   ║
// ║    project config from console.firebase.google.com   ║
// ╚══════════════════════════════════════════════════════╝
const firebaseConfig = {
  apiKey: "AIzaSyBp48QiSL7mG5mFkByAxDihdetyZ1FWhGw",
  authDomain: "buildeasy---uganda-c164b.firebaseapp.com",
  projectId: "buildeasy---uganda-c164b",
  storageBucket: "buildeasy---uganda-c164b.firebasestorage.app",
  messagingSenderId: "932079087101",
  appId: "1:932079087101:web:a6e267775e6eb7281e3d94",
  measurementId: "G-G2YPCFLZV3"
};

firebase.initializeApp(firebaseConfig);
const db      = firebase.firestore();
const storage = firebase.storage();

// ─── GLOBAL STATE ─────────────────────────────────────────
let currentUser       = null;
let cart              = [];
let currentModalProduct = null;

// ─── LOADING OVERLAY ──────────────────────────────────────
function showLoader(msg){ 
  let el = document.getElementById('global-loader');
  if(!el){
    el = document.createElement('div');
    el.id='global-loader';
    el.style.cssText='position:fixed;inset:0;background:rgba(26,43,74,0.55);z-index:9000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px';
    el.innerHTML='<div style="width:44px;height:44px;border:4px solid rgba(255,255,255,0.2);border-top-color:#e8860a;border-radius:50%;animation:spin 0.8s linear infinite"></div><div style="color:white;font-family:Nunito,sans-serif;font-weight:700;font-size:15px" id="loader-msg">Loading...</div><style>@keyframes spin{to{transform:rotate(360deg)}}</style>';
    document.body.appendChild(el);
  }
  document.getElementById('loader-msg').textContent = msg||'Loading...';
  el.style.display='flex';
}
function hideLoader(){
  const el=document.getElementById('global-loader');
  if(el) el.style.display='none';
}

// ─── SESSION ─────────────────────────────────────────────
function saveSession(uid){ localStorage.setItem('be_session_uid', uid); }
function clearSession(){   localStorage.removeItem('be_session_uid'); }
function getSessionUid(){  return localStorage.getItem('be_session_uid'); }

// Cart stays in localStorage (session-specific, no cross-user sharing needed)
function getCart(){  return JSON.parse(localStorage.getItem('be_cart')||'[]'); }
function saveCart(c){ localStorage.setItem('be_cart',JSON.stringify(c)); cart=c; updateCartBadge(); }

// ─── FIRESTORE HELPERS ────────────────────────────────────
// Users
async function dbGetUserByNamePhone(name, phone){
  const snap = await db.collection('users')
    .where('nameLower','==',name.toLowerCase())
    .where('phone','==',phone)
    .limit(1).get();
  return snap.empty ? null : {id:snap.docs[0].id,...snap.docs[0].data()};
}
async function dbGetUserById(uid){
  const doc = await db.collection('users').doc(uid).get();
  return doc.exists ? {id:doc.id,...doc.data()} : null;
}
async function dbCreateUser(user){
  const ref = db.collection('users').doc();
  await ref.set({...user, nameLower:user.name.toLowerCase(), createdAt:firebase.firestore.FieldValue.serverTimestamp()});
  return ref.id;
}
async function dbUpdateUser(uid, data){
  await db.collection('users').doc(uid).update(data);
}

// Artisans (filtered query)
async function dbGetArtisans(trade){
  let q = db.collection('users').where('category','==','artisan');
  if(trade) q = q.where('trade','==',trade);
  const snap = await q.get();
  return snap.docs.map(d=>({id:d.id,...d.data()}));
}

// Products
async function dbGetProducts(searchTerm){
  const snap = await db.collection('products').orderBy('createdAt','desc').get();
  let arr = snap.docs.map(d=>({id:d.id,...d.data()}));
  if(searchTerm) arr = arr.filter(p=>
    p.name.toLowerCase().includes(searchTerm.toLowerCase())||
    (p.desc||'').toLowerCase().includes(searchTerm.toLowerCase())
  );
  return arr;
}
async function dbGetMyProducts(uid){
  const snap = await db.collection('products').where('supplierId','==',uid).get();
  return snap.docs.map(d=>({id:d.id,...d.data()}));
}
async function dbAddProduct(product){
  const ref = db.collection('products').doc();
  await ref.set({...product, createdAt:firebase.firestore.FieldValue.serverTimestamp()});
  return ref.id;
}
async function dbUpdateProduct(pid, data){
  await db.collection('products').doc(pid).update(data);
}

// Reviews
async function dbGetReviews(){
  const snap = await db.collection('reviews').orderBy('createdAt','desc').limit(9).get();
  return snap.docs.map(d=>({id:d.id,...d.data()}));
}
async function dbAddReview(review){
  await db.collection('reviews').add({...review, createdAt:firebase.firestore.FieldValue.serverTimestamp()});
}

// ─── IMAGE UPLOAD TO FIREBASE STORAGE ─────────────────────
async function uploadImage(file, path){
  const ref = storage.ref(path+'/'+Date.now()+'_'+file.name.replace(/\s/g,'_'));
  await ref.put(file);
  return await ref.getDownloadURL();
}

// ─── INIT ─────────────────────────────────────────────────
window.onload = async function(){
  cart = getCart();
  updateCartBadge();
  // Restore session
  const uid = getSessionUid();
  if(uid){
    showLoader('Restoring session...');
    try{
      const user = await dbGetUserById(uid);
      if(user){ loginUser(user, true); }
    }catch(e){ console.warn('Session restore failed',e); }
    hideLoader();
  }
  // Seed demo artisans (only if none exist yet)
  await seedDemoData();
  renderReviews();
};

async function seedDemoData(){
  try{
    const snap = await db.collection('users').where('category','==','artisan').where('isDemo','==',true).limit(1).get();
    if(!snap.empty) return; // already seeded
    const demos = [
      {name:'Patrick Mukasa',phone:'0781000001',location:'Kampala',category:'artisan',trade:'Plumber',status:'Free for Work',experience:'5–10 years',pic:'',portfolio:[],profileComplete:true,isDemo:true},
      {name:'Grace Nabukenya',phone:'0701000002',location:'Wakiso',category:'artisan',trade:'Electrician',status:'Free for Work',experience:'3–5 years',pic:'',portfolio:[],profileComplete:true,isDemo:true},
      {name:'Samuel Opio',phone:'0712000003',location:'Jinja',category:'artisan',trade:'Builder / Mason',status:'Busy',experience:'10+ years',pic:'',portfolio:[],profileComplete:true,isDemo:true},
      {name:'Diana Akello',phone:'0752000004',location:'Kampala',category:'artisan',trade:'Painter',status:'Free for Work',experience:'1–3 years',pic:'',portfolio:[],profileComplete:true,isDemo:true},
      {name:'Robert Ssali',phone:'0702000005',location:'Mukono',category:'artisan',trade:'Carpenter',status:'Free for Work',experience:'5–10 years',pic:'',portfolio:[],profileComplete:true,isDemo:true},
      {name:'Faith Namwanje',phone:'0771000006',location:'Entebbe',category:'artisan',trade:'Welder',status:'Busy',experience:'3–5 years',pic:'',portfolio:[],profileComplete:true,isDemo:true},
    ];
    const batch = db.batch();
    demos.forEach(d=>{
      const ref = db.collection('users').doc();
      batch.set(ref,{...d,nameLower:d.name.toLowerCase(),createdAt:firebase.firestore.FieldValue.serverTimestamp()});
    });
    await batch.commit();
    // Seed demo products
    const prodSnap = await db.collection('products').limit(1).get();
    if(prodSnap.empty){
      const prods=[
        {supplierId:'demo',supplierName:'Kampala Hardware',supplierPhone:'0700123456',name:'Portland Cement 50kg',desc:'High-quality Hima cement, ideal for construction and plastering.',price:35000,delivery:'Free Delivery',payment:'Pay Before Delivery',stock:'In Stock',img:''},
        {supplierId:'demo',supplierName:'Kampala Hardware',supplierPhone:'0700123456',name:'Iron Bars 12mm x 12m',desc:'Deformed bar steel, suitable for reinforced concrete structures.',price:48000,delivery:"Delivery on Client's Bill",payment:'Partial Payment Before Delivery',stock:'In Stock',img:''},
        {supplierId:'demo',supplierName:'Ntinda Suppliers',supplierPhone:'0710987654',name:'Roofing Iron Sheets (Gauge 30)',desc:'Pre-painted iron sheets 3m length, multiple colours available.',price:52000,delivery:"Delivery on Client's Bill",payment:'Pay After Delivery',stock:'In Stock',img:''},
        {supplierId:'demo',supplierName:'Ntinda Suppliers',supplierPhone:'0710987654',name:'Ceramic Floor Tiles 60x60',desc:'Italian design ceramic tiles, anti-slip finish, sold per box.',price:85000,delivery:'Free Delivery',payment:'Pay Before Delivery',stock:'In Stock',img:''},
        {supplierId:'demo',supplierName:'Mukono Building Depot',supplierPhone:'0783456789',name:'River Sand (1 Ton)',desc:'Washed river sand, free of clay and impurities. Ideal for plastering.',price:120000,delivery:'Free Delivery',payment:'Pay Before Delivery',stock:'In Stock',img:''},
        {supplierId:'demo',supplierName:'Mukono Building Depot',supplierPhone:'0783456789',name:'Hardcore Aggregate',desc:'Crushed granite stone for foundations and slab bases. Per ton.',price:95000,delivery:"Delivery on Client's Bill",payment:'Pay Before Delivery',stock:'Out of Stock',img:''},
      ];
      const batch2=db.batch();
      prods.forEach(p=>{const ref=db.collection('products').doc();batch2.set(ref,{...p,createdAt:firebase.firestore.FieldValue.serverTimestamp()});});
      await batch2.commit();
    }
    // Seed demo reviews
    const revSnap = await db.collection('reviews').limit(1).get();
    if(revSnap.empty){
      const revs=[
        {name:'James Ssekandi',role:'Homeowner / Client',text:'BuildEasy helped me find a plumber in Kampala within hours. The WhatsApp booking is so convenient!'},
        {name:'Fatuma Nakirya',role:'Artisan / Contractor',text:'I joined as a carpenter and started getting inquiries the same week. The platform is very easy to use.'},
        {name:'Peter Mugisha',role:'Hardware Supplier',text:'Listing my products here has brought new customers I never expected. The order notifications are great.'},
      ];
      const batch3=db.batch();
      revs.forEach(r=>{const ref=db.collection('reviews').doc();batch3.set(ref,{...r,createdAt:firebase.firestore.FieldValue.serverTimestamp()});});
      await batch3.commit();
    }
  }catch(e){console.warn('Seed failed (might be offline or rules not set):', e.message);}
}

// ─── PAGE ROUTING ─────────────────────────────────────────
function goTo(pageId){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  const pg = document.getElementById('page-'+pageId);
  if(pg){ pg.classList.add('active'); window.scrollTo(0,0); }
  if(pageId==='shop')     renderShop();
  if(pageId==='cart')     renderCart();
  if(pageId==='customer') renderCustomerDash();
  if(pageId==='artisan')  renderArtisanDash();
  if(pageId==='hardware') renderHardwareDash();
}

function goToDashboard(){
  if(!currentUser){ goTo('login'); return; }
  if(currentUser.category==='customer')  goTo('customer');
  else if(currentUser.category==='artisan') goTo('artisan');
  else if(currentUser.category==='hardware') goTo('hardware');
}

function scrollToSection(id){
  const el=document.getElementById(id);
  if(el){ el.scrollIntoView({behavior:'smooth'}); }
  else{ goTo('landing'); setTimeout(()=>{const e=document.getElementById(id);if(e)e.scrollIntoView({behavior:'smooth'});},200); }
}

// ─── AUTH ─────────────────────────────────────────────────
function onCategoryChange(){
  const cat = document.getElementById('su-category').value;
  document.getElementById('su-trade-wrap').style.display = cat==='artisan' ? 'block' : 'none';
}

async function doSignup(){
  const name     = document.getElementById('su-name').value.trim();
  const phone    = document.getElementById('su-phone').value.trim();
  const location = document.getElementById('su-location').value;
  const category = document.getElementById('su-category').value;
  const trade    = document.getElementById('su-trade').value;
  if(!name||!phone||!location||!category){ showToast('Please fill all required fields','error'); return; }
  if(category==='artisan'&&!trade){ showToast('Please select your trade','error'); return; }
  showLoader('Creating account...');
  try{
    const existing = await dbGetUserByNamePhone(name, phone);
    if(existing){ hideLoader(); showToast('Account already exists','warn'); return; }
    const user = {
      name, phone, location, category, trade: trade||'',
      status: category==='artisan' ? 'Free for Work' : '',
      experience:'', pic:'', portfolio:[], bizName:'', branches:'',
      profileComplete: false
    };
    const uid = await dbCreateUser(user);
    hideLoader();
    loginUser({id:uid,...user});
    showToast('Account created! Welcome to BuildEasy 🎉','success');
  }catch(e){
    hideLoader();
    showToast('Error: '+e.message,'error');
    console.error(e);
  }
}

async function doLogin(){
  const name  = document.getElementById('li-name').value.trim();
  const phone = document.getElementById('li-phone').value.trim();
  if(!name||!phone){ showToast('Please enter your name and contact','error'); return; }
  showLoader('Logging in...');
  try{
    const user = await dbGetUserByNamePhone(name, phone);
    hideLoader();
    if(!user){ showToast("Account doesn't exist. Please sign up",'error'); return; }
    loginUser(user);
    showToast('Welcome back, '+user.name.split(' ')[0]+'! 👋','success');
  }catch(e){
    hideLoader();
    showToast('Login error: '+e.message,'error');
    console.error(e);
  }
}

function loginUser(user, silent){
  currentUser = user;
  saveSession(user.id);
  // Update nav
  document.getElementById('nav-links-public').style.display='none';
  document.getElementById('nav-links-user').style.display='flex';
  document.getElementById('nav-username').textContent = user.name.split(' ')[0];
  const init = user.name.charAt(0).toUpperCase();
  const navAv = document.getElementById('nav-avatar');
  if(user.pic){ navAv.innerHTML=`<img src="${user.pic}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`; }
  else { navAv.textContent=init; }
  if(!silent) goToDashboard();
  else goToDashboard();
}

function logout(){
  currentUser=null;
  clearSession();
  saveCart([]);
  document.getElementById('nav-links-public').style.display='flex';
  document.getElementById('nav-links-user').style.display='none';
  goTo('landing');
  showToast('Logged out successfully');
}

// ─── DASHBOARD RENDERS ────────────────────────────────────
function renderCustomerDash(){
  if(!currentUser) return;
  document.getElementById('cust-sidebar-name').textContent = currentUser.name;
  document.getElementById('cust-banner-name').textContent  = 'Welcome, '+currentUser.name.split(' ')[0]+'!';
  document.getElementById('cust-banner-location').textContent = currentUser.location+', Uganda';
  const av=document.getElementById('cust-avatar-banner');
  if(currentUser.pic) av.innerHTML=`<img src="${currentUser.pic}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
  else av.textContent=currentUser.name.charAt(0).toUpperCase();
}

function renderArtisanDash(){
  if(!currentUser) return;
  document.getElementById('art-sidebar-name').textContent = currentUser.name;
  document.getElementById('art-sidebar-trade').textContent = currentUser.trade||'Artisan';
  document.getElementById('art-banner-name').textContent  = currentUser.name;
  document.getElementById('art-banner-trade').textContent = (currentUser.trade||'Artisan')+' · '+currentUser.location;
  const av=document.getElementById('art-avatar-banner');
  if(currentUser.pic) av.innerHTML=`<img src="${currentUser.pic}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
  else av.textContent=currentUser.name.charAt(0).toUpperCase();
  document.getElementById('art-setup-alert').style.display = currentUser.profileComplete ? 'none' : 'flex';
  const s=currentUser.status||'Free for Work';
  const btn=document.getElementById('art-status-btn');
  btn.textContent = s==='Busy' ? '🔴 Busy — Tap to set Free' : '🟢 Free for Work — Tap to set Busy';
  btn.style.background = s==='Busy' ? 'var(--red)' : 'var(--green)';
  loadTeamupArtisans();
}

function renderHardwareDash(){
  if(!currentUser) return;
  const biz = currentUser.bizName||currentUser.name;
  document.getElementById('hw-sidebar-name').textContent    = biz;
  document.getElementById('hw-banner-name').textContent     = biz;
  document.getElementById('hw-banner-location').textContent = currentUser.location+', Uganda';
  const av=document.getElementById('hw-avatar-banner');
  if(currentUser.pic) av.innerHTML=`<img src="${currentUser.pic}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
  else av.textContent=biz.charAt(0).toUpperCase();
  document.getElementById('hw-setup-alert').style.display = currentUser.profileComplete ? 'none' : 'flex';
  renderHwProducts();
}

// ─── TABS ─────────────────────────────────────────────────
function switchTab(prefix, tab){
  const pageMap={cust:'customer',art:'artisan',hw:'hardware'};
  const page = pageMap[prefix]||prefix;
  document.querySelectorAll(`[id^="${prefix}-tab-"]`).forEach(t=>t.classList.remove('active'));
  const el = document.getElementById(`${prefix}-tab-${tab}`);
  if(el) el.classList.add('active');
  const tabMap={cust:['overview','project','materials','profile'],art:['overview','teamup','invite','materials','profile'],hw:['overview','products','add-product','profile']};
  const links = document.querySelectorAll(`#page-${page} .sidebar-link`);
  links.forEach(l=>l.classList.remove('active'));
  const idx = (tabMap[prefix]||[]).indexOf(tab);
  if(links[idx]) links[idx].classList.add('active');
}

// ─── ARTISAN SEARCH ───────────────────────────────────────
async function loadArtisans(){
  const trade = document.getElementById('proj-trade').value;
  const container = document.getElementById('artisan-results');
  if(!trade){ container.innerHTML=''; return; }
  container.innerHTML='<p style="color:var(--text-soft);padding:1rem">Loading artisans...</p>';
  try{
    const artisans = await dbGetArtisans(trade);
    if(!artisans.length){
      container.innerHTML=`<p style="color:var(--text-soft);text-align:center;padding:2rem">No ${trade} artisans found yet.</p>`;
      return;
    }
    container.innerHTML='<div class="grid-4">'+artisans.map(u=>`
      <div class="person-card" onclick="openArtisanModal('${u.id}')">
        <div class="person-avatar">${u.pic?`<img src="${u.pic}" alt="${u.name}">`:`<span>${u.name.charAt(0)}</span>`}</div>
        <div class="person-name">${u.name}</div>
        <div class="person-meta">${u.trade||''} · ${u.location}</div>
        <div style="text-align:center;margin-top:0.5rem">
          <span class="badge ${u.status==='Busy'?'badge-busy':'badge-free'}">
            <span class="badge-dot"></span>${u.status||'Free for Work'}
          </span>
        </div>
      </div>`).join('')+'</div>';
  }catch(e){ container.innerHTML=`<p style="color:var(--red);padding:1rem">Error loading artisans. Check your Firebase connection.</p>`; console.error(e); }
}

async function loadTeamupArtisans(){
  const trade = document.getElementById('teamup-trade')?.value||'';
  const container = document.getElementById('teamup-results');
  if(!container) return;
  container.innerHTML='<p style="color:var(--text-soft);padding:1rem">Loading artisans...</p>';
  try{
    let artisans = await dbGetArtisans(trade);
    artisans = artisans.filter(u=>u.id!==currentUser?.id);
    if(!artisans.length){
      container.innerHTML='<p style="color:var(--text-soft);text-align:center;padding:2rem">No artisans found.</p>';
      return;
    }
    container.innerHTML='<div class="grid-4">'+artisans.map(u=>`
      <div class="person-card" onclick="openArtisanModal('${u.id}')">
        <div class="person-avatar">${u.pic?`<img src="${u.pic}">`:`<span>${u.name.charAt(0)}</span>`}</div>
        <div class="person-name">${u.name}</div>
        <div class="person-meta">${u.trade||''} · ${u.location}</div>
        <div style="text-align:center;margin-top:0.5rem">
          <span class="badge ${u.status==='Busy'?'badge-busy':'badge-free'}">
            <span class="badge-dot"></span>${u.status||'Free for Work'}
          </span>
        </div>
      </div>`).join('')+'</div>';
  }catch(e){ container.innerHTML=`<p style="color:var(--red);padding:1rem">Error loading. Check Firebase.</p>`; }
}

async function openArtisanModal(uid){
  showLoader('Loading profile...');
  try{
    const u = await dbGetUserById(uid);
    hideLoader();
    if(!u) return;
    document.getElementById('amodal-name').textContent = u.name;
    document.getElementById('amodal-avatar').innerHTML = u.pic
      ?`<img src="${u.pic}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
      :`${u.name.charAt(0)}`;
    document.getElementById('amodal-status').innerHTML =
      `<span class="badge ${u.status==='Busy'?'badge-busy':'badge-free'}"><span class="badge-dot"></span>${u.status||'Free for Work'}</span>`;
    document.getElementById('amodal-details').innerHTML=`
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;font-size:14px">
        <div><strong>Trade:</strong> ${u.trade||'—'}</div>
        <div><strong>Location:</strong> ${u.location}</div>
        <div><strong>Experience:</strong> ${u.experience||'Not specified'}</div>
        <div><strong>Contact:</strong> ${u.phone}</div>
      </div>
      ${u.portfolio&&u.portfolio.length?`
        <div style="margin-top:1rem">
          <strong style="font-size:13px;color:var(--text-soft)">PAST WORKS</strong>
          <div class="uploaded-img-row" style="margin-top:0.5rem">
            ${u.portfolio.map(img=>`<div class="uploaded-img-thumb"><img src="${img}"></div>`).join('')}
          </div>
        </div>`:''}`;
    const phone = u.phone.replace(/\D/g,'');
    const wa    = phone.startsWith('0') ? '256'+phone.slice(1) : phone;
    const msg   = encodeURIComponent(`Hello ${u.name}, I found you on BuildEasy Uganda and would like to book your ${u.trade||'services'}. Are you available?`);
    document.getElementById('amodal-book-btn').onclick = ()=>window.open(`https://wa.me/${wa}?text=${msg}`,'_blank');
    openModal('artisan-modal');
  }catch(e){ hideLoader(); showToast('Could not load profile','error'); console.error(e); }
}

// ─── ARTISAN STATUS TOGGLE ────────────────────────────────
async function toggleArtisanStatus(){
  if(!currentUser) return;
  const newStatus = currentUser.status==='Busy' ? 'Free for Work' : 'Busy';
  showLoader('Updating status...');
  try{
    await dbUpdateUser(currentUser.id,{status:newStatus});
    currentUser.status = newStatus;
    hideLoader();
    renderArtisanDash();
    showToast('Status updated to '+newStatus,'success');
  }catch(e){ hideLoader(); showToast('Update failed','error'); console.error(e); }
}

// ─── PROFILE IMAGE UPLOAD ─────────────────────────────────
async function handleProfilePicUpload(inputId, previewDivId, avatarId){
  const file = document.getElementById(inputId).files[0];
  if(!file) return;
  // Preview immediately from local
  const reader = new FileReader();
  reader.onload = e=>{
    const div=document.getElementById(previewDivId);
    if(div){ div.style.display='block'; const img=div.querySelector('img'); if(img) img.src=e.target.result; }
    const av=document.getElementById(avatarId);
    if(av) av.innerHTML=`<img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
    const navAv=document.getElementById('nav-avatar');
    if(navAv) navAv.innerHTML=`<img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
  };
  reader.readAsDataURL(file);
  // Upload to Firebase Storage
  if(!currentUser) return;
  showLoader('Uploading photo...');
  try{
    const url = await uploadImage(file, `profiles/${currentUser.id}`);
    await dbUpdateUser(currentUser.id,{pic:url});
    currentUser.pic = url;
    hideLoader();
    showToast('Profile picture updated!','success');
  }catch(e){ hideLoader(); showToast('Upload failed: '+e.message,'error'); console.error(e); }
}

// Glue the file inputs to the new handler
function previewProfilePic(inputId, previewDivId, avatarId, _ignore){
  handleProfilePicUpload(inputId, previewDivId, avatarId);
}

async function addPortfolioImages(){
  const files = document.getElementById('art-portfolio-input').files;
  if(!currentUser) return;
  Array.from(files).forEach(async file=>{
    const reader=new FileReader();
    reader.onload=e=>{
      const row=document.getElementById('art-portfolio-row');
      const thumb=document.createElement('div');
      thumb.className='uploaded-img-thumb';
      thumb.innerHTML=`<img src="${e.target.result}"><button class="thumb-remove" onclick="this.parentElement.remove()">✕</button>`;
      row.appendChild(thumb);
    };
    reader.readAsDataURL(file);
    // Upload
    try{
      showLoader('Uploading image...');
      const url = await uploadImage(file, `portfolio/${currentUser.id}`);
      await dbUpdateUser(currentUser.id,{portfolio:firebase.firestore.FieldValue.arrayUnion(url)});
      if(!currentUser.portfolio) currentUser.portfolio=[];
      currentUser.portfolio.push(url);
      hideLoader();
    }catch(e){ hideLoader(); showToast('Image upload failed','error'); console.error(e); }
  });
}

// ─── PROFILE SAVES ────────────────────────────────────────
async function saveProfile(type){
  if(!currentUser) return;
  showLoader('Saving...');
  try{
    const update={profileComplete:true};
    if(type==='customer'){
      const extra=document.getElementById('cust-extra-phone').value.trim();
      if(extra) update.extraPhone=extra;
    }
    await dbUpdateUser(currentUser.id,update);
    Object.assign(currentUser,update);
    hideLoader();
    showToast('Profile saved!','success');
  }catch(e){ hideLoader(); showToast('Save failed: '+e.message,'error'); console.error(e); }
}

async function saveArtisanProfile(){
  if(!currentUser) return;
  showLoader('Saving profile...');
  try{
    const update={
      experience: document.getElementById('art-experience').value,
      status:     document.getElementById('art-status-select').value,
      profileComplete: true
    };
    await dbUpdateUser(currentUser.id, update);
    Object.assign(currentUser, update);
    hideLoader();
    renderArtisanDash();
    showToast('Profile saved!','success');
  }catch(e){ hideLoader(); showToast('Save failed: '+e.message,'error'); console.error(e); }
}

async function saveHardwareProfile(){
  if(!currentUser) return;
  const bizName=document.getElementById('hw-biz-name').value.trim();
  if(!bizName){ showToast('Please enter your business name','error'); return; }
  showLoader('Saving store...');
  try{
    const update={bizName, branches:document.getElementById('hw-branches').value.trim(), profileComplete:true};
    await dbUpdateUser(currentUser.id, update);
    Object.assign(currentUser, update);
    hideLoader();
    renderHardwareDash();
    showToast('Store profile saved!','success');
  }catch(e){ hideLoader(); showToast('Save failed: '+e.message,'error'); console.error(e); }
}

// ─── INVITE ───────────────────────────────────────────────
function sendInvite(){
  const phone=document.getElementById('invite-phone').value.trim();
  const name =document.getElementById('invite-name').value.trim();
  if(!phone){ showToast("Please enter the artisan's phone number",'error'); return; }
  const wa   = phone.replace(/\D/g,'');
  const waNum= wa.startsWith('0')?'256'+wa.slice(1):wa;
  const siteUrl=window.location.href.split('?')[0];
  const msg  = encodeURIComponent(`Hello${name?' '+name:''}! ${currentUser?.name||'Someone'} has invited you to join BuildEasy Uganda — Uganda's construction platform. Sign up free: ${siteUrl}`);
  window.open(`https://wa.me/${waNum}?text=${msg}`,'_blank');
  document.getElementById('invite-phone').value='';
  document.getElementById('invite-name').value='';
  showToast('Invite sent via WhatsApp!','success');
}

// ─── HARDWARE PRODUCTS ────────────────────────────────────
function previewProductImg(){
  const file=document.getElementById('prod-img-input').files[0];
  if(!file) return;
  const reader=new FileReader();
  reader.onload=e=>{
    const prev=document.getElementById('prod-img-preview');
    prev.style.display='block';
    document.getElementById('prod-img-thumb').src=e.target.result;
  };
  reader.readAsDataURL(file);
}

async function addProduct(){
  if(!currentUser){ showToast('Please log in','error'); return; }
  const name =document.getElementById('prod-name').value.trim();
  const price=document.getElementById('prod-price').value;
  if(!name||!price){ showToast('Please fill product name and price','error'); return; }
  showLoader('Adding product...');
  try{
    let imgUrl='';
    const file=document.getElementById('prod-img-input').files[0];
    if(file) imgUrl = await uploadImage(file,`products/${currentUser.id}`);
    const product={
      supplierId:   currentUser.id,
      supplierName: currentUser.bizName||currentUser.name,
      supplierPhone:currentUser.phone,
      name, img: imgUrl,
      desc:     document.getElementById('prod-desc').value.trim(),
      price:    parseInt(price),
      delivery: document.getElementById('prod-delivery').value,
      payment:  document.getElementById('prod-payment').value,
      stock:    document.getElementById('prod-stock').value
    };
    await dbAddProduct(product);
    hideLoader();
    document.getElementById('prod-name').value='';
    document.getElementById('prod-desc').value='';
    document.getElementById('prod-price').value='';
    document.getElementById('prod-img-preview').style.display='none';
    showToast('Product added successfully!','success');
    switchTab('hw','products');
    renderHwProducts();
  }catch(e){ hideLoader(); showToast('Error: '+e.message,'error'); console.error(e); }
}

async function renderHwProducts(){
  if(!currentUser) return;
  const container=document.getElementById('hw-products-list');
  container.innerHTML='<p style="padding:1rem;color:var(--text-soft)">Loading products...</p>';
  try{
    const products=await dbGetMyProducts(currentUser.id);
    if(!products.length){
      container.innerHTML='<div style="text-align:center;padding:3rem"><div style="font-size:48px;margin-bottom:1rem">📦</div><h3 style="font-weight:800;color:var(--navy)">No products yet</h3><p style="color:var(--text-soft);margin-top:0.5rem">Add your first product to start selling</p><button class="btn btn-orange mt-3" onclick="switchTab(\'hw\',\'add-product\')">Add First Product</button></div>';
      return;
    }
    container.innerHTML='<div class="grid-4">'+products.map(p=>`
      <div class="product-card">
        <div class="product-img">${p.img?`<img src="${p.img}" alt="${p.name}">`:`📦`}</div>
        <div class="product-body">
          <div class="product-name">${p.name}</div>
          <div class="product-price">UGX ${Number(p.price).toLocaleString()}</div>
          <div class="product-tags">
            <span class="badge ${p.stock==='In Stock'?'badge-free':'badge-busy'}">${p.stock}</span>
          </div>
          <div style="margin-top:0.5rem">
            <button class="btn btn-sm ${p.stock==='In Stock'?'btn-red':'btn-green'}" onclick="toggleStock('${p.id}','${p.stock}')">${p.stock==='In Stock'?'Mark Out of Stock':'Mark In Stock'}</button>
          </div>
        </div>
      </div>`).join('')+'</div>';
  }catch(e){ container.innerHTML=`<p style="color:var(--red);padding:1rem">Error loading products.</p>`; console.error(e); }
}

async function toggleStock(pid, currentStock){
  const newStock = currentStock==='In Stock' ? 'Out of Stock' : 'In Stock';
  showLoader('Updating stock...');
  try{
    await dbUpdateProduct(pid,{stock:newStock});
    hideLoader();
    showToast('Stock status updated','success');
    renderHwProducts();
    renderShop();
  }catch(e){ hideLoader(); showToast('Update failed','error'); console.error(e); }
}

// ─── SHOP ────────────────────────────────────────────────
async function renderShop(){
  const search   = document.getElementById('shop-search')?.value||'';
  const container= document.getElementById('shop-products');
  const empty    = document.getElementById('shop-empty');
  container.innerHTML='<p style="color:var(--text-soft);padding:1rem;grid-column:1/-1">Loading products...</p>';
  try{
    let products = await dbGetProducts(search);
    products = products.filter(p=>p.stock==='In Stock');
    if(!products.length){
      container.innerHTML='';
      empty.style.display='block';
      return;
    }
    empty.style.display='none';
    container.innerHTML=products.map(p=>`
      <div class="product-card">
        <div class="product-img">${p.img?`<img src="${p.img}" alt="${p.name}">`:`🧱`}</div>
        <div class="product-body">
          <div class="product-name">${p.name}</div>
          <div class="product-price">UGX ${Number(p.price).toLocaleString()}</div>
          <div class="product-desc">${(p.desc||'').slice(0,70)}${(p.desc||'').length>70?'...':''}</div>
          <div class="product-tags">
            <span class="badge badge-orange" style="font-size:10px">${p.delivery}</span>
            <span class="badge badge-navy" style="font-size:10px">${p.payment}</span>
          </div>
          <div style="display:flex;gap:0.5rem;margin-top:0.75rem">
            <button class="btn btn-navy btn-sm" onclick="openProductModal('${p.id}')">Details</button>
            <button class="btn btn-orange btn-sm" onclick="addToCart('${p.id}')">Add to Cart</button>
          </div>
        </div>
      </div>`).join('');
  }catch(e){ container.innerHTML=`<p style="color:var(--red);padding:1rem;grid-column:1/-1">Error loading shop. Check Firebase connection.</p>`; console.error(e); }
}

async function openProductModal(pid){
  showLoader('Loading product...');
  try{
    const snap=await db.collection('products').doc(pid).get();
    hideLoader();
    if(!snap.exists) return;
    const p={id:snap.id,...snap.data()};
    currentModalProduct=p;
    document.getElementById('pmodal-name').textContent=p.name;
    document.getElementById('pmodal-body').innerHTML=`
      ${p.img?`<img src="${p.img}" style="width:100%;height:200px;object-fit:cover;border-radius:10px;margin-bottom:1rem">`:`<div style="font-size:60px;text-align:center;padding:1rem">🧱</div>`}
      <div style="font-size:22px;font-weight:800;color:var(--orange);margin-bottom:0.5rem">UGX ${Number(p.price).toLocaleString()}</div>
      <p style="font-size:14px;color:var(--text-soft);line-height:1.6;margin-bottom:1rem">${p.desc||'No description provided.'}</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;font-size:13px">
        <div><strong>Supplier:</strong> ${p.supplierName}</div>
        <div><strong>Stock:</strong> <span class="badge ${p.stock==='In Stock'?'badge-free':'badge-busy'}">${p.stock}</span></div>
        <div><strong>Delivery:</strong> ${p.delivery}</div>
        <div><strong>Payment:</strong> ${p.payment}</div>
      </div>`;
    openModal('product-modal');
  }catch(e){ hideLoader(); showToast('Error loading product','error'); console.error(e); }
}

function addToCartFromModal(){
  if(currentModalProduct) addToCart(currentModalProduct.id);
  closeModal('product-modal');
}

// ─── CART ─────────────────────────────────────────────────
async function addToCart(pid){
  showLoader('Adding to cart...');
  try{
    const snap=await db.collection('products').doc(pid).get();
    hideLoader();
    if(!snap.exists){ showToast('Product not found','error'); return; }
    const p={id:snap.id,...snap.data()};
    if(p.stock!=='In Stock'){ showToast('This item is out of stock','warn'); return; }
    const c=getCart();
    const existing=c.find(i=>i.id===pid);
    if(existing){ existing.qty=(existing.qty||1)+1; }
    else{ c.push({...p,qty:1}); }
    saveCart(c);
    showToast(p.name+' added to cart! 🛒','success');
  }catch(e){ hideLoader(); showToast('Error: '+e.message,'error'); console.error(e); }
}

function updateCartBadge(){
  const total=cart.reduce((s,i)=>s+(i.qty||1),0);
  const badge=document.getElementById('cart-count');
  if(badge){ badge.textContent=total; badge.style.display=total>0?'flex':'none'; }
}

function renderCart(){
  cart=getCart();
  const container=document.getElementById('cart-items-list');
  const empty    =document.getElementById('cart-empty');
  const summary  =document.getElementById('cart-summary');
  if(!cart.length){
    container.innerHTML=''; empty.style.display='block'; summary.style.display='none'; return;
  }
  empty.style.display='none'; summary.style.display='block';
  container.innerHTML=cart.map(item=>`
    <div class="cart-item">
      <div class="cart-item-img">${item.img?`<img src="${item.img}">`:'🧱'}</div>
      <div class="cart-item-info">
        <div class="cart-item-name">${item.name}</div>
        <div class="cart-item-price">UGX ${Number(item.price).toLocaleString()} × ${item.qty||1} = UGX ${Number(item.price*(item.qty||1)).toLocaleString()}</div>
        <div class="cart-item-tags">
          <span class="badge badge-orange" style="font-size:10px">${item.delivery}</span>
          <span class="badge badge-navy" style="font-size:10px">${item.payment}</span>
        </div>
        <div style="font-size:12px;color:var(--text-soft);margin-top:4px">Supplier: ${item.supplierName}</div>
      </div>
      <button class="remove-btn" onclick="removeFromCart('${item.id}')">🗑</button>
    </div>`).join('');
  const total=cart.reduce((s,i)=>s+i.price*(i.qty||1),0);
  document.getElementById('cart-total').textContent='UGX '+total.toLocaleString();
}

function removeFromCart(pid){
  const c=getCart().filter(i=>i.id!==pid);
  saveCart(c);
  renderCart();
}

function placeOrder(){
  if(!currentUser){ showToast('Please log in to place an order','warn'); goTo('login'); return; }
  const c=getCart();
  if(!c.length){ showToast('Your cart is empty','warn'); return; }
  const bySupplier={};
  c.forEach(item=>{
    if(!bySupplier[item.supplierPhone]) bySupplier[item.supplierPhone]={name:item.supplierName,items:[]};
    bySupplier[item.supplierPhone].items.push(item);
  });
  const total=c.reduce((s,i)=>s+i.price*(i.qty||1),0);
  Object.entries(bySupplier).forEach(([phone,data])=>{
    const wa=phone.replace(/\D/g,'');
    const waNum=wa.startsWith('0')?'256'+wa.slice(1):wa;
    const itemList=data.items.map(i=>`- ${i.name} x${i.qty||1}: UGX ${Number(i.price*(i.qty||1)).toLocaleString()}`).join('\n');
    const msg=encodeURIComponent(`📦 *New BuildEasy Order*\n\nCustomer: ${currentUser.name}\nContact: ${currentUser.phone}\nLocation: ${currentUser.location}\n\nItems:\n${itemList}\n\nTotal: UGX ${total.toLocaleString()}\n\nPlease confirm this order.`);
    window.open(`https://wa.me/${waNum}?text=${msg}`,'_blank');
  });
  showToast('Order placed successfully! 🎉','success');
  saveCart([]);
  renderCart();
}

// ─── REVIEWS ─────────────────────────────────────────────
async function renderReviews(){
  const container=document.getElementById('reviews-list');
  if(!container) return;
  try{
    const reviews=await dbGetReviews();
    if(!reviews.length){
      container.innerHTML='<p style="color:var(--text-soft);text-align:center;padding:2rem;grid-column:1/-1">No reviews yet — be the first!</p>';
      return;
    }
    container.innerHTML=reviews.map(r=>`
      <div class="review-card">
        <div class="review-header">
          <div class="review-avatar">${(r.name||'U').charAt(0).toUpperCase()}</div>
          <div>
            <div class="review-name">${r.name}</div>
            <div class="review-role">${r.role}</div>
          </div>
        </div>
        <p class="review-text">"${r.text}"</p>
      </div>`).join('');
  }catch(e){ container.innerHTML='<p style="color:var(--text-soft);text-align:center;padding:2rem;grid-column:1/-1">Could not load reviews.</p>'; console.warn(e); }
}

async function submitReview(){
  const name=document.getElementById('rev-name').value.trim();
  const role=document.getElementById('rev-role').value;
  const text=document.getElementById('rev-text').value.trim();
  if(!name||!text){ showToast('Please fill all fields','error'); return; }
  showLoader('Submitting review...');
  try{
    await dbAddReview({name,role,text});
    hideLoader();
    await renderReviews();
    closeModal('review-modal');
    document.getElementById('rev-name').value='';
    document.getElementById('rev-text').value='';
    showToast('Thank you for your review! 🙏','success');
  }catch(e){ hideLoader(); showToast('Submit failed: '+e.message,'error'); console.error(e); }
}

// ─── CUSTOMER CARE ────────────────────────────────────────
function submitCare(){
  const name    =document.getElementById('care-name').value.trim();
  const contact =document.getElementById('care-contact').value.trim();
  const complaint=document.getElementById('care-complaint').value.trim();
  if(!name||!contact||!complaint){ showToast('Please fill all fields','error'); return; }
  // ⚠️ Replace with your real Gmail address below
  const YOUR_EMAIL='kalemeragodwin@gmail.com';
  const subject=encodeURIComponent('BuildEasy Complaint — '+name);
  const body   =encodeURIComponent(`Name: ${name}\nContact: ${contact}\n\nComplaint:\n${complaint}`);
  window.open(`mailto:${YOUR_EMAIL}?subject=${subject}&body=${body}`,'_blank');
  closeModal('care-modal');
  document.getElementById('care-name').value='';
  document.getElementById('care-contact').value='';
  document.getElementById('care-complaint').value='';
  showToast('Complaint submitted! We will respond soon.','success');
}

// ─── RESEARCH ────────────────────────────────────────────
function openResearchModal(type){
  const titles={customer:'Homeowner Survey',artisan:'Artisan Survey',hardware:'Supplier Survey'};
  document.getElementById('research-modal-title').textContent=titles[type]||'Research Survey';
  const forms={
    customer:`
      <div class="form-group"><label>How often do you need construction services?</label><select class="form-control" id="r1"><option>Monthly</option><option>Quarterly</option><option>Annually</option><option>Rarely</option></select></div>
      <div class="form-group"><label>Biggest challenge finding artisans?</label><textarea class="form-control" id="r2" placeholder="Describe your challenge..."></textarea></div>
      <div class="form-group"><label>Would you use an app for projects and payments?</label><select class="form-control" id="r3"><option>Yes, definitely</option><option>Maybe</option><option>No</option></select></div>
      <div class="form-group"><label>Budget for premium features/month (UGX)</label><input class="form-control" id="r4" placeholder="e.g. 10000"></div>`,
    artisan:`
      <div class="form-group"><label>How do you currently find clients?</label><textarea class="form-control" id="r1" placeholder="Word of mouth, social media..."></textarea></div>
      <div class="form-group"><label>Biggest challenge in your trade?</label><textarea class="form-control" id="r2" placeholder="Payment, finding jobs..."></textarea></div>
      <div class="form-group"><label>Would BuildEasy help your business?</label><select class="form-control" id="r3"><option>Yes, very much</option><option>Somewhat</option><option>Not sure</option></select></div>
      <div class="form-group"><label>Your district</label><select class="form-control" id="r4"><option>Kampala</option><option>Wakiso</option><option>Mukono</option><option>Jinja</option><option>Other</option></select></div>`,
    hardware:`
      <div class="form-group"><label>How do customers find your store?</label><textarea class="form-control" id="r1" placeholder="Walk-in, referrals..."></textarea></div>
      <div class="form-group"><label>Products most in demand?</label><textarea class="form-control" id="r2" placeholder="Cement, tiles, timber..."></textarea></div>
      <div class="form-group"><label>Would you list products on BuildEasy?</label><select class="form-control" id="r3"><option>Yes</option><option>Maybe</option><option>No</option></select></div>
      <div class="form-group"><label>Monthly sales volume approx (UGX)</label><input class="form-control" id="r4" placeholder="e.g. 5,000,000"></div>`
  };
  document.getElementById('research-form').innerHTML=forms[type]||'';
  document.getElementById('research-modal').dataset.type=type;
  openModal('research-modal');
}

async function submitResearch(){
  const type=document.getElementById('research-modal').dataset.type;
  const r1=document.getElementById('r1')?.value||'';
  const r2=document.getElementById('r2')?.value||'';
  const r3=document.getElementById('r3')?.value||'';
  const r4=document.getElementById('r4')?.value||'';
  showLoader('Submitting survey...');
  try{
    await db.collection('research').add({type,r1,r2,r3,r4,createdAt:firebase.firestore.FieldValue.serverTimestamp()});
    hideLoader();
    closeModal('research-modal');
    showToast('Survey submitted! Thank you for contributing','success');
  }catch(e){ hideLoader(); showToast('Submit failed: '+e.message,'error'); console.error(e); }
}

// ─── MODALS ───────────────────────────────────────────────
function openModal(id){  document.getElementById(id).classList.add('open'); }
function closeModal(id){ document.getElementById(id).classList.remove('open'); }
document.querySelectorAll('.modal-overlay').forEach(o=>{
  o.addEventListener('click',e=>{ if(e.target===o) o.classList.remove('open'); });
});

// ─── TOAST ───────────────────────────────────────────────
function showToast(msg, type=''){
  const t=document.getElementById('toast');
  t.textContent=msg;
  t.className='toast'+(type?' '+type:'');
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),3400);
}
