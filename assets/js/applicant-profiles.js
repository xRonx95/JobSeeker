/* Applicant records are fetched only after a reviewer opens an application. */
(() => {
  'use strict';
  const groups = [
    ['Personal information', 'personal', [['birth_date','Date of birth'],['nationality','Nationality'],['civil_status','Civil status']]],
    ['Education','education',[['attainment','Educational attainment'],['school','School / Institution'],['course','Course / Degree / Strand'],['graduation_year','Graduation year'],['certifications','Certifications and training']]],
    
    ['Background','background',[['recent_position','Most recent position'],['recent_employer','Most recent employer'],['experience_years','Years of experience'],['availability','Availability'],['skills','Skills'],['languages','Languages'],['experience_summary','Experience summary']]],
  ];
  window.IsabelaApplicantProfiles = {
    bind({ client, canView, esc }) {
      const dialog = document.createElement('dialog');
      dialog.id = 'applicantProfileDialog'; dialog.className = 'modal applicant-profile-dialog';
      dialog.setAttribute('aria-labelledby','applicantProfileTitle');
      dialog.innerHTML = '<div class="dialog-body"><button type="button" class="modal-close" aria-label="Close applicant information">×</button><span class="section-kicker">APPLICATION REVIEW</span><h2 id="applicantProfileTitle">Applicant personal information</h2><div id="applicantProfileBody" aria-live="polite"></div><button type="button" class="btn applicant-profile-done">Close</button></div>';
      document.body.append(dialog);
      const body = dialog.querySelector('#applicantProfileBody');
      let version = 0;
      dialog.querySelectorAll('.modal-close,.applicant-profile-done').forEach(button => button.addEventListener('click',()=>dialog.close()));
      dialog.addEventListener('close',()=>{if(!dialog.open){version++;body.replaceChildren();}});
      const rows = (data, fields) => fields.map(([key,label])=>`<div><dt>${esc(label)}</dt><dd>${esc(data?.[key] == null || data[key] === '' ? 'Not provided' : data[key])}</dd></div>`).join('');
      document.addEventListener('click',async event=>{
        const button = event.target.closest('[data-applicant-profile]');
        if(!button || !canView())return;
        const id = button.dataset.applicantProfile, current = ++version;
        body.textContent = 'Loading applicant information…';body.setAttribute('aria-busy','true');
        if(!dialog.open)dialog.showModal();dialog.scrollTop=0;
        try {
          const {data,error}=await client().rpc('get_application_seeker_information',{p_application_id:id});
          if(error)throw error;
          if(current!==version || !dialog.open)return;
          if(!data)throw new Error('This applicant record is unavailable.');
          body.innerHTML = `<p class="applicant-profile-note">Current information provided by the applicant. Empty fields are shown as “Not provided”.</p><section><h3>Contact details</h3><dl class="applicant-detail-grid">${rows(data,[['full_name','Full name'],['email','Email'],['phone','Phone'],['location','Location'],['bio','Professional summary']])}</dl></section>`+
            groups.map(([title,key,fields])=>`<section><h3>${esc(title)}</h3><dl class="applicant-detail-grid">${rows(data[key],fields)}</dl></section>`).join('');
        }catch(error){
          if(current!==version || !dialog.open)return;
          const message=['PGRST202','42883'].includes(error.code)
            ? 'Applicant information access needs setup. Ask the site owner to apply migrations/006-applicant-information-access.sql.'
            : error.message || 'Unable to load applicant information. Please try again.';
          body.innerHTML=`<p role="alert">${esc(message)}</p><button type="button" class="mini" data-applicant-profile="${esc(id)}">Try again</button>`;
        }finally{if(current===version)body.removeAttribute('aria-busy');}
      });
    },
  };
})();
