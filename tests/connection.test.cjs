const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const upstream = 'https://hderthposugfbijwvvjm.supabase.co';
const origin = 'https://portal.example.test';
function transport(proxy = '/supabase') {
  const calls = [];
  const context = { window: {}, URL, Request, location: { origin } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../assets/js/connection.js'), 'utf8'), context);
  const send = context.window.IsabelaConnection.createFetch({ upstream, proxy, origin,
    fetcher: async (input, init) => { calls.push({ input, init }); return new Response('{}'); },
  });
  return { send, calls };
}
test('auth and database requests preserve credentials, bodies and query filters through the proxy', async () => {
  const t = transport();
  const init = { method: 'POST', headers: { Authorization: 'Bearer user-token', apikey: 'public-key' }, body: '{"role":"seeker"}' };
  await t.send(upstream+'/auth/v1/signup?redirect_to=https%3A%2F%2Fportal.example.test', init);
  assert.equal(t.calls[0].input, origin+'/supabase/auth/v1/signup?redirect_to=https%3A%2F%2Fportal.example.test');
  assert.equal(t.calls[0].init, init);
  await t.send(upstream+'/rest/v1/jobs?select=id&status=eq.approved');
  assert.equal(t.calls[1].input, origin+'/supabase/rest/v1/jobs?select=id&status=eq.approved');
});
test('Request objects retain write bodies, authorization, method and abort signal', async () => {
  const t = transport();
  await t.send(new Request(upstream+'/rest/v1/profiles?id=eq.user', {method:'PATCH',headers:{Authorization:'Bearer token'},body:'{"full_name":"Member"}'}));
  const request = t.calls[0].input;
  assert.equal(request.url, origin+'/supabase/rest/v1/profiles?id=eq.user');
  assert.equal(request.method,'PATCH');
  assert.equal(request.headers.get('Authorization'),'Bearer token');
  assert.equal(await request.text(),'{"full_name":"Member"}');
});
test('local mode and unrelated hosts are passed through, without replaying failed writes', async () => {
  const local = transport('');
  await local.send(upstream+'/auth/v1/user');
  assert.equal(local.calls[0].input,upstream+'/auth/v1/user');
  const t = transport();
  await t.send('https://other.example.test/rest/v1/jobs');
  assert.equal(t.calls[0].input,'https://other.example.test/rest/v1/jobs');
  let count = 0;
  const context = {window:{},URL,Request,location:{origin}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../assets/js/connection.js'),'utf8'),context);
  const send=context.window.IsabelaConnection.createFetch({upstream,proxy:'/supabase',origin,fetcher:async()=>{count++;throw new TypeError('Failed to fetch');}});
  await assert.rejects(send(upstream+'/auth/v1/signup',{method:'POST'}),/Failed to fetch/);
  assert.equal(count,1);
});
test('hosting rewrites point only to the configured project and forbid response caching', () => {
  const config = JSON.parse(fs.readFileSync(require.resolve('../vercel.json'),'utf8'));
  assert.deepEqual(config.rewrites.map(x=>x.destination), ['auth','rest','storage'].map(x=>upstream+'/'+x+'/:path*'));
  assert.ok(config.headers.find(x=>x.source==='/supabase/:path*').headers.some(x=>x.key==='Cache-Control'&&x.value.includes('no-store')));
});
