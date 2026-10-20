// Dependency-free Chrome/CDP smoke test. Supabase requests use read-only fixtures.
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const output=path.join(root,'.tmp-ui');
fs.mkdirSync(output,{recursive:true});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let chrome,ws,server;
async function main(){
  const createdAccounts=[];
  let simulateOffline = false;
  server=http.createServer((req,res)=>{
    if(simulateOffline&&req.url==='/offline-test'){req.socket.destroy();return;}
    if(req.url==='/api/admin/users'){
      let input='';req.on('data',chunk=>input+=chunk);req.on('end',()=>{
        res.setHeader('Content-Type','application/json');
        if(!req.headers.authorization?.startsWith('Bearer ')){res.writeHead(401).end(JSON.stringify({error:'Login required'}));return;}
        const body=JSON.parse(input);
        if(createdAccounts.some(x=>x.email===body.email)){res.writeHead(409).end(JSON.stringify({error:'An account with this email already exists.'}));return;}
        const user={...body,id:`created-${createdAccounts.length}`,approval_status:'active',created_at:new Date().toISOString()};
        delete user.password;createdAccounts.push(user);
        res.writeHead(201).end(JSON.stringify({user,temporary_password:body.password||'Generated-test-password!9',message:'Account created. The new user must log in separately.'}));
      });return;
    }
    let file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
    if(!file.startsWith(root+path.sep)&&file!==root){res.writeHead(403).end();return;}
    if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
    if(!fs.existsSync(file)){res.writeHead(404).end();return;}
    res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.jpg':'image/jpeg','.png':'image/png','.ico':'image/x-icon','.webmanifest':'application/manifest+json'})[path.extname(file)]||'text/plain');
    res.end(fs.readFileSync(file));
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base=`http://127.0.0.1:${server.address().port}`;
  const profile=path.join(output,`chrome-${process.pid}-${Date.now()}`);
  chrome=spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',['--headless','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
  const portFile=path.join(profile,'DevToolsActivePort');
  let port;
  for(let i=0;i<100&&!port;i++){
    try {const value=fs.readFileSync(portFile,'utf8').split('\n')[0];if(/^\d+$/.test(value))port=value;}catch{}
    if(!port)await wait(100);
  }
  if(!port)throw new Error('Chrome did not expose its debugging port.');
  const tabs=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  ws=new WebSocket(tabs.find(x=>x.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
  let seq=0;const pending=new Map(),errors=[];
  let mockRole='admin', saved=[], content=[], passwordUpdates=0, resetRequests=[], signupRequests=[];
  const mockUser={id:'00000000-0000-4000-8000-000000000001',email:'review@example.test',app_metadata:{provider:'email'},user_metadata:{},aud:'authenticated',created_at:'2026-01-01T00:00:00Z'};
  function send(method,params={}){return new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});}
  const jobs=Array.from({length:23},(_,i)=>({id:`job-${i}`,company_id:i%2?'b':'a',title:i%2?'Office Assistant':'Software Developer',company_name:i%2?'Basilan Community Services':'Isabela Technology Group',location:'Isabela City, Basilan',category:i%2?'Administration':'Information Technology',employment_type:'Full-time',description:'An opportunity to grow your career in the local community.',qualifications:'Communication and teamwork skills.',requirements:['Resume'],audiences:i%2?['pwd','high-school']:[],salary:i%2?'₱18,000–₱22,000 / month':null,status:'approved',created_at:new Date(Date.UTC(2026,9,20-i)).toISOString()}));
  const fixtureProfiles=Array.from({length:525},(_,i)=>({id:`profile-${i}`,email:`member-${i}@example.test`,full_name:`Member ${i}`,company_name:i%3===0?`Employer ${i}`:null,role:i%3===0?'company':'seeker',approval_status:i%3===0?'pending':'active',created_at:'2026-01-01T00:00:00Z'}));
  const fixtureApplications=Array.from({length:527},(_,i)=>({id:`application-${i}`,status:'submitted',created_at:'2026-01-01T00:00:00Z',cover_letter:'Application message',document_paths:[],jobs:{title:'Office Assistant',company_name:'Community Employer'},profiles:{full_name:`Applicant ${i}`,email:`applicant-${i}@example.test`}}));
  ws.onmessage=async event=>{
    const m=JSON.parse(event.data);
    if(m.id){const p=pending.get(m.id);if(!p)return;pending.delete(m.id);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result);}
    if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text+': '+(m.params.exceptionDetails.exception?.description||''));
    if(m.method==='Fetch.requestPaused'){
      const {request,requestId}=m.params;const url=new URL(request.url);let data=[];
      if(url.pathname==='/auth/v1/user')data=mockUser;
      if(url.pathname==='/auth/v1/signup'&&request.method==='POST'){signupRequests.push(JSON.parse(request.postData));data={id:'signup-user',email:'new@example.test',identities:[{id:'signup-user'}]};}
      if(url.pathname==='/auth/v1/user'&&request.method==='PUT')passwordUpdates++;
      if(url.pathname==='/auth/v1/recover'&&request.method==='POST'){resetRequests.push({body:JSON.parse(request.postData),redirect:url.searchParams.get('redirect_to')});data={};}
      if(url.pathname==='/rest/v1/profiles'){
        const profile={id:mockUser.id,email:mockUser.email,full_name:'Review account',company_name:'Review employer',role:mockRole,approval_status:'active'};
        data=url.searchParams.has('id')?profile:[profile,...fixtureProfiles,...createdAccounts];
      }
      if(url.pathname==='/rest/v1/saved_jobs'){
        if(request.method==='POST'){const row=JSON.parse(request.postData);saved=[row];}
        if(request.method==='DELETE')saved=[];
        data=saved;
      }
      if(url.pathname==='/rest/v1/jobs')data=jobs;
      if(url.pathname==='/rest/v1/applications')data=fixtureApplications;
      if(url.pathname==='/rest/v1/rpc/list_approved_employers')data=[{id:'a',company_name:'Isabela Technology Group',location:'Isabela City',bio:'Building opportunities in the community.',open_jobs:12}];
      if(url.pathname==='/rest/v1/career_resources'){
        const kind=url.searchParams.get('kind')?.replace('eq.','');
        if(request.method==='POST')content.push({...JSON.parse(request.postData),id:'new-resource'});
        if(request.method==='PATCH')content=content.map(r=>r.id===url.searchParams.get('id')?.replace('eq.','')?{...r,...JSON.parse(request.postData)}:r);
        if(request.method==='DELETE')content=content.filter(r=>r.id!==url.searchParams.get('id')?.replace('eq.',''));
        data=kind==='fair'?[{id:'fair-1',kind:'fair',title:'Community career fair',description:'Meet local employers.',body:'Bring your résumé and meet employers.',location:'Isabela City',starts_at:'2026-12-20T01:00:00Z',published:true}]:content.filter(r=>!kind||r.kind===kind);
      }
      let contentRange;
      if(['/rest/v1/profiles','/rest/v1/jobs','/rest/v1/applications'].includes(url.pathname)&&Array.isArray(data)){
        for(const field of ['role','approval_status','status']){const value=url.searchParams.get(field);if(value?.startsWith('eq.'))data=data.filter(row=>row[field]===value.slice(3));}
        const total=data.length,offset=Number(url.searchParams.get('offset')||0),limit=Number(url.searchParams.get('limit')||1000);
        data=data.slice(offset,offset+limit);
        contentRange=data.length?`${offset}-${offset+data.length-1}/${total}`:`*/${total}`;
      }
      await send('Fetch.fulfillRequest',{requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'application/json'},{name:'Access-Control-Allow-Origin',value:base},{name:'Access-Control-Allow-Methods',value:'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS'},{name:'Access-Control-Allow-Headers',value:'authorization, apikey, content-type, x-client-info, prefer, accept, accept-profile, content-profile, x-supabase-api-version'},{name:'Access-Control-Expose-Headers',value:'Content-Range'},...(contentRange?[{name:'Content-Range',value:contentRange}]:[])],body:Buffer.from(request.method==='HEAD'?'':JSON.stringify(data)).toString('base64')});
    }
  };
  await send('Runtime.enable');await send('Page.enable');
  if(process.argv.includes('--live-desktop')){
    for(const width of [1024,1440,1920]){
      await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
      await send('Page.navigate',{url:'https://jobseeker-neon.vercel.app/'});
      await wait(1800);
      const capture=await send('Page.captureScreenshot',{format:'png'});
      fs.writeFileSync(path.join(output,`live-desktop-${width}.png`),Buffer.from(capture.data,'base64'));
    }
    console.log('Captured the live desktop site at 1024, 1440, and 1920 pixels.');
    await send('Browser.close').catch(()=>{});
    return;
  }
  await send('Fetch.enable',{patterns:[{urlPattern:'https://*.supabase.co/*'}]});
  const evaluate=async expression=>(await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true})).result.value;
  async function until(expression){for(let i=0;i<100;i++){if(await evaluate(expression))return;await wait(100);}throw new Error('Timed out: '+expression+'\n'+JSON.stringify(await evaluate("({toast:document.querySelector('#toast')?.textContent,invalid:[...document.querySelectorAll(':invalid')].map(x=>({name:x.name,value:x.value,message:x.validationMessage})),admin:document.querySelector('#adminContent')?.textContent.slice(0,500)})"))+'\n'+errors.join('\n'));}
  await send('Emulation.setDeviceMetricsOverride',{width:1365,height:1000,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:base});
  await until("document.querySelectorAll('.vacancy-row').length===10");
  assert.match(await evaluate("document.querySelector('#resultCount').textContent"),/23 job openings/);
  assert.equal(await evaluate("document.querySelector('.signup-button')!==null"),true,'Signup button is missing');
  const icon=await fetch(base+'/favicon.ico');assert.equal(icon.status,200);assert.equal(Buffer.from(await icon.arrayBuffer()).readUInt16LE(2),1);
  await evaluate("document.querySelector('#authBtn').click()");
  assert.equal(await evaluate("document.querySelector('#authTitle').textContent"),'Log in to HapIsabela');
  assert.match(await evaluate("document.querySelector('#toggleAuth').textContent"),/Create an account.*Sign up/);
  assert.equal(await evaluate("new URL(document.querySelector('.brand-logo').src).pathname"),'/favicon.ico');
  assert.equal(await evaluate("new URL(document.querySelector('.auth-logo').src).pathname"),'/favicon.ico');
  assert.ok(await evaluate("parseFloat(getComputedStyle(document.body).fontSize)>=18"));
  const loginShot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(output,'login-green.png'),Buffer.from(loginShot.data,'base64'));
  await evaluate("document.querySelector('#toggleAuth').click()");
  assert.deepEqual(await evaluate("[...document.querySelector('#roleSelect').options].map(x=>x.value)"),['seeker','company']);
  for(const role of ['seeker','company']){
    await evaluate(`{const f=document.querySelector('#authForm');f.elements.full_name.value='Public ${role}';f.elements.requested_role.value='${role}';f.elements.requested_role.dispatchEvent(new Event('change'));f.elements.email.value='public-${role}@example.test';f.elements.password.value='Signup-only-password1!';document.querySelector('#signupConsent').checked=true;${role==='company'?"f.elements.company_name.value='Public Company';":''}}`);
    if(role==='company'){const signupShot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(output,'signup-green.png'),Buffer.from(signupShot.data,'base64'));}
    await evaluate("document.querySelector('#authForm').requestSubmit()");
    await until("document.querySelector('#authStatus').textContent.includes('Check your email')");
    assert.equal(signupRequests.at(-1).data.requested_role,role);
    assert.equal(signupRequests.at(-1).app_metadata,undefined);
  }
  const signupsBeforeTamper=signupRequests.length;
  await evaluate("{const f=document.querySelector('#authForm');const option=document.createElement('option');option.value='admin';option.textContent='Admin';f.elements.requested_role.append(option);f.elements.requested_role.value='admin';f.elements.requested_role.dispatchEvent(new Event('change'));f.elements.password.value='Tamper-only-password1!';f.requestSubmit();}");
  assert.match(await evaluate("document.querySelector('#authStatus').textContent"),/Choose Job seeker or Company/);
  assert.equal(signupRequests.length,signupsBeforeTamper,'Public admin signup reached the API');
  await evaluate("document.querySelector('#authDialog').close()");
  await evaluate("document.querySelector('[data-job-page=\"2\"]').click()");
  assert.match(await evaluate("document.querySelector('#jobPagination').textContent"),/Page 2 of 3/);
  await evaluate("document.querySelector('[data-audience=\"pwd\"]').click()");
  assert.match(await evaluate("document.querySelector('#resultCount').textContent"),/11 job openings/);
  await evaluate("document.querySelector('#clearFilters').click();document.querySelector('.save-job').click()");
  assert.equal(await evaluate("document.querySelector('#authDialog').open"),true);
  await evaluate("document.querySelector('#authDialog').close();document.querySelector('.vacancy-title').click()");
  assert.equal(await evaluate("document.querySelector('#jobDialog').open"),true);
  await evaluate("document.querySelector('#jobDialog').close()");
  const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
  fs.writeFileSync(path.join(output,'vacancies-desktop.png'),Buffer.from(shot.data,'base64'));
  await evaluate("document.querySelector('[data-view=\"fairs\"]').click()");
  await until("document.querySelector('#fairsContent').textContent.includes('Community career fair')");
  await evaluate("document.querySelector('[data-view=\"training\"]').click()");
  await until("document.querySelector('#trainingContent').textContent.includes('No upcoming')");
  await evaluate("document.querySelector('[data-view=\"advice\"]').click()");
  await until("document.querySelectorAll('#adviceContent .resource-card').length===3");
  await evaluate("document.querySelector('#adviceContent [data-article]').click()");
  assert.equal(await evaluate("document.querySelector('#resourceDialog').open"),true);
  await evaluate("document.querySelector('#resourceDialog').close();document.querySelector('[data-view=\"employers\"]').click()");
  await until("document.querySelectorAll('.employer-card').length===1");
  await evaluate("document.querySelector('[data-employer-jobs]').click()");
  assert.match(await evaluate("document.querySelector('#resultCount').textContent"),/12 job openings/);
  await evaluate("document.querySelector('#clearFilters').click()");
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await wait(200);
  assert.equal(await evaluate('document.documentElement.scrollWidth<=window.innerWidth'),true,'Mobile layout overflows');
  assert.equal(await evaluate("getComputedStyle(document.querySelector('#mobileDock')).display"),'flex');
  await evaluate("document.querySelector('[data-mobile-category=\"Information Technology\"]').click()");
  assert.match(await evaluate("document.querySelector('#resultCount').textContent"),/12 job openings/);
  assert.equal(await evaluate("document.querySelector('[data-mobile-category=\"Information Technology\"]').getAttribute('aria-pressed')"),'true');
  await evaluate("document.querySelector('[data-mobile-category=\"\"]').click()");
  await evaluate("document.querySelector('#mobileFilterToggle').click()");
  assert.equal(await evaluate("document.querySelector('#mobileFilterToggle').getAttribute('aria-expanded')"),'true');
  assert.notEqual(await evaluate("getComputedStyle(document.querySelector('#mobileVacancyFilters')).display"),'none');
  await evaluate("document.querySelector('#mobileFilterToggle').click()");
  await evaluate("document.querySelector('#mobileDock [data-mobile-destination=\"saved\"]').click()");
  assert.equal(await evaluate("document.querySelector('#authDialog').open"),true,'Signed-out saved navigation did not request login');
  await evaluate("document.querySelector('#authDialog').close();document.querySelector('.vacancy-title').click()");
  assert.equal(await evaluate("document.querySelector('#jobDialog').open"),true);
  const detailShot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(output,'mobile-job-details.png'),Buffer.from(detailShot.data,'base64'));
  await evaluate("document.querySelector('#jobDialog').close();window.scrollTo(0,0)");
  await evaluate("document.querySelector('#menuBtn').click()");
  assert.equal(await evaluate("document.querySelector('#menuBtn').getAttribute('aria-expanded')"),'true');
  await evaluate("document.querySelector('#menuBtn').click()");
  await evaluate('window.scrollTo(0,0)');
  const homeShot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(output,'mobile-home.png'),Buffer.from(homeShot.data,'base64'));
  const mobile=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
  fs.writeFileSync(path.join(output,'vacancies-mobile.png'),Buffer.from(mobile.data,'base64'));
  // A synthetic session exercises authenticated UI paths; all requests remain intercepted.
  const payload=Buffer.from(JSON.stringify({sub:mockUser.id,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated',aud:'authenticated'})).toString('base64url');
  const session={access_token:`eyJhbGciOiJIUzI1NiJ9.${payload}.review`,refresh_token:'review-only',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user:mockUser};
  const authScript = await send('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('sb-hderthposugfbijwvvjm-auth-token',${JSON.stringify(JSON.stringify(session))});`});
  await send('Emulation.setDeviceMetricsOverride',{width:1365,height:1000,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:base+'/admin/'});
  await until("document.querySelector('[data-manage-resources]')!==null");
  assert.equal(await evaluate("document.querySelector('#adminContent').textContent.includes('first 500')"),false);
  assert.match(await evaluate("document.querySelector('#adminContent .stats-row').textContent"),/526/);
  assert.match(await evaluate("document.querySelector('#adminContent .stats-row').textContent"),/527/);
  await evaluate("document.querySelector('[data-admin-tab=\"users\"]').click()");
  await until("document.querySelector('.admin-pagination')?.textContent.includes('of 526')");
  assert.equal(await evaluate("document.querySelectorAll('#adminContent tbody tr').length"),25);
  await evaluate("{const button=document.querySelector('[data-admin-page]');button.disabled=false;button.dataset.adminPage='22';button.click();}");
  await until("document.querySelector('.admin-pagination')?.textContent.includes('526–526 of 526')");
  assert.equal(await evaluate("document.querySelectorAll('#adminContent tbody tr').length"),1);
  await evaluate("document.querySelector('[data-admin-tab=\"applications\"]').click()");
  await until("document.querySelector('.admin-pagination')?.textContent.includes('of 527')");
  assert.equal(await evaluate("document.querySelectorAll('#adminContent tbody tr').length"),25);
  await evaluate("{const button=document.querySelector('[data-admin-page]');button.disabled=false;button.dataset.adminPage='22';button.click();}");
  await until("document.querySelector('.admin-pagination')?.textContent.includes('526–527 of 527')");
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  assert.equal(await evaluate('document.documentElement.scrollWidth<=window.innerWidth'),true,'Admin records overflow the mobile page');
  await send('Emulation.setDeviceMetricsOverride',{width:1365,height:1000,deviceScaleFactor:1,mobile:false});
  const adminPaginationShot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(output,'admin-pagination.png'),Buffer.from(adminPaginationShot.data,'base64'));
  await evaluate("document.querySelector('[data-view=\"applications\"]').click()");
  await until("document.querySelector('#applicationsContent .admin-pagination')?.textContent.includes('of 527')");
  await evaluate("{const button=document.querySelector('[data-admin-app-page]');button.disabled=false;button.dataset.adminAppPage='22';button.click();}");
  await until("document.querySelector('#applicationsContent .admin-pagination')?.textContent.includes('526–527 of 527')");
  await evaluate("document.querySelector('[data-view=\"admin\"]').click()");
  await until("document.querySelector('[data-manage-resources]')!==null");
  await evaluate("document.querySelector('[data-admin-tab=\"companies\"]').click()");
  await until("document.querySelector('#adminContent .admin-pagination')?.textContent.includes('of 175')");
  const sessionBefore=await evaluate("localStorage.getItem('sb-hderthposugfbijwvvjm-auth-token')");
  for(const role of ['seeker','company','admin']){
    await evaluate("document.querySelector('[data-add-user]').click()");
    assert.equal(await evaluate("document.querySelector('#addUserDialog').open"),true);
    await evaluate(`{const f=document.querySelector('#addUserForm');f.elements.full_name.value='QA ${role}';f.elements.email.value='qa-${role}@example.test';f.elements.role.value='${role}';f.elements.role.dispatchEvent(new Event('change'));}`);
    assert.equal(await evaluate("document.querySelector('#addUserForm').elements.company_name.required"),role==='company');
    assert.equal(await evaluate("document.querySelector('#addUserAdminNotice').classList.contains('hidden')"),role!=='admin');
    if(role==='company')await evaluate("document.querySelector('#addUserForm').elements.company_name.value='QA Company'");
    if(role==='admin'){
      const adminShot=await send('Page.captureScreenshot',{format:'png'});
      fs.writeFileSync(path.join(output,'admin-add-user.png'),Buffer.from(adminShot.data,'base64'));
    }
    await evaluate("document.querySelector('#addUserForm').requestSubmit()");
    await until("!document.querySelector('#createdUserDetails').classList.contains('hidden')");
    assert.equal(await evaluate("document.querySelector('#createdUserPassword').type"),'password');
    assert.equal(await evaluate("localStorage.getItem('sb-hderthposugfbijwvvjm-auth-token')"),sessionBefore,'Creating a user replaced the admin session');
    await evaluate("document.querySelector('#addUserDialog').close()");
    await until("document.querySelector('#createdUserPassword').value===''");
  }
  assert.deepEqual(createdAccounts.map(x=>x.role),['seeker','company','admin']);
  await evaluate("document.querySelector('[data-add-user]').click();{const f=document.querySelector('#addUserForm');f.elements.full_name.value='Duplicate';f.elements.email.value='qa-seeker@example.test';f.requestSubmit();}");
  await until("document.querySelector('#addUserStatus').textContent.includes('already exists')");
  assert.equal(createdAccounts.length,3);
  await evaluate("document.querySelector('#addUserDialog').close()");
  await evaluate("document.querySelector('[data-manage-resources]').click()");
  await until("document.querySelector('#resourceEditor')!==null");
  await evaluate("{const f=document.querySelector('#resourceEditor');f.elements.kind.value='advice';f.elements.title.value='Test career article';f.elements.description.value='An article summary';f.elements.body.value='Practical career advice';f.elements.published.checked=true;f.requestSubmit();}");
  await until("document.querySelector('.resource-admin-list')?.textContent.includes('Test career article')");
  assert.equal(content.length,1,'Admin content was not saved');
  await evaluate("document.querySelector('[data-edit-resource]').click();document.querySelector('#resourceEditor').elements.title.value='Updated article';document.querySelector('#resourceEditor').requestSubmit()");
  await until("document.querySelector('.resource-admin-list')?.textContent.includes('Updated article')");
  await evaluate("window.confirm=()=>true;document.querySelector('[data-delete-resource]').click()");
  await until("document.querySelector('.resource-admin-list')?.textContent.includes('No career content yet')");
  mockRole='seeker';
  await send('Page.navigate',{url:base+'/job-seeker/'});
  await until("document.querySelector('#welcome')?.textContent.includes('Review account')");
  assert.equal(await evaluate("document.querySelector('[data-add-user]')"),null,'Seeker sees admin create button');
  await evaluate("document.querySelector('[data-view=\"home\"]').click();document.querySelector('.save-job').click()");
  await until("document.querySelector('.save-job')?.getAttribute('aria-pressed')==='true'");
  assert.equal(saved.length,1);
  await send('Page.reload');
  await until("document.querySelector('#welcome')?.textContent.includes('Review account')");
  await evaluate("document.querySelector('[data-view=\"home\"]').click()");
  assert.equal(await evaluate("document.querySelector('.save-job').getAttribute('aria-pressed')"),'true','Saved vacancy did not reload');
  await evaluate("document.querySelector('#mobileDock [data-mobile-destination=\"saved\"]').click()");
  assert.match(await evaluate("document.querySelector('#resultCount').textContent"),/1 job opening/);
  assert.equal(await evaluate("document.querySelector('#mobileDock [data-mobile-destination=\"saved\"]').getAttribute('aria-current')"),'page');
  await evaluate("document.querySelector('#mobileDock [data-mobile-destination=\"discover\"]').click()");
  assert.match(await evaluate("document.querySelector('#resultCount').textContent"),/23 job openings/);
  await evaluate("document.querySelector('.vacancy-title').click();document.querySelector('#jobDetail [data-apply]').click()");
  assert.equal(await evaluate("document.querySelector('#applyJobId').value"),'job-0','Application form lost the selected job');
  assert.equal(await evaluate("document.querySelector('#applyDialog').open"),true);
  await evaluate("document.querySelector('#applyDialog').close();document.querySelector('.save-job').click()");
  await until("document.querySelector('.save-job')?.getAttribute('aria-pressed')==='false'");
  await evaluate("document.querySelector('[data-view=\"profile\"]').click()");
  assert.equal(await evaluate("document.querySelector('#passwordPanel').classList.contains('hidden')"),false);
  await evaluate("{const f=document.querySelector('#passwordForm');f.elements.new_password.value='Review-only-password1!';f.elements.confirm_password.value='Different-password1!';f.requestSubmit();}");
  assert.match(await evaluate("document.querySelector('#passwordStatus').textContent"),/do not match/);
  assert.equal(passwordUpdates,0,'Mismatched passwords reached the API');
  await evaluate("{const f=document.querySelector('#passwordForm');f.elements.confirm_password.value=f.elements.new_password.value;f.requestSubmit();}");
  await until("document.querySelector('#passwordStatus').textContent.includes('has been updated')");
  assert.equal(passwordUpdates,1);
  assert.equal(await evaluate("document.querySelector('#passwordForm').elements.new_password.value"),'');
  await evaluate("document.querySelector('#sendPasswordReset').click()");
  await until("document.querySelector('#passwordStatus').textContent.includes('reset link has been requested')");
  assert.equal(resetRequests[0].body.email,mockUser.email);
  assert.equal(resetRequests[0].redirect,base+'/reset-password.html');
  await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:authScript.identifier});
  await evaluate('localStorage.clear()');
  await send('Page.navigate',{url:base+'/reset-password.html'});
  await until("document.querySelector('#requestResetForm')&&!document.querySelector('#requestResetForm').classList.contains('hidden')");
  assert.equal(await evaluate("document.querySelector('#passwordForm').classList.contains('hidden')"),true);
  await evaluate("{const f=document.querySelector('#requestResetForm');f.elements.email.value='review@example.test';f.requestSubmit();}");
  await until("document.querySelector('#passwordStatus').textContent.includes('reset link has been requested')");
  await send('Page.navigate',{url:'about:blank'});
  await send('Page.navigate',{url:base+'/reset-password.html#access_token='+session.access_token+'&refresh_token=review-only&type=recovery&token_type=bearer&expires_in=3600'});
  await until("document.querySelector('#passwordForm')&&!document.querySelector('#passwordForm').classList.contains('hidden')");
  await evaluate("{const f=document.querySelector('#passwordForm');f.elements.new_password.value='Recovery-only-password1!';f.elements.confirm_password.value=f.elements.new_password.value;f.requestSubmit();}");
  await until("document.querySelector('#passwordDone')&&!document.querySelector('#passwordDone').classList.contains('hidden')");
  assert.equal(passwordUpdates,2);
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await send('Page.navigate',{url:base+'/job-seeker/'});
  await until("document.querySelector('#welcome')?.textContent.includes('Review account')");
  await evaluate("document.querySelector('#mobileDock [data-mobile-destination=\"account\"]').click()");
  assert.equal(await evaluate("document.querySelector('#profile').classList.contains('active')"),true);
  await evaluate("document.querySelector('#mobileDock [data-mobile-destination=\"activity\"]').click()");
  assert.equal(await evaluate("document.querySelector('#applications').classList.contains('active')"),true);
  await evaluate("document.querySelector('#mobileDock [data-mobile-destination=\"discover\"]').click()");
  for(const width of [320,375,430,768]){
    await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:true});
    assert.equal(await evaluate('document.documentElement.scrollWidth<=window.innerWidth'),true,`Layout overflows at ${width}px`);
  }
  const manifest=await(await fetch(base+'/manifest.webmanifest')).json();
  assert.equal(manifest.display,'standalone');
  for(const icon of manifest.icons)assert.equal((await fetch(base+icon.src)).status,200);
  await until("navigator.serviceWorker.controller!==null");
  const cachedUrls=await evaluate("caches.keys().then(async keys=>(await Promise.all(keys.map(async key=>(await(await caches.open(key)).keys()).map(r=>new URL(r.url).pathname)))).flat())");
  assert.ok(cachedUrls.every(url=>['/offline.html','/assets/icons/app-192.png'].includes(url)),'Service worker cached private content');
  simulateOffline = true;
  await send('Page.navigate',{url:base+'/offline-test'});
  await until("document.title.includes(\"You're offline\")");
  simulateOffline = false;
  assert.deepEqual(errors,[],'Browser runtime exceptions');
  console.log('Browser checks passed: app-style mobile navigation, category chips, filter toggle, saved/account/activity flows, detail sheet, 320–768px layouts, install manifest/offline fallback, and all portal/auth regression checks.');
  console.log('Screenshots: .tmp-ui/vacancies-desktop.png and .tmp-ui/vacancies-mobile.png');
  await send('Browser.close').catch(()=>{});
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{ws?.close();chrome?.kill();server?.close();});
