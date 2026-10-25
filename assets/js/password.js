/* Supabase user password changes and email recovery; no admin credentials. */
(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  function bind(client) {
    const form = $('#passwordForm'), status = $('#passwordStatus');
    const message = (text, error = false) => {
      status.textContent = text;
      status.className = error ? 'password-error' : 'password-feedback';
    };
    const describe = error => error.status === 429 || /rate limit/i.test(error.message)
      ? 'Too many requests. Please wait before trying again. If you are signed in, you can update your password directly in Profile settings.'
      : error.code === 'reauthentication_needed'
        ? 'Please log out and log in again, then retry updating your password.'
        : error.message || 'Unable to reset your password. Please try again.';
    async function sendLink(email, button) {
      button.disabled = true;
      message('Sending reset link…');
      try {
        const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: location.origin + '/reset-password.html' });
        if (error) throw error;
        message('If an account exists for this email, a reset link has been requested. Check your inbox and spam folder.');
      } catch (error) { message(describe(error), true); }
      finally { button.disabled = false; }
    }
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const password = form.elements.new_password.value;
      if (password !== form.elements.confirm_password.value) return message('The passwords do not match.', true);
      if (password.length < 8) return message('Use a password with at least 8 characters.', true);
      const button = form.querySelector('[type="submit"]');
      button.disabled = true;
      message('Updating password…');
      try {
        const { error } = await client.auth.updateUser({ password });
        if (error) throw error;
        form.reset();
        message('Your password has been updated. Use your new password the next time you log in.');
        if ($('#passwordDone')) {
          form.classList.add('hidden');
          $('#passwordDone').classList.remove('hidden');
        }
      } catch (error) { message(describe(error), true); }
      finally { button.disabled = false; }
    });
    $('#sendPasswordReset')?.addEventListener('click', async event => {
      const button = event.currentTarget;
      button.disabled = true;
      try {
        const { data, error } = await client.auth.getUser();
        if (error) throw error;
        if (!data.user?.email) throw new Error('Please log in again before requesting a reset link.');
        await sendLink(data.user.email, button);
      } catch (error) { message(describe(error), true); }
      finally { button.disabled = false; }
    });
    $('#requestResetForm')?.addEventListener('submit', event => {
      event.preventDefault();
      sendLink(event.target.elements.email.value.trim(), event.target.querySelector('[type="submit"]'));
    });
    return { message, describe };
  }
  window.IsabelaPassword = { bind };
  if (document.body.hasAttribute('data-password-page')) {
    const status = $('#passwordStatus');
    if (!window.supabase?.createClient) { status.textContent = 'Unable to load password recovery. Check your connection and reload.'; return; }
    const client = window.supabase.createClient(window.ISABELA_SUPABASE_URL, window.ISABELA_SUPABASE_KEY, {
      global: { fetch: window.IsabelaConnection.createFetch({ upstream: window.ISABELA_SUPABASE_URL, proxy: window.ISABELA_SUPABASE_PROXY }) },
    });
    const ui = bind(client);
    function showSession(session) {
      const signedIn = !!session?.user;
      $('#passwordForm').classList.toggle('hidden', !signedIn);
      $('#requestResetForm').classList.toggle('hidden', signedIn);
      $('#recoveryIntro').textContent = signedIn ? 'Choose and confirm your new password below.' : 'Enter your account email to request a password reset link.';
    }
    client.auth.onAuthStateChange((_event, session) => showSession(session));
    client.auth.getSession().then(({ data, error }) => {
      if (error) throw error;
      showSession(data.session);
    }).catch(error => ui.message(ui.describe(error), true));
    const params = new URLSearchParams(location.hash.slice(1));
    if (params.has('error_description')) {
      ui.message('This reset link is invalid or expired. Request a new link below.', true);
      history.replaceState(null, '', location.pathname);
    }
  }
})();
