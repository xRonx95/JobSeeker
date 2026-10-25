(() => {
  'use strict';
  window.IsabelaSeekerProfile = {
    create({ client, user, notify }) {
      const form = document.querySelector('#profileForm');
      const status = document.querySelector('#seekerProfileStatus');
      const submit = form.querySelector('[type="submit"]');
      const tabs = [...form.querySelectorAll('[role="tab"]')];
      let ready = false;
      function select(name, focus = false) {
        tabs.forEach(tab => {
          const active = tab.dataset.profileTab === name;
          tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1;
          document.getElementById(tab.getAttribute('aria-controls')).hidden = !active;
          if (active && focus) tab.focus();
        });
      }
      tabs.forEach((tab, index) => {
        tab.addEventListener('click', () => select(tab.dataset.profileTab));
        tab.addEventListener('keydown', event => {
          const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
          if (next < 0) return;
          event.preventDefault(); select(tabs[next].dataset.profileTab, true);
        });
      });
      form.addEventListener('invalid', event => {
        const panel = event.target.closest('[role="tabpanel"]');
        if (panel) select(panel.id.replace('panel-', ''));
      }, true);
      const describe = error => ['PGRST205','PGRST202','42P01','42883'].includes(error.code)
        ? 'Personal information storage needs setup. Ask the site owner to apply migrations/005-seeker-information.sql, then reopen this page.'
        : error.message || 'Unable to save personal information. Please try again.';
      return {
        async load() {
          ready = false; submit.disabled = true; status.textContent = 'Loading your information…';
          const { data, error } = await client.from('seeker_information').select('*').eq('user_id', user().id).maybeSingle();
          if (error) { status.textContent = describe(error); throw new Error(describe(error)); }
          [...form.elements].filter(field => field.name?.includes('.')).forEach(field => {
            const [section, name] = field.name.split('.'); field.value = data?.[section]?.[name] ?? '';
          });
          ready = true; submit.disabled = false; status.textContent = '';
        },
        async save() {
          if (!ready || submit.disabled) return;
          submit.disabled = true; status.textContent = 'Saving your information…';
          const values = new FormData(form);
          const sections = { personal: {}, education: {}, family: {}, background: {} };
          for (const [name, value] of values) {
            const [section, field] = name.split('.');
            if (field && sections[section]) sections[section][field] = value.trim();
          }
          try {
            const { error } = await client.rpc('save_my_seeker_information', {
              p_name: values.get('full_name'), p_phone: values.get('phone'), p_location: values.get('location'), p_bio: values.get('bio'),
              p_personal: sections.personal, p_education: sections.education, p_family: sections.family, p_background: sections.background,
            });
            if (error) throw error;
            status.textContent = 'Your personal information has been saved.';
            notify(status.textContent);
            return true;
          } catch (error) { status.textContent = describe(error); notify(status.textContent, 'error'); return false; }
          finally { submit.disabled = false; }
        },
      };
    },
  };
})();
