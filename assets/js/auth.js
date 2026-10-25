(() => {
  'use strict';
  window.IsabelaAuth = {
    bind({ client, signedIn }) {
      const $ = selector => document.querySelector(selector);
      const form = $('#authForm'), dialog = $('#authDialog'), status = $('#authStatus');
      let mode = 'login', busy = false, currentPolicies=null, policyRequest=0;
      function enableSubmit(){ $('#authSubmit').disabled=busy||!currentPolicies||!$('#signupConsent').checked||!$('#privacyAcknowledgment').checked||(!$('#employerAcknowledgment').disabled&&!$('#employerAcknowledgment').checked); }
      async function loadPolicies(){const request=++policyRequest;currentPolicies=null;enableSubmit();try{
        const company=mode==='register'&&$('#roleSelect').value==='company';
        const policies=await window.HapPolicies.current(client,company?['terms','privacy','employer']:['terms','privacy']);
        if(request!==policyRequest)return;currentPolicies=policies;$('#authPolicyVersions').textContent=Object.values(policies).map(p=>p.title+': '+p.version).join(' ? ');
      }catch(error){if(request===policyRequest)$('#authPolicyVersions').textContent=error.message;}enableSubmit();}
      function render() {
        const signup = mode === 'register';
        $('#authTitle').textContent = signup ? 'Create your HapIsabela account' : 'Log in to HapIsabela';
        $('#authSubtitle').textContent = signup ? 'Find your next role or your next great team member.' : 'Your next opportunity starts here.';
        $('#registerFields').classList.toggle('hidden', !signup);
        $('#signupExtras').classList.toggle('hidden', !signup);
        ['registerName','roleSelect','registerPhone'].forEach(id => $('#'+id).disabled = !signup);
        $('#registerName').required = signup;
        $('#signupConsent').required = true;
        const company = signup && $('#roleSelect').value === 'company';
        $('#employerAcknowledgmentField').classList.toggle('hidden',!company);$('#employerAcknowledgment').disabled=!company;$('#employerAcknowledgment').required=company;
        $('#optionalAlertsField').classList.toggle('hidden',!signup);$('#optionalAlerts').disabled=!signup;
        $('#authAgreementTitle').textContent=signup?'HapIsabela ? Registration Terms and Privacy':'HapIsabela ? Sign In Agreement';
        ['signupConsent','privacyAcknowledgment','employerAcknowledgment','optionalAlerts'].forEach(id=>$('#'+id).checked=false);
        $('#registerCompanyField').classList.toggle('hidden', !company);
        $('#registerCompany').disabled = !company; $('#registerCompany').required = company;
        $('#authPassword').autocomplete = signup ? 'new-password' : 'current-password';
        $('#authSubmit').textContent = signup ? 'Sign up' : 'Log in';
        $('#authForgot').classList.toggle('hidden', signup);
        $('#authSwitchPrompt').textContent = signup ? 'Already have an account?' : "Don't have an account yet?";
        $('#toggleAuth').textContent = signup ? 'Sign in' : 'Create an account · Sign up';
        $('#toggleAuth').classList.toggle('signup-callout', !signup);loadPolicies();
      }
      function show(nextMode = 'login') {
        if (busy) return;
        mode = nextMode === 'register' ? 'register' : 'login';
        form.reset(); status.textContent = ''; render();
        if (!dialog.open) dialog.showModal();
      }
      $('#toggleAuth').addEventListener('click', () => { if (busy) return; mode = mode === 'login' ? 'register' : 'login'; status.textContent=''; render(); });
      $('#roleSelect').addEventListener('change', render);
      ['signupConsent','privacyAcknowledgment','employerAcknowledgment'].forEach(id=>$('#'+id).addEventListener('change',enableSubmit));
      dialog.addEventListener('close', () => { form.reset(); });
      dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
      form.addEventListener('submit', async event => {
        event.preventDefault(); if (busy) return;
        const signup = mode === 'register', f = new FormData(form);
        const role = f.get('requested_role');
        if(!currentPolicies||!$('#signupConsent').checked||!$('#privacyAcknowledgment').checked||(!$('#employerAcknowledgment').disabled&&!$('#employerAcknowledgment').checked)){status.textContent='Review and acknowledge current policies before continuing.';window.IsabelaNotifications.show(status.textContent,{type:'error'});return;}
        if (signup && !['seeker','company'].includes(role)) { status.textContent = 'Choose Job seeker or Company / Employer.'; window.IsabelaNotifications.show(status.textContent, {type:'error'}); return; }
        busy = true;
        $('#authSubmit').disabled = true; $('#toggleAuth').disabled = true; dialog.querySelector('[data-close]').disabled = true;
        status.className = ''; status.textContent = signup ? 'Creating your account…' : 'Logging in…';
        try {
          const credentials = { email: f.get('email').trim(), password: f.get('password') };
          const { data, error } = signup
            ? await client.auth.signUp({ ...credentials, options: { emailRedirectTo: location.origin + '/', data: {
              policy_ids:Object.values(currentPolicies).map(p=>p.id),terms_ack:true,privacy_ack:true,employer_ack:role==='company',optional_alerts:$('#optionalAlerts').checked,full_name: f.get('full_name').trim(), requested_role: role, company_name: role === 'company' ? f.get('company_name').trim() : '', phone: f.get('phone')?.trim() || '',
            } } })
            : await client.auth.signInWithPassword(credentials);
          if (error) throw error;
          form.elements.password.value = '';
          if (signup && !data.session) {
            status.className = 'password-feedback';
            status.textContent = 'Registration received. Check your email to confirm your account before logging in.' + (role === 'company' ? ' Company accounts also need administrator approval before posting jobs.' : '');
            window.IsabelaNotifications.show(status.textContent, {title:'Registration received'});
          } else {
            dialog.close();
            window.IsabelaNotifications.show(signup ? 'Your account has been created.' + (role === 'company' ? ' Administrator approval is required before posting jobs.' : '') : 'You have logged in successfully.', {title:signup ? 'Account created' : 'Welcome back'});
            await window.HapPolicies.acknowledge(client,[currentPolicies.terms.id,currentPolicies.privacy.id]);
            await signedIn(data.user);
          }
        } catch (error) {
          status.className = 'password-error';
          status.textContent = error.status === 429 ? 'Too many requests. Please wait before trying again.'
            : error.code === 'signup_disabled' || /database error saving new user/i.test(error.message) ? 'Signup is not enabled yet. The project owner must enable signup and apply the latest signup migration.'
              : error.message || 'Unable to sign in. Please try again.';
          window.IsabelaNotifications.show(status.textContent, {type:'error'});
        } finally { busy = false; enableSubmit(); $('#toggleAuth').disabled = false; dialog.querySelector('[data-close]').disabled = false; }
      });
      render();
      return { show };
    },
  };
})();
