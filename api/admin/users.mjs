import { randomBytes } from 'node:crypto';

class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// Dependency injection keeps authorization and rollback behavior testable without
// creating real accounts. Vercel uses the default exported handler below.
export function createHandler({ fetcher = fetch, env = process.env } = {}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Use POST to create an account.' });
    }
    try {
      const token = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization || '')?.[1];
      if (!token) throw new ApiError(401, 'Please log in as an administrator.');
      const url = env.SUPABASE_URL;
      const publicKey = env.SUPABASE_PUBLISHABLE_KEY;
      const secret = env.SUPABASE_SECRET_KEY;
      if (!url || !publicKey || !secret)
        throw new ApiError(503, 'Account creation is not configured. The owner must set the Supabase server environment variables in Vercel and redeploy.');
      if (!url.startsWith('https://') || !secret.startsWith('sb_secret_'))
        throw new ApiError(503, 'The account creation service has invalid server configuration.');

      async function request(endpoint, { method = 'GET', body, privileged = false } = {}) {
        const response = await fetcher(new URL(endpoint, url), {
          method,
          headers: {
            apikey: privileged ? secret : publicKey,
            ...(!privileged ? { Authorization: `Bearer ${token}` } : {}),
            'Content-Type': 'application/json',
            Prefer: 'return=representation,resolution=merge-duplicates',
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(10000),
        });
        const data = await response.json().catch(() => null);
        return { response, data };
      }

      // Authenticate against Supabase, then read the current DB role under RLS.
      // Neither a submitted role nor user-editable token metadata grants access.
      const identity = await request('/auth/v1/user');
      if (!identity.response.ok || !identity.data?.id)
        throw new ApiError(401, 'Your login has expired. Please log in again.');
      const callerId = identity.data.id;
      const caller = await request(`/rest/v1/profiles?id=eq.${encodeURIComponent(callerId)}&select=role,approval_status`);
      if (!caller.response.ok) throw new ApiError(503, 'Unable to verify administrator access. Try again later.');
      if (caller.data?.[0]?.role !== 'admin' || caller.data[0].approval_status !== 'active')
        throw new ApiError(403, 'Only active administrators can create users.');

      let input;
      try { input = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
      catch { throw new ApiError(400, 'Invalid account details.'); }
      if (!input || typeof input !== 'object' || Array.isArray(input))
        throw new ApiError(400, 'Provide the account details.');
      if (JSON.stringify(input).length > 8192) throw new ApiError(413, 'Account details are too large.');
      const name = typeof input.full_name === 'string' ? input.full_name.trim() : '';
      const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
      const role = input.role;
      const company = typeof input.company_name === 'string' ? input.company_name.trim() : '';
      if (!name || name.length > 120) throw new ApiError(400, 'Enter a name with 1–120 characters.');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
        throw new ApiError(400, 'Enter a valid email address.');
      if (!['seeker', 'company', 'admin'].includes(role)) throw new ApiError(400, 'Choose seeker, company, or admin.');
      if (role === 'company' && (!company || company.length > 180))
        throw new ApiError(400, 'Enter a company name with 1–180 characters.');
      const password = input.password === '' || input.password == null
        ? randomBytes(18).toString('base64url') + '!a7Z' : input.password;
      if (typeof password !== 'string' || password.length < 8 || password.length > 128)
        throw new ApiError(400, 'Use an initial password with 8–128 characters.');

      let created;
      try {
        created = await request('/auth/v1/admin/users', {
          method: 'POST', privileged: true,
          body: {
            email, password, email_confirm: true,
            user_metadata: { full_name: name, requested_role: role === 'company' ? 'company' : 'seeker', company_name: role === 'company' ? company : '' },
            app_metadata: { portal_created_by_admin: true, portal_role: role, portal_created_by: callerId },
          },
        });
      } catch {
        throw new ApiError(504, 'The connection to Supabase was interrupted during account creation. Check this email in All users and Supabase Authentication before retrying; the account may already exist.');
      }
      if (!created.response.ok) {
        const code = created.data?.code || created.data?.error_code;
        if (['email_exists', 'user_already_exists'].includes(code) || /already.*registered|already.*exists/i.test(created.data?.msg || created.data?.message || ''))
          throw new ApiError(409, 'An account with this email already exists. Its password and role were not changed.');
        if (created.response.status === 429) throw new ApiError(429, 'Too many account requests. Please try again later.');
        if ([401, 403].includes(created.response.status))
          throw new ApiError(503, 'Supabase rejected the server credential. The site owner must verify SUPABASE_SECRET_KEY belongs to the configured project in Vercel, then redeploy.');
        if (/database error/i.test(created.data?.msg || created.data?.message || ''))
          throw new ApiError(502, 'Supabase could not save the new account because of a database error. The site owner must check the Auth logs and apply migrations/004-public-seeker-company-signup.sql to the existing database.');
        if (code === 'weak_password') throw new ApiError(400, 'The password does not meet the project password requirements. Choose a stronger password or leave it blank to generate one.');
        throw new ApiError(502, 'Supabase could not create the account. Check the server configuration and database migration.');
      }
      const newUser = created.data?.user || created.data;
      if (!newUser?.id) throw new ApiError(502, 'Supabase returned an incomplete account. Check Authentication before retrying.');

      try {
        // Also supports a database with the old profile-creation trigger.
        const saved = await request('/rest/v1/profiles?on_conflict=id', {
          method: 'POST', privileged: true,
          body: { id: newUser.id, email, full_name: name, role, company_name: role === 'company' ? company : null, approval_status: 'active' },
        });
        if (!saved.response.ok || saved.data?.[0]?.role !== role || saved.data?.[0]?.approval_status !== 'active')
          throw new Error('Profile setup failed');
      } catch {
        // Do not leave a partially provisioned login after a profile failure.
        let removed;
        try { removed = await request(`/auth/v1/admin/users/${encodeURIComponent(newUser.id)}`, { method: 'DELETE', privileged: true }); }
        catch { /* Report the uncertain cleanup without exposing credentials. */ }
        if (!removed?.response.ok)
          throw new ApiError(502, 'Account setup failed and cleanup could not be verified. Ask the owner to inspect this email in Supabase Authentication before retrying.');
        throw new ApiError(502, 'Account setup failed. The new login was removed; you can retry after checking the database setup.');
      }
      return res.status(201).json({
        user: { id: newUser.id, email, full_name: name, role, approval_status: 'active', company_name: role === 'company' ? company : null },
        temporary_password: password,
        message: 'Account created. No email confirmation is required. Share the initial password privately; the user must log in separately and change it in Profile settings.',
      });
    } catch (error) {
      return res.status(error instanceof ApiError ? error.status : 503).json({
        error: error instanceof ApiError ? error.message : 'The account creation service is unavailable. Please try again.',
      });
    }
  };
}

export default createHandler();
