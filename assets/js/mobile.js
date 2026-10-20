/* App-style navigation uses the same accounts, filters, and data as the website. */
(() => {
  'use strict';
  window.HapMobile = {
    create(ctx) {
      const $ = s => document.querySelector(s);
      const $$ = s => [...document.querySelectorAll(s)];
      const accountActions = document.createElement('div');
      accountActions.className = 'mobile-menu-account';
      accountActions.innerHTML = '<button type="button" data-auth="login" data-mobile-login>Log in</button><button type="button" data-auth="register" data-mobile-login>Create an account</button><button type="button" data-mobile-logout class="hidden">Log out</button>';
      $('#nav').append(accountActions);
      function update(view = ctx.view()) {
        const profile = ctx.profile();
        const name = profile?.full_name?.trim().split(/\s+/)[0];
        $('#mobileGreeting').textContent = name ? `Hello, ${name}` : 'Hello, there';
        $('#mobileInitials').textContent = profile?.full_name?.trim().split(/\s+/).slice(0,2).map(part=>part[0]).join('').toUpperCase() || 'HI';
        $('#mobileActivityLabel').textContent = profile?.role === 'admin' ? 'Manage' : profile?.role === 'company' ? 'Workspace' : 'Activity';
        $$('[data-mobile-login]').forEach(button=>button.classList.toggle('hidden',!!ctx.user()));
        $('[data-mobile-logout]').classList.toggle('hidden',!ctx.user());
        const selected = view === 'home' ? ($('#savedOnly').checked ? 'saved' : 'discover') : view === 'profile' ? 'account' : ['applications','dashboard','admin','post'].includes(view) ? 'activity' : '';
        $$('#mobileDock button').forEach(button => {
          const active = button.dataset.mobileDestination === selected;
          button.classList.toggle('active',active);
          if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
        });
        $$('[data-mobile-category]').forEach(button => {
          const active = button.dataset.mobileCategory === $('#categoryFilter').value;
          button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));
        });
      }
      function destination(target) {
        if(target==='discover'||target==='saved') {
          if(target==='saved'&&!ctx.user())return ctx.showAuth();
          $('#savedOnly').checked=target==='saved';
          if(target==='discover')$('#savedOnly').checked=false;
          ctx.go('home');ctx.renderJobs();update('home');
          return;
        }
        if(!ctx.user())return ctx.showAuth();
        if(target==='account')ctx.go('profile');
        else ctx.go(ctx.profile()?.role==='admin'?'admin':ctx.profile()?.role==='company'?'dashboard':'applications');
      }
      $('#mobileFilterToggle').addEventListener('click',()=>{
        const open=document.body.classList.toggle('mobile-filters-open');
        $('#mobileFilterToggle').setAttribute('aria-expanded',String(open));
        $('#mobileFilterToggle').setAttribute('aria-label',open?'Hide job filters':'Show job filters');
      });
      document.addEventListener('click',event=>{
        if(event.target.closest('[data-mobile-logout]')){ctx.signout();return;}
        const button=event.target.closest('[data-mobile-destination],[data-mobile-category],[data-mobile-browse]');
        if(!button)return;
        if(button.hasAttribute('data-mobile-destination'))destination(button.dataset.mobileDestination);
        if(button.hasAttribute('data-mobile-category')){
          $('#categoryFilter').value=button.dataset.mobileCategory;
          ctx.renderJobs();update();
        }
        if(button.hasAttribute('data-mobile-browse'))$('#jobsArea').scrollIntoView({behavior:'smooth',block:'start'});
      });
      $('#categoryFilter').addEventListener('input',()=>update());
      $('#savedOnly').addEventListener('change',()=>update());
      const install = $('#installApp');
      accountActions.append(install);
      let installPrompt;
      window.addEventListener('beforeinstallprompt',event=>{
        event.preventDefault();installPrompt=event;
        install.classList.remove('hidden');
      });
      install.addEventListener('click',async()=>{
        if(!installPrompt)return;
        await installPrompt.prompt();
        await installPrompt.userChoice;
        installPrompt=null;install.classList.add('hidden');
      });
      window.addEventListener('appinstalled',()=>install.classList.add('hidden'));
      if('serviceWorker' in navigator && (location.protocol==='https:'||location.hostname==='127.0.0.1'||location.hostname==='localhost'))
        window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));
      return {update};
    },
  };
})();
