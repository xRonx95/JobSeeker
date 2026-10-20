// Creates a normal Auth account using the public key. It cannot grant admin access.
// Usage: node scripts/create-account.cjs email seeker|company "Display name" ["Company name"]
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

async function main() {
  const [email, role, name, company = ''] = process.argv.slice(2);
  if (!email || !['seeker', 'company'].includes(role) || !name || (role === 'company' && !company))
    throw new Error('Provide an email, seeker/company role, display name, and company name for company accounts.');
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../config.js'), 'utf8'), context);
  const { ISABELA_SUPABASE_URL: url, ISABELA_SUPABASE_KEY: key } = context.window;
  if (!key?.startsWith('sb_publishable_')) throw new Error('A public publishable key is required.');
  const password = crypto.randomBytes(18).toString('base64url') + '!a7Z';
  const response = await fetch(new URL('/auth/v1/signup?redirect_to=https%3A%2F%2Fjobseeker-neon.vercel.app%2F', url), {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, data: { requested_role: role, full_name: name, company_name: company } }),
    signal: AbortSignal.timeout(20000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`${data.code || response.status}: ${data.msg || data.message || data.error_description || 'Signup failed'}`);
  const user = data.user || data;
  if (!user.id || user.identities?.length === 0)
    throw new Error('This email may already have an account. Its password was not changed. Use the existing login or password recovery.');
  console.log(JSON.stringify({ email, user_id: user.id, password, confirmation_required: !data.access_token && !user.email_confirmed_at }, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
