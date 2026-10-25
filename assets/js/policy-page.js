(async()=>{
  const type=document.body.dataset.policyType,state=document.querySelector('#policyState'),content=document.querySelector('#policyContent');
  try{
    const base=window.ISABELA_SUPABASE_PROXY?location.origin+window.ISABELA_SUPABASE_PROXY:window.ISABELA_SUPABASE_URL;
    const id=new URLSearchParams(location.search).get('version');
    const query=new URLSearchParams({select:'id,title,content,version,effective_at,published_at',policy_type:'eq.'+type,published_at:'not.is.null',...(id?{id:'eq.'+id}:{is_active:'eq.true',effective_at:'lte.'+new Date().toISOString()})});
    const response=await fetch(base+'/rest/v1/policy_documents?'+query,{headers:{apikey:window.ISABELA_SUPABASE_KEY},cache:'no-store'});
    if(!response.ok)throw Error('Published policy unavailable');
    const [policy]=await response.json();if(!policy)throw Error('No active published version');
    content.textContent=policy.content;state.textContent=`Published version ${policy.version} · Effective ${new Date(policy.effective_at).toLocaleDateString('en-PH',{timeZone:'Asia/Manila'})}`;
  }catch{
    const drafts=await(await fetch('/assets/policies.json')).json();content.textContent=drafts[type].content;
    state.textContent='Draft for operator confirmation and legal review. No active published policy is available; this draft cannot be accepted as a published agreement.';
  }
})();
