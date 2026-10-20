// Owner-only terminal helper. Secret key is read from hidden stdin, never saved.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const email = process.argv[2];
if (!email) throw new Error('Provide the admin email as the only argument.');
process.stdin.setRawMode?.(true);
process.stdin.setEncoding('utf8');
process.stdin.resume();
console.log('Ready for server key on hidden stdin.');
let input = '';
process.stdin.on('data', async chunk => {
  input += chunk;
  if (!/[\r\n]/.test(input)) return;
  process.stdin.removeAllListeners('data');
  process.stdin.setRawMode?.(false);
  process.stdin.pause();
  const secret = input.trim(); input = '';
  try {
    if (process.argv.includes('--verify-login')) {
      const credentials = JSON.parse(secret);
      const context = { window: {} };
      vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../config.js'), 'utf8'), context);
      const url = context.window.ISABELA_SUPABASE_URL;
      const key = context.window.ISABELA_SUPABASE_KEY;
      const response = await fetch(new URL('/auth/v1/token?grant_type=password', url), {
        method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: credentials.password }), signal: AbortSignal.timeout(20000),
      });
      const session = await response.json();
      if (!response.ok) throw new Error(session.msg || session.error_description || 'Login failed');
      const headers = { apikey: key, Authorization: `Bearer ${session.access_token}` };
      const profileResponse = await fetch(new URL(`/rest/v1/profiles?id=eq.${session.user.id}&select=role,approval_status`, url), { headers });
      const profiles = await profileResponse.json();
      await fetch(new URL('/auth/v1/logout?scope=local', url), { method: 'POST', headers });
      if (profiles[0]?.role !== 'admin' || profiles[0]?.approval_status !== 'active') throw new Error('Login succeeded, but active admin access was not verified.');
      console.log('Password login and active admin access verified. Test session signed out.');
      return;
    }
    if (!secret.startsWith('sb_secret_')) throw new Error('A server secret key is required.');
    const context = { window: {} };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../config.js'), 'utf8'), context);
    const url = context.window.ISABELA_SUPABASE_URL;
    async function request(endpoint, method = 'GET', body) {
      const response = await fetch(new URL(endpoint, url), {
        method, headers: { apikey: secret, 'Content-Type': 'application/json', Prefer: 'return=representation,resolution=merge-duplicates' },
        body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(`${response.status}: ${data.msg || data.message || data.error_description || 'Request rejected'}`);
      return data;
    }
    let account;
    for (let page = 1; ; page++) {
      const data = await request(`/auth/v1/admin/users?page=${page}&per_page=100`);
      account = data.users?.find(user => user.email?.toLowerCase() === email.toLowerCase());
      if (account || !data.users || data.users.length < 100) break;
    }
    let password;
    if (!account) {
      password = crypto.randomBytes(18).toString('base64url') + '!a7Z';
      const result = await request('/auth/v1/admin/users', 'POST', {
        email, password, email_confirm: true,
        user_metadata: { full_name: 'Ronnie Mayang', requested_role: 'seeker' },
      });
      account = result.user || result;
    }
    await request('/rest/v1/profiles?on_conflict=id', 'POST', {
      id: account.id, email, full_name: account.user_metadata?.full_name || 'Ronnie Mayang', role: 'admin', approval_status: 'active',
    });
    const profiles = await request(`/rest/v1/profiles?id=eq.${encodeURIComponent(account.id)}&select=id,role,approval_status`);
    if (profiles[0]?.role !== 'admin' || profiles[0]?.approval_status !== 'active') throw new Error('Admin profile could not be verified.');
    console.log(JSON.stringify({ email, role: 'admin', approval_status: 'active', password: password || '(existing password preserved)', email_confirmed: !!account.email_confirmed_at }, null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
});
