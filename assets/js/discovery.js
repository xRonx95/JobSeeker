/* Directory shortcuts reuse the portal's existing vacancy filters. */
document.addEventListener('click', event => {
  const button = event.target.closest('[data-discover-category], [data-discover-location]');
  if (!button) return;
  const category = button.hasAttribute('data-discover-category');
  const input = document.querySelector(category ? '#categoryFilter' : '#locationSearch');
  input.value = category ? button.dataset.discoverCategory : button.dataset.discoverLocation;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  document.querySelector('#heroSearch').requestSubmit();
});
