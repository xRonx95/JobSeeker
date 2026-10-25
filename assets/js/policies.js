(() => {
  const cache=new Map();
  window.HapPolicies={
    async current(client,types){
      const {data,error}=await client.from('policy_documents').select('id,policy_type,title,version,content,effective_at').eq('is_active',true).not('published_at','is',null).lte('effective_at',new Date().toISOString());
      if(error)throw new Error('Policy setup is unavailable. The owner must apply the workflow migrations and publish legally reviewed policies.');
      const result=Object.fromEntries((data||[]).map(p=>[p.policy_type,p]));
      if(types.some(type=>!result[type]))throw new Error('Required policies are not published yet. Password recovery and privacy requests remain available.');
      types.forEach(t=>cache.set(t,result[t]));return result;
    },
    async acknowledge(client,ids,action='signin',optional=false){
      const {error}=await client.rpc('accept_current_policies',{p_action:action,p_ids:ids,p_optional_alerts:optional});if(error)throw error;
    },
    async ensureSession(client){
      const {data,error}=await client.rpc('has_current_session_ack');if(error)throw error;if(data)return;
      const policies=await this.current(client,['terms','privacy']);
      const dialog=document.createElement('dialog');dialog.className='modal policy-review-dialog';
      dialog.innerHTML='<form><h2>Review current account policies</h2><p>Review the Terms and Privacy Notice to continue. Optional marketing consent is separate.</p><label class="inline-check"><input type="checkbox" required name="terms"> I agree to the <a href="/terms.html" target="_blank" rel="noopener">Terms and Conditions</a>.</label><label class="inline-check"><input type="checkbox" required name="privacy"> I acknowledge the <a href="/privacy.html" target="_blank" rel="noopener">Privacy Notice</a>.</label><p><a href="/privacy-request.html">Privacy requests</a> · <a href="/reset-password.html">Password recovery</a></p><button class="btn" type="submit">Continue</button><p role="status"></p></form>';
      document.body.append(dialog);dialog.showModal();
      await new Promise((resolve,reject)=>{
        dialog.addEventListener('cancel',()=>{reject(new Error('Policy review cancelled.'));dialog.remove();},{once:true});
        dialog.querySelector('form').addEventListener('submit',async e=>{e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;try{await this.acknowledge(client,[policies.terms.id,policies.privacy.id]);dialog.close();dialog.remove();resolve();}catch(error){dialog.querySelector('[role=status]').textContent=error.message;button.disabled=false;}});
      });
    },
  };
})();
