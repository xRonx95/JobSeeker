/* Exact database totals and server-side pagination for administrator records. */
(() => {
  'use strict';
  window.IsabelaAdminDashboard = {
    create(ctx) {
      const $ = selector => document.querySelector(selector);
      const size = 25, e = ctx.esc;
      let page = 1, lastTab = '', applicationsPage = 1, version = 0;
      const tabs = [['companies','Companies'],['jobs','Job moderation'],['users','All users'],['applications','Applications']];
      async function result(request) {
        const response = await request;
        if (response.error) throw response.error;
        return response;
      }
      async function count(request) {
        const response = await result(request);
        if (!Number.isInteger(response.count)) throw new Error('Unable to load the dashboard totals. Please retry.');
        return response.count;
      }
      function pager(total, current, attribute) {
        const pages = Math.max(1, Math.ceil(total / size));
        return `<div class="pagination admin-pagination" aria-label="Record pages"><button type="button" class="mini" ${attribute}="${current-1}" ${current===1?'disabled':''}>← Previous</button><span>${total?`${((current-1)*size+1).toLocaleString()}–${Math.min(current*size,total).toLocaleString()} of ${total.toLocaleString()}`:'0 records'} · Page ${current} of ${pages}</span><button type="button" class="mini" ${attribute}="${current+1}" ${current>=pages?'disabled':''}>Next →</button></div>`;
      }
      function listQuery(tab) {
        const sb = ctx.client();
        if (tab==='companies') return sb.from('profiles').select('*',{count:'exact'}).eq('role','company');
        if (tab==='users') return sb.from('profiles').select('*',{count:'exact'});
        if (tab==='jobs') return sb.from('jobs').select('*,profiles!jobs_company_id_fkey(company_name,email)',{count:'exact'});
        return sb.from('applications').select('*,profiles!applications_seeker_id_fkey(full_name,email,phone),jobs(title,company_name)',{count:'exact'});
      }
      async function records(tab,current) {
        const response = await result(listQuery(tab).order('created_at',{ascending:false}).order('id',{ascending:false}).range((current-1)*size,current*size-1));
        if (!Number.isInteger(response.count)) throw new Error('Unable to load the record count. Please retry.');
        const pages = Math.max(1,Math.ceil(response.count/size));
        if(current>pages)return records(tab,pages);
        return {rows:response.data||[],total:response.count,page:current};
      }
      async function tableFor(tab,rows) {
        if(tab==='companies')return ctx.table(['Company','Email','Owner','Status','Registered','Action'],rows.map(p=>`<tr><td><strong>${e(p.company_name||'Unnamed')}</strong></td><td>${e(p.email)}</td><td>${e(p.full_name)}</td><td>${ctx.badge(p.approval_status)}</td><td>${ctx.fmt(p.created_at)}</td><td>${ctx.statusSelect(p)}</td></tr>`).join(''));
        if(tab==='users')return ctx.table(['Name','Email','Role','Status','Registered','Action'],rows.map(p=>`<tr><td><strong>${e(p.full_name||'Member')}</strong></td><td>${e(p.email)}</td><td>${ctx.badge(p.role)}</td><td>${ctx.badge(p.approval_status)}</td><td>${ctx.fmt(p.created_at)}</td><td>${ctx.statusSelect(p)}</td></tr>`).join(''));
        if(tab==='jobs')return ctx.table(['Position','Employer','Category','Posted','Status','Moderation'],rows.map(j=>`<tr><td><strong>${e(j.title)}</strong><small>${e(j.location)}</small></td><td>${e(j.profiles?.company_name||j.company_name||'Employer')}</td><td>${e(j.category)}</td><td>${ctx.fmt(j.created_at)}</td><td>${ctx.badge(j.status)}</td><td><select aria-label="Job moderation" data-job-status="${e(j.id)}">${['pending','approved','rejected','closed'].map(s=>`<option ${s===j.status?'selected':''}>${s}</option>`).join('')}</select></td></tr>`).join(''));
        const applications = await Promise.all(rows.map(async a=>`<tr><td><strong>${e(a.jobs?.title||'Job')}</strong><small>${e(a.profiles?.full_name||'Applicant')} · ${e(a.profiles?.email||'')}</small><button type="button" class="mini" data-applicant-profile="${e(a.id)}">View personal information</button></td><td>${ctx.badge(a.status)}</td><td>${ctx.fmt(a.created_at)}</td><td><div class="prewrap">${e(a.cover_letter||'')}</div></td><td>${await ctx.docLinks(a.document_paths)}</td><td><select aria-label="Application status" data-application-status="${e(a.id)}">${['submitted','reviewing','shortlisted','rejected','hired'].map(s=>`<option ${s===a.status?'selected':''}>${s}</option>`).join('')}</select></td></tr>`));
        return ctx.table(['Position / Applicant','Status','Date','Message','Documents','Action'],applications.join(''));
      }
      async function render() {
        if(!ctx.isAdmin())return;
        const target=$('#adminContent'), current=++version, tab=ctx.getTab();
        if(tab!==lastTab){page=1;lastTab=tab;}
        target.setAttribute('aria-busy','true');
        const sb=ctx.client();
        try {
          const [users,pendingCompanies,pendingJobs,applications,list]=await Promise.all([
            count(sb.from('profiles').select('id',{head:true,count:'exact'})),
            count(sb.from('profiles').select('id',{head:true,count:'exact'}).eq('role','company').eq('approval_status','pending')),
            count(sb.from('jobs').select('id',{head:true,count:'exact'}).eq('status','pending')),
            count(sb.from('applications').select('id',{head:true,count:'exact'})),
            records(tab,page),
          ]);
          const table=await tableFor(tab,list.rows);
          if(current!==version)return;
          page=list.page;
          target.innerHTML=`<div class="section-head"><h2>Portal administration</h2><button class="btn small" data-manage-resources>Manage fairs, training &amp; advice</button><button class="btn small" data-add-user>+ Add user</button></div><div class="stats-row">${[[users,'Registered users'],[pendingCompanies,'Pending companies'],[pendingJobs,'Jobs awaiting review'],[applications,'Applications']].map(([value,label])=>`<div class="stat-mini"><b>${value.toLocaleString()}</b><span>${label}</span></div>`).join('')}</div><div class="panel"><div class="tabs">${tabs.map(([id,label])=>`<button class="tab ${tab===id?'active':''}" data-admin-tab="${id}">${label}</button>`).join('')}</div>${table}${pager(list.total,page,'data-admin-page')}</div>`;
        } catch(error) { if(current===version){target.innerHTML='<div class="note" role="alert">Unable to load administrator records. <button class="text-button" data-admin-retry>Try again</button></div>';ctx.err(error);} }
        finally{if(current===version)target.removeAttribute('aria-busy');}
      }
      async function renderApplications() {
        if(!ctx.isAdmin())return;
        const target=$('#applicationsContent'); target.setAttribute('aria-busy','true');
        try { const list=await records('applications',applicationsPage);applicationsPage=list.page;target.innerHTML=(await tableFor('applications',list.rows))+pager(list.total,list.page,'data-admin-app-page'); }
        finally{target.removeAttribute('aria-busy');}
      }
      document.addEventListener('click',event=>{
        const button=event.target.closest('[data-admin-page],[data-admin-app-page],[data-admin-retry]');
        if(!button||button.disabled||!ctx.isAdmin())return;
        if(button.hasAttribute('data-admin-page')){page=Math.max(1,Number(button.dataset.adminPage));render();}
        else if(button.hasAttribute('data-admin-app-page')){applicationsPage=Math.max(1,Number(button.dataset.adminAppPage));renderApplications().catch(ctx.err);}
        else render();
      });
      return {render,renderApplications};
    },
  };
})();
