const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {filterJobs,safeLink} = require('../assets/js/vacancies.js');
const jobs = [
  {id:'1',title:'Office Assistant',company_id:'a',company_name:'Alpha',description:'Records',qualifications:'High school',location:'Isabela City',category:'Administration',employment_type:'Full-time',audiences:['pwd','high-school'],created_at:'2026-10-01'},
  {id:'2',title:'Developer',company_id:'b',company_name:'Beta',description:'Web development',qualifications:'JavaScript',location:'Remote',category:'Information Technology',employment_type:'Remote',audiences:[],created_at:'2026-10-20'},
  {id:'3',title:'Cashier',company_id:'a',company_name:'Alpha',description:'Retail',qualifications:'High school',location:'Isabela City',category:'Retail & Sales',employment_type:'Part-time',created_at:'2026-10-10'},
];
test('combines keyword, location, category, employment, and audience restrictions',()=>{
  assert.deepEqual(filterJobs(jobs,{term:' records ',location:'ISABELA',category:'Administration',type:'Full-time',audiences:['pwd']}).map(x=>x.id),['1']);
  assert.equal(filterJobs(jobs,{term:'records',location:'Remote'}).length,0);
});
test('audiences use OR semantics and do not infer eligibility from job text',()=>{
  assert.deepEqual(filterJobs(jobs,{audiences:['government','high-school']}).map(x=>x.id),['1']);
  assert.equal(filterJobs(jobs,{audiences:['overseas']}).length,0);
});
test('saved jobs and employer directory filters use exact identifiers',()=>{
  assert.deepEqual(filterJobs(jobs,{savedOnly:true,savedIds:new Set(['2'])}).map(x=>x.id),['2']);
  assert.deepEqual(filterJobs(jobs,{companyId:'a',sort:'title'}).map(x=>x.id),['3','1']);
  assert.equal(filterJobs(jobs,{savedOnly:true}).length,0);
});
test('sorting does not mutate the database result array',()=>{
  assert.deepEqual(filterJobs(jobs,{}).map(x=>x.id),['2','3','1']);
  assert.deepEqual(filterJobs(jobs,{sort:'oldest'}).map(x=>x.id),['1','3','2']);
  assert.deepEqual(jobs.map(x=>x.id),['1','2','3']);
});
test('organizer links reject script and non-HTTPS schemes',()=>{
  for(const url of ['javascript:alert(1)','data:text/html,test','http://example.com','//example.com',''])assert.equal(safeLink(url),'');
  assert.equal(safeLink('https://example.com/register'),'https://example.com/register');
});
test('every role portal has unique IDs and references existing local assets',()=>{
  const root=path.join(__dirname,'..');
  for(const file of ['index.html','admin/index.html','company/index.html','job-seeker/index.html']){
    const html=fs.readFileSync(path.join(root,file),'utf8');
    const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
    assert.equal(new Set(ids).size,ids.length,`${file} has duplicate IDs`);
    for(const match of html.matchAll(/(?:src|href)="(\/[^"#]+)"/g))assert.ok(fs.existsSync(path.join(root,match[1])),`${file}: missing ${match[1]}`);
    for(const id of ['home','fairs','training','advice','employers','admin','profile','dashboard','resourceDialog','jobGrid','sortJobs'])assert.ok(ids.includes(id),`${file}: missing ${id}`);
    assert.ok(html.indexOf('/assets/js/vacancies.js')<html.indexOf('/assets/js/script.js'));
  }
});
