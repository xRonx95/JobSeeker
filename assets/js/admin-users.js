/* The browser sends only the administrator session token to our server API. */
(() => {
  'use strict';
  window.IsabelaAdminUsers = {
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
        clear(); dialog.showModal();
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
          if (!response.ok) throw new Error(result?.error || (response.status === 404 ? 'The account creation API is not deployed. Deploy this project with its api folder to Vercel.' : 'Account creation failed. Check All users before retrying.'));
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
