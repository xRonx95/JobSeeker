(() => {
  'use strict';
  window.IsabelaAuth = {
    bind({ client, signedIn }) {
      const $ = selector => document.querySelector(selector);
      const form = $('#authForm'), dialog = $('#authDialog'), status = $('#authStatus');
      let mode = 'login', busy = false;
      function render() {
        const signup = mode === 'register';
        $('#authTitle').textContent = signup ? 'Create your account' : 'Log in to Isabela Careers';
        $('#authSubtitle').textContent = signup ? 'Find your next role or your next great team member.' : 'Your next opportunity starts here.';
        $('#registerFields').classList.toggle('hidden', !signup);
        $('#signupExtras').classList.toggle('hidden', !signup);
        ['registerName','roleSelect','registerPhone','signupConsent'].forEach(id => $('#'+id).disabled = !signup);
        $('#registerName').required = signup;
        $('#signupConsent').required = signup;
        const company = signup && $('#roleSelect').value === 'company';
        $('#registerCompanyField').classList.toggle('hidden', !company);
        $('#registerCompany').disabled = !company; $('#registerCompany').required = company;
        $('#authPassword').autocomplete = signup ? 'new-password' : 'current-password';
        $('#authSubmit').textContent = signup ? 'Sign up' : 'Log in';
        $('#authForgot').classList.toggle('hidden', signup);
        $('#authSwitchPrompt').textContent = signup ? 'Already have an account?' : "Don't have an account yet?";
        $('#toggleAuth').textContent = signup ? 'Sign in' : 'Create your account';
      }
      function show(nextMode = 'login') {
        if (busy) return;
        mode = nextMode === 'register' ? 'register' : 'login';
        form.reset(); status.textContent = ''; render();
        if (!dialog.open) dialog.showModal();
      }
      $('#toggleAuth').addEventListener('click', () => { if (busy) return; mode = mode === 'login' ? 'register' : 'login'; status.textContent=''; render(); });
      $('#roleSelect').addEventListener('change', render);
      dialog.addEventListener('close', () => { form.reset(); });
      dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
      form.addEventListener('submit', async event => {
        event.preventDefault(); if (busy) return;
        const signup = mode === 'register', f = new FormData(form);
        const role = f.get('requested_role');
        if (signup && !['seeker','company'].includes(role)) { status.textContent = 'Choose Job seeker or Company / Employer.'; return; }
        busy = true;
        $('#authSubmit').disabled = true; $('#toggleAuth').disabled = true; dialog.querySelector('[data-close]').disabled = true;
        status.className = ''; status.textContent = signup ? 'Creating your account…' : 'Logging in…';
        try {
          const credentials = { email: f.get('email').trim(), password: f.get('password') };
          const { data, error } = signup
            ? await client.auth.signUp({ ...credentials, options: { emailRedirectTo: location.origin + '/', data: {
              full_name: f.get('full_name').trim(), requested_role: role, company_name: role === 'company' ? f.get('company_name').trim() : '', phone: f.get('phone')?.trim() || '',
            } } })
            : await client.auth.signInWithPassword(credentials);
          if (error) throw error;
          form.elements.password.value = '';
          if (signup && !data.session) {
            status.className = 'password-feedback';
            status.textContent = 'Registration received. Check your email to confirm your account before logging in.' + (role === 'company' ? ' Company accounts also need administrator approval before posting jobs.' : '');
          } else {
            dialog.close();
            await signedIn(data.user);
          }
        } catch (error) {
          status.className = 'password-error';
          status.textContent = error.status === 429 ? 'Too many requests. Please wait before trying again.'
            : error.code === 'signup_disabled' || /database error saving new user/i.test(error.message) ? 'Signup is not enabled yet. The project owner must enable signup and apply the latest signup migration.'
              : error.message || 'Unable to sign in. Please try again.';
        } finally { busy = false; $('#authSubmit').disabled = false; $('#toggleAuth').disabled = false; dialog.querySelector('[data-close]').disabled = false; }
      });
      render();
      return { show };
    },
  };
})();
