/* Shared vacancy filters and career resources. No privileged credentials. */
((root) => {
  'use strict';
  const escape = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function filterJobs(jobs, filters) {
    const term = (filters.term || '').trim().toLowerCase();
    const location = (filters.location || '').trim().toLowerCase();
    const selected = filters.audiences || [];
    return jobs.filter(j => (!term || [j.title,j.description,j.qualifications,j.company_name,j.location].join(' ').toLowerCase().includes(term)) &&
      (!location || (j.location || '').toLowerCase().includes(location)) &&
      (!filters.category || j.category === filters.category) && (!filters.type || j.employment_type === filters.type) &&
      (!selected.length || selected.some(tag => (j.audiences || []).includes(tag))) &&
      (!filters.companyId || j.company_id === filters.companyId) &&
      (!filters.savedOnly || filters.savedIds?.has(j.id)))
      .sort((a,b) => filters.sort === 'title' ? a.title.localeCompare(b.title) : filters.sort === 'company' ? a.company_name.localeCompare(b.company_name) : filters.sort === 'oldest' ? new Date(a.created_at)-new Date(b.created_at) : new Date(b.created_at)-new Date(a.created_at));
  }
  function safeLink(value) {
    try { const url = new URL(value); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; }
  }
  const guides = [
    {id:'interview',kind:'advice',title:'Walk into your next interview with confidence',description:'Prepare your examples, ask thoughtful questions, and make a strong first impression.',body:'Before the interview\nRead the job description and learn about the employer. Prepare two or three examples of your skills using the situation, task, action, result approach. Practice explaining why you are interested in this role.\n\nOn the day\nCheck the venue or video link in advance. Bring your résumé and requested documents. Arrive early, listen carefully, and ask for clarification when needed.\n\nQuestions worth asking\nWhat would success look like in the first three months? What does a typical workday involve? What are the next steps in the hiring process?\n\nAfter the interview\nSend a brief thank-you through the employer’s stated contact channel. Keep a record of the role and follow-up date.'},
    {id:'resume',kind:'advice',title:'Your résumé and application checklist',description:'Give employers a clear picture of your experience, skills, and potential.',body:'Start with the essentials\nInclude your name, professional email, phone number, and general location. Avoid including passwords, bank details, or unrelated sensitive information.\n\nTailor your résumé\nHighlight experience and skills that match the vacancy. Include relevant projects, volunteer work, or school activities if you are applying for your first job. Describe achievements using concrete examples.\n\nBefore submitting\nCheck spelling and contact details. Use a readable layout and a clear filename. Upload only documents requested by the employer and review your cover letter for the correct company and job title.\n\nTrack your applications\nUse the Applications page to review your submission status. An application does not guarantee an interview or offer.'},
    {id:'safe-search',kind:'advice',title:'A safer job search starts with you',description:'Know what to check before sharing documents or accepting an offer.',body:'Check the employer\nConfirm the company name, business address, and contact details through independent channels. Portal approval is a moderation step and does not replace your own checks.\n\nProtect your information\nNever share your login credentials, one-time passwords, or bank access. Be cautious with unsolicited messages and offers that promise unusually high pay for little work.\n\nReview the offer\nAsk for written details about the role, pay, work location, and conditions. Do not pay to submit an application on this portal. If something feels wrong, pause and verify before proceeding.'},
  ];
  function create(ctx) {
    const $ = s => document.querySelector(s);
    let savedIds = new Set(), resources = [], employers = [], resourceToken = 0;
    let page = 1, signature = '', companyId = '', saving = new Set();
    const e = escape;
    const date = value => value ? new Date(value).toLocaleString('en-PH', {dateStyle:'medium',timeStyle:'short', timeZone:'Asia/Manila'}) + ' (Philippine time)' : '';
    async function query(request) { const {data,error} = await request; if (error) throw error; return data || []; }
    function failure(target,error) {
      target.innerHTML = `<div class="note" role="alert">${e(['PGRST205','PGRST202','42P01','42883'].includes(error.code) ? 'This feature needs the database upgrade. The project owner must run migrations/002-career-portal.sql in Supabase SQL Editor.' : error.message || 'Unable to load this section. Please try again.')}<p><button class="text-button" data-refresh-resources>Try again</button></p></div>`;
    }
    async function loadSaved() {
      savedIds = new Set();
      if (!ctx.user()) return;
      try { savedIds = new Set((await query(ctx.sb().from('saved_jobs').select('job_id').eq('user_id',ctx.user().id))).map(x=>x.job_id)); }
      catch (error) { if (!['PGRST205','42P01'].includes(error.code)) ctx.err(error); }
    }
    function jobList(jobs) {
      const filters = {
        term:$('#searchBox').value, location:$('#locationSearch').value, category:$('#categoryFilter').value,
        type:$('#typeFilter').value, sort:$('#sortJobs').value, audiences:[...document.querySelectorAll('[data-audience]:checked')].map(x=>x.dataset.audience),
        savedOnly:$('#savedOnly').checked, savedIds, companyId,
      };
      const nextSignature = JSON.stringify({...filters,savedIds:[...savedIds]});
      if (signature !== nextSignature) { page = 1; signature = nextSignature; }
      const matching = filterJobs(jobs,filters), pages = Math.max(1,Math.ceil(matching.length/10));
      page = Math.min(page,pages);
      $('#resultCount').textContent = `${matching.length.toLocaleString()} ${matching.length === 1 ? 'job opening' : 'job openings'}`;
      $('#jobPagination').innerHTML = matching.length > 10 ? `<button class="mini" data-job-page="${page-1}" ${page===1?'disabled':''}>← Previous</button><span>Page ${page} of ${pages}</span><button class="mini" data-job-page="${page+1}" ${page===pages?'disabled':''}>Next →</button>` : '';
      $('#jobGrid').innerHTML = matching.length ? matching.slice((page-1)*10,page*10).map(j => `<article class="vacancy-row"><div class="employer-monogram" aria-hidden="true">${e((j.company_name || 'IC').split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase())}</div><div class="vacancy-information"><button class="vacancy-title" data-details="${e(j.id)}">${e(j.title)}</button><p class="vacancy-company">${e(j.company_name || 'Employer')}</p><div class="vacancy-meta"><span>⌖ ${e(j.location)}</span><span>◷ ${e(j.employment_type)}</span><span>${e(j.category)}</span></div>${j.audiences?.length?`<div class="audience-tags">${j.audiences.map(x=>`<span>${e({'pwd':'PWD inclusive','overseas':'Overseas','high-school':'High school graduates','government':'Government'}[x] || x)}</span>`).join('')}</div>`:''}</div><div class="vacancy-aside"><strong>${e(j.salary || 'Salary not specified')}</strong><small>Posted ${ctx.fmt(j.created_at)}</small><button class="save-job ${savedIds.has(j.id)?'is-saved':''}" data-save-job="${e(j.id)}" aria-pressed="${savedIds.has(j.id)}" aria-label="${savedIds.has(j.id)?'Unsave':'Save'} ${e(j.title)}">${savedIds.has(j.id)?'♥ Saved':'♡ Save job'}</button></div></article>`).join('') : `<div class="empty"><h3>No vacancies found</h3><p>${filters.savedOnly && !ctx.user()?'Log in to save vacancies and see them here.':'Try another keyword or clear the filters. New approved vacancies will appear here.'}</p><button class="text-button" data-reset-jobs>Clear filters</button></div>`;
      const groups = new Map();
      jobs.forEach(j=>{const name=j.title.trim();groups.set(name,(groups.get(name)||0)+1);});
      $('#topOpenings').innerHTML = [...groups].sort((a,b)=>b[1]-a[1]).slice(0,7).map(([title,count])=>`<button class="top-opening" data-job-title="${e(title)}"><span>${e(title)}</span><small>${count}</small></button>`).join('') || '<p class="muted">Approved openings will appear here.</p>';
    }
    function resetFilters() {
      ['searchBox','locationSearch','categoryFilter','typeFilter'].forEach(id=>$('#'+id).value='');
      document.querySelectorAll('[data-audience],#savedOnly').forEach(x=>x.checked=false);
      $('#sortJobs').value='newest'; page=1; companyId=''; ctx.renderJobs();
    }
    async function saveJob(id) {
      if (!ctx.user()) return ctx.showAuth();
      if (saving.has(id)) return;
      saving.add(id);
      try {
        if (savedIds.has(id)) { await query(ctx.sb().from('saved_jobs').delete().eq('job_id',id).eq('user_id',ctx.user().id)); savedIds.delete(id); }
        else { await query(ctx.sb().from('saved_jobs').upsert({job_id:id,user_id:ctx.user().id},{onConflict:'user_id,job_id',ignoreDuplicates:true})); savedIds.add(id); }
        ctx.renderJobs();
      } catch(error) { ctx.err(['PGRST205','42P01'].includes(error.code)?new Error('Saving jobs requires migrations/002-career-portal.sql. Ask the project owner to apply the database upgrade.'):error); }
      finally { saving.delete(id); }
    }
    function resourceCard(r) {
      return `<article class="resource-card"><span class="section-kicker">${e({fair:'JOB FAIR',training:'TRAINING',advice:'CAREER GUIDE'}[r.kind])}</span><h2>${e(r.title)}</h2><p>${e(r.description)}</p>${r.starts_at?`<p class="resource-date">${e(date(r.starts_at))}</p>`:''}${r.location?`<p>⌖ ${e(r.location)}</p>`:''}<button class="text-button" data-article="${e(r.id)}">${r.kind==='advice'?'Read guide':'View details'} →</button></article>`;
    }
    async function renderResources(view) {
      const target = $('#'+view+'Content'), token = ++resourceToken;
      target.innerHTML = '<p class="empty">Loading…</p>';
      if (view === 'employers') {
        try { employers = await query(ctx.sb().rpc('list_approved_employers')); if(token===resourceToken) renderEmployers(); }
        catch(error){if(token===resourceToken) failure(target,error);}
        return;
      }
      const kind = {fairs:'fair',training:'training',advice:'advice'}[view];
      try {
        let request=ctx.sb().from('career_resources').select('*').eq('kind',kind).eq('published',true);
        if(kind!=='advice') request=request.gte('starts_at',new Date().toISOString()).order('starts_at');
        else request=request.order('created_at',{ascending:false});
        const data = await query(request);
        if(token!==resourceToken)return;
        resources = [...resources.filter(r=>r.kind!==kind),...data];
        const display = kind==='advice'?[...guides,...data]:data;
        target.innerHTML=display.map(resourceCard).join('')||`<div class="empty"><h3>No upcoming ${view==='fairs'?'job fairs':'training programs'} yet</h3><p>Check back for events published by HapIsabela.</p></div>`;
      } catch(error) { if(token===resourceToken) { if(kind==='advice')target.innerHTML=guides.map(resourceCard).join(''); else failure(target,error); } }
    }
    function renderEmployers() {
      const term=$('#employerSearch').value.trim().toLowerCase();
      $('#employersContent').innerHTML=employers.filter(r=>[r.company_name,r.location].join(' ').toLowerCase().includes(term)).map(r=>`<article class="resource-card employer-card"><div class="employer-monogram">${e((r.company_name||'Employer').slice(0,2).toUpperCase())}</div><span class="section-kicker">PORTAL APPROVED</span><h2>${e(r.company_name||'Employer')}</h2><p>${e(r.location||'Location not specified')}</p><p>${e(r.bio||'Explore opportunities with this employer.')}</p><button class="text-button" data-employer-jobs="${e(r.id)}">View ${Number(r.open_jobs)||0} open vacancies →</button></article>`).join('')||'<p class="empty">No approved employers match your search.</p>';
    }
    function showArticle(id) {
      const r=[...guides,...resources].find(x=>x.id===id); if(!r)return;
      $('#resourceDetail').innerHTML=`<span class="section-kicker">${e(r.kind==='advice'?'CAREER ADVICE':r.kind==='fair'?'JOB FAIR':'TRAINING')}</span><h2>${e(r.title)}</h2><p>${e(r.description)}</p>${r.starts_at?`<p>${e(date(r.starts_at))}</p>`:''}${r.location?`<p>Location: ${e(r.location)}</p>`:''}<div class="prewrap resource-body">${e(r.body)}</div>${safeLink(r.registration_url)?`<a class="btn" href="${e(safeLink(r.registration_url))}" target="_blank" rel="noopener noreferrer">Visit organizer / Register ↗</a>`:''}`;
      $('#resourceDialog').showModal();
    }
    async function adminResources() {
      const target=$('#adminContent');
      target.innerHTML='<p>Loading career content…</p>';
      try {
        const data=await query(ctx.sb().from('career_resources').select('*').order('created_at',{ascending:false}));
        resources=data;
        target.innerHTML=`<div class="section-head"><div><h2>Career content</h2><p>Publish job fairs, training programs, and career advice.</p></div><button class="mini" data-return-admin>← Moderation</button></div><form id="resourceEditor" class="panel form-panel"><input type="hidden" name="id"/><div class="form-grid"><label>Content type<select name="kind"><option value="fair">Job fair</option><option value="training">Training</option><option value="advice">Career advice</option></select></label><label>Title<input name="title" required maxlength="180"/></label><label>Location<input name="location" maxlength="200"/></label><label>Start date and time (Philippine time)<input name="starts_at" type="datetime-local"/></label><label>Organizer registration URL (HTTPS)<input name="registration_url" type="url" placeholder="https://…"/></label></div><label>Short description<textarea name="description" required maxlength="500"></textarea></label><label>Details / article text<textarea name="body" required rows="6" maxlength="16000"></textarea></label><label class="inline-check"><input type="checkbox" name="published"/> Publish on the portal</label><div class="editor-actions"><button class="btn" type="submit">Save content</button><button class="mini" type="reset">Clear editor</button></div></form><div class="resource-admin-list">${data.map(r=>`<div class="resource-admin-row"><div><strong>${e(r.title)}</strong><p>${e(r.kind)} · ${r.published?'Published':'Draft'}</p></div><button class="mini" data-edit-resource="${e(r.id)}">Edit</button><button class="mini warn" data-delete-resource="${e(r.id)}">Delete</button></div>`).join('')||'<p>No career content yet. Add your first item above.</p>'}</div>`;
        $('#resourceEditor').addEventListener('submit',submitResource);
      } catch(error){failure(target,error);}
    }
    async function submitResource(event) {
      event.preventDefault(); if(!ctx.isAdmin())return;
      const form=event.target, button=form.querySelector('[type="submit"]'), f=new FormData(form);
      const entry={kind:f.get('kind'),title:f.get('title').trim(),description:f.get('description').trim(),body:f.get('body').trim(),location:f.get('location').trim(),registration_url:f.get('registration_url').trim()||null,published:f.has('published'),starts_at:f.get('starts_at')?new Date(f.get('starts_at')+':00+08:00').toISOString():null};
      if(entry.kind!=='advice'&&!entry.starts_at)return ctx.toast('Set a start date for job fairs and training.','error');
      if(entry.registration_url&&!safeLink(entry.registration_url))return ctx.toast('Use a valid HTTPS registration URL.','error');
      button.disabled=true;
      try{await query(f.get('id')?ctx.sb().from('career_resources').update(entry).eq('id',f.get('id')):ctx.sb().from('career_resources').insert(entry));ctx.toast('Career content saved.');await adminResources();}
      catch(error){ctx.err(error);}finally{button.disabled=false;}
    }
    document.addEventListener('click',event=>{
      const x=event.target.closest('[data-save-job],[data-job-page],[data-job-title],[data-reset-jobs],[data-article],[data-hiring],[data-refresh-resources],[data-manage-resources],[data-edit-resource],[data-delete-resource],[data-return-admin],[data-employer-jobs]');
      if(!x)return;
      if(x.dataset.saveJob)saveJob(x.dataset.saveJob);
      if(x.dataset.jobPage){page=Math.max(1,Number(x.dataset.jobPage));ctx.renderJobs();$('#jobsArea').scrollIntoView({behavior:'smooth'});}
      if(x.dataset.jobTitle){resetFilters();$('#searchBox').value=x.dataset.jobTitle;ctx.renderJobs();}
      if(x.hasAttribute('data-reset-jobs'))resetFilters();
      if(x.dataset.article)showArticle(x.dataset.article);
      if(x.hasAttribute('data-hiring')){if(ctx.isCompany())ctx.go('post');else if(ctx.user())ctx.toast('An approved employer account is required to post a vacancy.','error');else ctx.showAuth('register');}
      if(x.hasAttribute('data-refresh-resources')){if(ctx.view()==='admin')adminResources();else renderResources(ctx.view());}
      if(x.hasAttribute('data-manage-resources')&&ctx.isAdmin())adminResources();
      if(x.hasAttribute('data-return-admin'))ctx.go('admin');
      if(x.dataset.editResource&&ctx.isAdmin()){
        const r=resources.find(r=>r.id===x.dataset.editResource),form=$('#resourceEditor');if(!r||!form)return;
        for(const key of ['id','kind','title','description','body','location','registration_url'])form.elements[key].value=r[key]||'';
        form.elements.published.checked=r.published;
        form.elements.starts_at.value=r.starts_at?new Date(new Date(r.starts_at).getTime()+8*3600000).toISOString().slice(0,16):'';
        form.scrollIntoView({behavior:'smooth'});form.elements.title.focus();
      }
      if(x.dataset.deleteResource&&ctx.isAdmin()&&confirm('Delete this career content?'))query(ctx.sb().from('career_resources').delete().eq('id',x.dataset.deleteResource)).then(async()=>{await adminResources();ctx.toast('Career content deleted.');}).catch(ctx.err);
      if(x.dataset.employerJobs){resetFilters();companyId=x.dataset.employerJobs;ctx.go('home');ctx.renderJobs();}
    });
    $('#clearFilters').addEventListener('click',resetFilters);
    $('#employerSearch').addEventListener('input',renderEmployers);
    ['sortJobs','savedOnly'].forEach(id=>$('#'+id).addEventListener('change',ctx.renderJobs));
    document.querySelectorAll('[data-audience]').forEach(x=>x.addEventListener('change',ctx.renderJobs));
    return {jobList,loadSaved,renderResources};
  }
  const api={filterJobs,safeLink,create};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.Vacancies=api;
})(typeof window!=='undefined'?window:globalThis);
