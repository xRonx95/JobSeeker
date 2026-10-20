// Read-only check. Uses only the public browser configuration.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

async function main() {
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../config.js'), 'utf8'), context);
  const { ISABELA_SUPABASE_URL: url, ISABELA_SUPABASE_KEY: key } = context.window;
  if (!key?.startsWith('sb_publishable_') && !key?.startsWith('eyJ'))
    throw new Error('Use a publishable / anon key in config.js. Secret keys are not allowed.');
  for (const endpoint of ['/auth/v1/settings', '/rest/v1/jobs?select=id&status=eq.approved&limit=1']) {
    const response = await fetch(new URL(endpoint, url), {
      headers: { apikey: key },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(`${endpoint.split('?')[0]}: HTTP ${response.status} ${body.message || body.msg || ''}. Check the project URL, public key, and schema.sql setup.`);
    }
    console.log(`${endpoint.split('?')[0]}: OK`);
  }
  console.log('Authentication endpoint and public jobs query are reachable.');
}

main().catch((error) => {
  console.error(`Connection check failed: ${error.message}`);
  if (error.cause?.code) console.error(`Network cause: ${error.cause.code}`);
  process.exitCode = 1;
});
