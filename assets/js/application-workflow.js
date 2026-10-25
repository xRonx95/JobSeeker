(() => {
  window.HapApplication={create({client,user,notify,done}){
    const form=document.querySelector('#applyForm'),button=form.querySelector('[type=submit]');
    let job=null,policies=null,busy=false,reviewed=false,key=null,uploaded=[],generation=0;
    const panel=document.createElement('section');panel.className='application-review';
    panel.innerHTML='<h3>Job Application Agreement</h3><p id="applicationRecipient"></p><button class="mini" type="button" id="reviewApplication">Review application</button><div id="applicationSummary" class="prewrap" hidden></div><p>By submitting, I request that HapIsabela transmit the information and documents identified above to the named employer for this vacancy. The employer may assess my suitability under the Privacy Notice and its disclosed recruitment practices. I confirm accuracy to the best of my knowledge. Submission does not guarantee an interview, offer, or hiring.</p><p><a href="/application-policy.html" target="_blank" rel="noopener">Read the full Application Agreement</a> · <a href="/privacy.html" target="_blank" rel="noopener">Privacy Notice</a></p><label class="inline-check"><input type="checkbox" id="applicationAccurate"> My details are accurate to the best of my knowledge.</label><label class="inline-check"><input type="checkbox" id="applicationSharing"> I understand the information and documents shared with the named employer.</label><label class="inline-check"><input type="checkbox" id="applicationAgreement"> I have read and agree to the Job Application Agreement.</label><p id="applicationState" role="status"></p><button type="button" class="mini" id="cancelApplication">Cancel</button>';
    button.before(panel);button.textContent='Confirm and submit application';
    const $=s=>panel.querySelector(s),checks=[...panel.querySelectorAll('[type=checkbox]')];
    const update=()=>{button.disabled=busy||!policies||!reviewed||checks.some(c=>!c.checked);};
    const resetReview=()=>{reviewed=false;checks.forEach(c=>c.checked=false);$('#applicationSummary').hidden=true;update();};
    form.querySelector('[name=cover_letter]').addEventListener('input',resetReview);document.querySelector('#documentsInput').addEventListener('change',()=>{key=crypto.randomUUID();uploaded=[];resetReview();});
    checks.forEach(c=>c.addEventListener('change',update));
    $('#cancelApplication').addEventListener('click',()=>{if(!busy)document.querySelector('#applyDialog').close();});
    function files(){const list=[...document.querySelector('#documentsInput').files];if(!list.length||list.length>12||list.some(f=>f.size===0||f.size>5242880||!['application/pdf','image/jpeg','image/png','application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(f.type)))throw Error('Choose 1–12 PDF, JPG, PNG, or DOCX documents, each up to 5 MB.');return list;}
    $('#reviewApplication').addEventListener('click',()=>{try{const list=files();$('#applicationSummary').textContent=`Vacancy: ${job.title}\nEmployer: ${job.company_name}\nDeadline: ${job.deadline?new Date(job.deadline).toLocaleString('en-PH',{timeZone:'Asia/Manila'})+' Philippine time':'Not specified'}\nShared: name, email, phone, location, summary, education and professional background as recorded at submission. Family and unrelated sensitive characteristics are excluded.\nDocuments:\n${list.map(f=>f.name+' ('+Math.ceil(f.size/1024)+' KB)').join('\n')}\nCover letter:\n${form.elements.cover_letter.value}`;$('#applicationSummary').hidden=false;reviewed=true;update();}catch(e){notify(e.message,'error');}});
    return {
      async prepare(selected){job=selected;policies=null;key=crypto.randomUUID();uploaded=[];resetReview();const current=++generation;
        $('#applicationRecipient').textContent=`Receiving employer: ${job.company_name}. Vacancy: ${job.title}.`;
        $('#applicationState').textContent='Loading current policy versions…';
        try{const result=await window.HapPolicies.current(client(),['application','privacy']);if(current!==generation)return;policies=result;$('#applicationState').textContent=`Agreement ${result.application.version} · Privacy ${result.privacy.version}`;update();}catch(e){$('#applicationState').textContent=e.message;}
      },
      async submit(){if(busy)return;if(!reviewed||!policies||checks.some(c=>!c.checked))return notify('Review this application and complete all three acknowledgments.','error');busy=true;update();
        try{const list=files();$('#applicationState').textContent='Uploading selected documents…';
          for(let index=uploaded.length;index<list.length;index++){const f=list[index],ext=f.name.split('.').pop().toLowerCase(),path=`${user().id}/staging/${key}/${crypto.randomUUID()}.${ext}`;
            const {error}=await client().storage.from('application-documents').upload(path,f,{upsert:false,contentType:f.type});if(error)throw error;uploaded.push({path,name:f.name});}
          $('#applicationState').textContent='Confirming submission and agreement…';
          const {data,error}=await client().rpc('submit_agreed_application',{p_job:job.id,p_submission:key,p_cover:form.elements.cover_letter.value,p_files:uploaded,p_agreement:policies.application.id,p_privacy:policies.privacy.id,p_ack:{accurate:true,sharing:true,agreement:true}});
          if(error)throw error;if(!data?.reference)throw Error('The submission result could not be verified. Check Applications before retrying.');
          document.querySelector('#applyDialog').close();notify('Application submitted. Reference: '+data.reference);await done();
        }catch(e){notify((e.message||'Submission interrupted.')+' Check Applications before retrying if the connection was interrupted.','error');}
        finally{busy=false;update();}
      },
    };
  }};
})();
