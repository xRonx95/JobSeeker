import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../api/admin/users.mjs';

const env = { SUPABASE_URL: 'https://project.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SECRET_KEY: 'sb_secret_test' };
const valid = { full_name: 'New user', email: 'new@example.test', role: 'seeker', password: '' };
const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
function fixture(options = {}) {
  const calls = [];
  const handler = createHandler({ env: options.env || env, fetcher: async (url, init) => {
    const endpoint = url.pathname;
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ endpoint, method: init.method, headers: init.headers, body });
    if (endpoint === '/auth/v1/user') return reply({ id: 'caller' }, options.expired ? 401 : 200);
    if (endpoint === '/rest/v1/profiles' && init.method === 'GET') return reply([{ role: options.callerRole || 'admin', approval_status: options.status || 'active' }]);
    if (endpoint === '/auth/v1/admin/users' && init.method === 'POST') {
      if (options.duplicate) return reply({ code: 'email_exists' }, 422);
      if (options.weak) return reply({ code: 'weak_password' }, 422);
      return reply({ id: 'created' });
    }
    if (endpoint === '/rest/v1/profiles' && init.method === 'POST') return options.profileFailure ? reply({}, 500) : reply([body]);
    if (endpoint === '/auth/v1/admin/users/created' && init.method === 'DELETE') return reply({}, options.cleanupFailure ? 500 : 200);
    throw new Error('Unexpected endpoint: ' + endpoint);
  } });
  return {
    calls,
    async run(body = valid, authorization = 'Bearer admin-token', method = 'POST') {
      const result = { headers: {} };
      const res = { setHeader(name, value) { result.headers[name] = value; }, status(status) { result.status = status; return this; }, json(body) { result.body = body; return result; } };
      await handler({ method, headers: { authorization }, body }, res);
      return result;
    },
  };
}

test('rejects unauthenticated and expired callers without privileged requests', async () => {
  const missing = fixture(); assert.equal((await missing.run(valid, '')).status, 401); assert.equal(missing.calls.length, 0);
  const expired = fixture({ expired: true }); assert.equal((await expired.run()).status, 401);
  assert.ok(expired.calls.every(call => call.headers.apikey !== env.SUPABASE_SECRET_KEY));
});
test('seeker, employer, and inactive admin cannot create any role', async () => {
  for (const options of [{ callerRole: 'seeker' }, { callerRole: 'company' }, { status: 'suspended' }]) {
    const mock = fixture(options);
    assert.equal((await mock.run({ ...valid, role: 'admin', app_metadata: { role: 'admin' } })).status, 403);
    assert.ok(mock.calls.every(call => call.headers.apikey !== env.SUPABASE_SECRET_KEY));
  }
});
test('active admin creates each role without creating an auth session or sending email', async () => {
  for (const role of ['seeker', 'company', 'admin']) {
    const mock = fixture();
    const result = await mock.run({ ...valid, role, company_name: 'Community employer' });
    assert.equal(result.status, 201);
    assert.equal(result.body.user.role, role);
    assert.equal(result.body.user.approval_status, 'active');
    assert.ok(result.body.temporary_password.length >= 24);
    assert.equal(result.headers['Cache-Control'], 'no-store');
    const create = mock.calls.find(call => call.endpoint === '/auth/v1/admin/users');
    assert.equal(create.body.email_confirm, true);
    assert.equal(create.body.app_metadata.portal_role, role);
    assert.equal(create.body.app_metadata.portal_created_by_admin, true);
    assert.equal(create.body.app_metadata.portal_created_by, 'caller');
    assert.equal(create.headers.apikey, env.SUPABASE_SECRET_KEY);
    assert.equal(create.headers.Authorization, undefined);
    assert.ok(mock.calls.every(call => !/signup|token|invite|recover/.test(call.endpoint)));
    assert.ok(!JSON.stringify(result).includes(env.SUPABASE_SECRET_KEY));
    assert.equal(result.body.access_token, undefined);
  }
});
test('validates role, email, name, company, and password on the server', async () => {
  for (const input of [{ role: 'root' }, { email: 'invalid' }, { full_name: '' }, { role: 'company' }, { password: 'short' }, { password: {} }]) {
    const mock = fixture();
    assert.equal((await mock.run({ ...valid, ...input })).status, 400);
    assert.ok(!mock.calls.some(call => call.endpoint === '/auth/v1/admin/users'));
  }
});
test('existing emails and weak passwords return errors without changing existing accounts', async () => {
  const duplicate = fixture({ duplicate: true });
  assert.equal((await duplicate.run()).status, 409);
  assert.ok(!duplicate.calls.some(call => call.method === 'DELETE' || call.method === 'PUT'));
  const weak = fixture({ weak: true }); assert.equal((await weak.run()).status, 400);
});
test('rolls back a newly created login if profile setup fails', async () => {
  const mock = fixture({ profileFailure: true });
  const result = await mock.run();
  assert.equal(result.status, 502);
  assert.match(result.body.error, /removed/);
  assert.equal(mock.calls.at(-1).method, 'DELETE');
  assert.equal(result.body.temporary_password, undefined);
});
test('cleanup failures report uncertainty and do not return credentials', async () => {
  const mock = fixture({ profileFailure: true, cleanupFailure: true });
  const result = await mock.run();
  assert.equal(result.status, 502);
  assert.match(result.body.error, /cleanup could not be verified/);
  assert.equal(result.body.temporary_password, undefined);
});
test('handles missing server settings, invalid JSON, and unsupported methods', async () => {
  assert.equal((await fixture({ env: {} }).run()).status, 503);
  assert.equal((await fixture().run('{')).status, 400);
  const mock = fixture(); assert.equal((await mock.run(valid, '', 'GET')).status, 405); assert.equal(mock.calls.length, 0);
});
