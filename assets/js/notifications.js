/* Shared accessible action feedback. Credentials exist only in the open popup. */
(() => {
  'use strict';
  const popup = document.createElement('dialog');
  popup.id = 'notificationDialog';
  popup.className = 'notification-popup';
  popup.setAttribute('aria-labelledby', 'notificationTitle');
  popup.setAttribute('aria-describedby', 'notificationMessage');
  popup.innerHTML = '<button type="button" class="notification-close" aria-label="Close notification">×</button><span class="notification-symbol" aria-hidden="true">✓</span><h2 id="notificationTitle"></h2><p id="notificationMessage" role="status"></p><div id="notificationDetails"></div><button type="button" class="btn notification-done">Done</button>';
  document.body.append(popup);
  const details = popup.querySelector('#notificationDetails');
  let sensitive = false;
  const clear = () => { details.querySelectorAll('input').forEach(input => input.value = ''); details.replaceChildren(); sensitive = false; };
  popup.querySelectorAll('.notification-close,.notification-done').forEach(button => button.addEventListener('click', () => popup.close()));
  popup.addEventListener('close', () => { if (!popup.open) clear(); });
  window.IsabelaNotifications = {
    show(message, { type = 'success', title, credentials } = {}) {
      clear();
      if (type !== 'error') document.querySelectorAll('dialog[open]').forEach(dialog => { if (dialog !== popup) dialog.close(); });
      popup.dataset.type = type;
      popup.querySelector('#notificationTitle').textContent = title || (type === 'error' ? 'Action could not be completed' : 'Action completed');
      popup.querySelector('#notificationMessage').textContent = message;
      popup.querySelector('.notification-symbol').textContent = type === 'error' ? '!' : '✓';
      if (credentials) {
        sensitive = true;
        for (const [name, value] of [['Email', credentials.email], ['Initial password', credentials.password]]) {
          const label = document.createElement('label');
          label.textContent = name;
          const input = document.createElement('input');
          input.id = name === 'Email' ? 'notificationEmail' : 'notificationPassword';
          input.value = value; input.readOnly = true;
          input.type = name === 'Email' ? 'text' : 'password';
          input.autocomplete = 'off'; label.append(input); details.append(label);
        }
        const toggle = document.createElement('button');
        toggle.type = 'button'; toggle.className = 'text-button'; toggle.textContent = 'Show password';
        toggle.setAttribute('aria-pressed', 'false');
        toggle.addEventListener('click', () => {
          const input = details.querySelector('#notificationPassword');
          const show = input.type === 'password'; input.type = show ? 'text' : 'password';
          toggle.textContent = show ? 'Hide password' : 'Show password'; toggle.setAttribute('aria-pressed', String(show));
        });
        details.append(toggle);
      }
      const legacy = document.querySelector('#toast');
      if (legacy) { legacy.textContent = message; legacy.className = 'toast hidden'; }
      if (!popup.open) popup.showModal();
      popup.scrollTop = 0;
      popup.querySelector('.notification-done').focus();
    },
    carryToNextPage() {
      if (!popup.open || sensitive) return;
      try { sessionStorage.setItem('hapisabela-notice', JSON.stringify({message:popup.querySelector('#notificationMessage').textContent,type:popup.dataset.type,title:popup.querySelector('#notificationTitle').textContent})); } catch {}
    },
  };
  try {
    const stored = sessionStorage.getItem('hapisabela-notice');
    sessionStorage.removeItem('hapisabela-notice');
    if (stored) { const notice = JSON.parse(stored); window.IsabelaNotifications.show(notice.message, notice); }
  } catch {}
})();
