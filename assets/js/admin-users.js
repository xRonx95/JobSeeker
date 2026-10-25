/* The browser sends only the administrator session token to our server API. */
(() => {
  'use strict';
  function responseError(response, result) {
    if (typeof result?.error === 'string' && result.error.trim()) return result.error;
    if (response.status === 401) return 'Your administrator session has expired. Log out, log in again, and retry.';
    if (response.status === 403) return 'Account creation was denied. Confirm that you are signed in as an active administrator.';
    if ([404, 405].includes(response.status)) return 'The account creation API is not available on this deployment. Deploy the complete project, including api/admin/users.mjs, to Vercel.';
    if (response.status === 429) return 'Too many account requests. Wait a moment before trying again.';
    if ([408, 504].includes(response.status)) return 'The server timed out while creating the account. Check All users and Supabase Authentication for this email before retrying; the account may already exist.';
    const reference = response.headers.get('x-vercel-id');
    return `The account creation server returned HTTP ${response.status}. Check All users and Supabase Authentication before retrying.${reference ? ` Deployment reference: ${reference}.` : ''} The site owner should check the Vercel function logs for /api/admin/users.`;
  }
  window.IsabelaAdminUsers = {
    responseError,
    bind({ client, isAdmin, refresh }) {
      const $ = selector => document.querySelector(selector);
      const dialog = $('#addUserDialog'), form = $('#addUserForm'), status = $('#addUserStatus');
      let busy = false;
      function roleFields() {
        const company = form.elements.role.value === 'company';
        $('#addUserCompany').classList.toggle('hidden', !company);
        form.elements.company_name.required = company;
        form.elements.company_name.disabled = !company;
        $('#addUserAdminNotice').classList.toggle('hidden', form.elements.role.value !== 'admin');
      }
      function clear() {
        form.reset(); roleFields(); status.textContent = '';
        form.classList.remove('hidden'); $('#createdUserDetails').classList.add('hidden');
        $('#createdUserEmail').value = ''; $('#createdUserPassword').value = '';
        $('#createdUserPassword').type = 'password';
        $('#showCreatedPassword').textContent = 'Show password';
        $('#showCreatedPassword').setAttribute('aria-pressed', 'false');
      }
      document.addEventListener('click', event => {
        if (!event.target.closest('[data-add-user]') || !isAdmin() || busy) return;
        clear(); dialog.showModal(); dialog.scrollTop = 0;
      });
      form.elements.role.addEventListener('change', roleFields);
      $('#addAnotherUser').addEventListener('click', clear);
      $('#showCreatedPassword').addEventListener('click', () => {
        const show = $('#createdUserPassword').type === 'password';
        $('#createdUserPassword').type = show ? 'text' : 'password';
        $('#showCreatedPassword').textContent = show ? 'Hide password' : 'Show password';
        $('#showCreatedPassword').setAttribute('aria-pressed', String(show));
      });
      dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
      dialog.addEventListener('close', clear);
      form.addEventListener('submit', async event => {
        event.preventDefault();
        if (busy || !isAdmin()) return;
        busy = true;
        const button = form.querySelector('[type="submit"]'), close = dialog.querySelector('[data-close]');
        button.disabled = true; close.disabled = true;
        status.className = ''; status.textContent = 'Creating account…';
        const body = Object.fromEntries(new FormData(form).entries());
        try {
          const { data, error } = await client.auth.getSession();
          if (error) throw error;
          if (!data.session?.access_token) throw new Error('Please log in again as an administrator.');
          const response = await fetch('/api/admin/users', {
            method: 'POST', headers: { Authorization: `Bearer ${data.session.access_token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          const result = await response.json().catch(() => null);
          if (!response.ok) throw new Error(responseError(response, result));
          if (!result?.user?.email || !result.temporary_password) throw new Error('The result could not be verified. Check All users before retrying.');
          form.reset(); form.classList.add('hidden');
          $('#createdUserEmail').value = result.user.email;
          $('#createdUserPassword').value = result.temporary_password;
          $('#createdUserDetails').classList.remove('hidden');
          status.className = 'password-feedback'; status.textContent = result.message;
          try { await refresh(); } catch { status.textContent += ' Refresh the user list to see the new account.'; }
        } catch (error) {
          status.className = 'password-error';
          status.textContent = error instanceof TypeError ? 'The request could not be completed. Check All users before retrying to avoid a duplicate account.' : error.message;
        } finally { busy = false; button.disabled = false; close.disabled = false; }
      });
    },
  };
})();
