import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';
fs.mkdirSync('.tmp-qa',{recursive:true});
const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create schema auth;create schema storage;
create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',raw_app_meta_data jsonb default '{}');
create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)$$;
create function auth.uid() returns uuid language sql stable as $$select nullif(auth.jwt()->>'sub','')::uuid$$;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb,unique(bucket_id,name));
alter table storage.objects enable row level security;
create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;
grant usage on schema public,auth,storage to anon,authenticated;
grant select,insert,delete on storage.objects to authenticated;`);
const files=['schema.sql',...fs.readdirSync('migrations').filter(f=>/^(00[2456789]|010)-.*sql$/.test(f)).map(f=>'migrations/'+f)];
for(const file of files){try{await db.exec(fs.readFileSync(file,'utf8').replace('create extension if not exists pgcrypto;',''));console.log('Migration OK:',file);}catch(error){console.error('Migration failed:',file,error.message,error.where);await db.close();process.exit(1);}}
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
async function identity(n,role='authenticated',session='session-'+n){await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:n?id(n):null,session_id:session})]);await db.exec('set role '+role);}
async function root(){await db.exec('reset role');}
async function scalar(sql,args=[]){return (await db.query(sql,args)).rows[0];}
for(const [n,role] of [[1,'admin'],[2,'company'],[3,'company'],[4,'seeker'],[5,'seeker']]){
await db.query('insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data) values($1,$2,$3,$4)',[id(n),`member${n}@example.test`,{portal_created_by_admin:true,portal_role:role},{full_name:'Member '+n,requested_role:role,company_name:'Company '+n}]);}
await identity(1);
const policy={};for(const type of ['terms','privacy','application','employer']){policy[type]=(await scalar('select public.publish_policy($1,$2,$3,$4,$5,true) id',[type,'test-1',type,'Reviewed test text. '.repeat(12),{legal_name:'Test operator',address:'Test address',support_email:'support@example.test',privacy_contact:'privacy@example.test',retention:'Test retention decision',processing_bases:'Test legal review'}])).id;}
const ack=async()=>db.query('select public.accept_current_policies($1,$2,false)',['signin',[policy.terms,policy.privacy]]);
await ack();await identity(2);await ack();
const job=(await scalar("insert into public.jobs(company_id,title,category,employment_type,description,qualifications,status) values($1,'Engineer','Information Technology','Full-time','Description','Qualifications','pending') returning id",[id(2)])).id;
await identity(1);await db.query("select public.workflow_action('moderate_job',$1,$2)",[job,{status:'approved',reason:'Reviewed'}]);
await identity(4);await assert.rejects(db.query('select public.submit_agreed_application($1,$2,$3,$4,$5,$6,$7)',[job,id(20),'',[],policy.application,policy.privacy,{}]),/Terms|Notice|active/);await ack();
const submission=id(30),path=id(4)+'/staging/'+submission+'/cv.pdf';
await db.query('insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3)',['application-documents',path,{size:100,mimetype:'application/pdf'}]);
const args=[job,submission,'Cover letter',[{path,name:'cv.pdf'}],policy.application,policy.privacy,{accurate:true,sharing:true,agreement:true}];
await assert.rejects(db.query('select public.submit_agreed_application($1,$2,$3,$4,$5,$6,$7)',[...args.slice(0,6),{}]),/acknowledgment/);
const submitted=(await scalar('select public.submit_agreed_application($1,$2,$3,$4,$5,$6,$7) result',args)).result;
assert.ok(submitted.reference.startsWith('HAP-'));
const repeat=(await scalar('select public.submit_agreed_application($1,$2,$3,$4,$5,$6,$7) result',args)).result;
assert.equal(submitted.id,repeat.id);
assert.equal((await scalar('select count(*)::int n from public.application_agreements')).n,1);
await assert.rejects(db.query("insert into public.applications(job_id,seeker_id) values($1,$2)",[job,id(4)]),/permission denied/);
await identity(3);await ack();assert.equal((await scalar('select count(*)::int n from public.applications')).n,0);
await assert.rejects(db.query('select public.get_application_seeker_information($1)',[submitted.id]),/permission/);
await identity(5);await ack();assert.equal((await scalar('select count(*)::int n from public.application_documents')).n,0);
await identity(2);assert.ok((await scalar('select public.get_application_seeker_information($1) data',[submitted.id])).data.full_name);
await identity(4);await assert.rejects(db.query('update public.application_agreements set acknowledged_at=now()'),/permission denied/);
await root();assert.equal((await scalar('select count(*)::int n from public.application_status_history')).n,1);
await identity(1);await assert.rejects(db.query("update public.policy_documents set content='changed'"),/permission denied/);
await identity(0,'anon');assert.equal((await scalar('select count(*)::int n from public.jobs')).n,1);
await root();await db.query("update public.profiles set approval_status='suspended' where id=$1",[id(2)]);
await identity(0,'anon');assert.equal((await scalar('select count(*)::int n from public.jobs')).n,0);
console.log('Database assertions passed: real PostgreSQL RLS, atomic agreement, idempotency, document ownership, review isolation, immutable receipts, and suspended employer visibility.');
await db.close();
