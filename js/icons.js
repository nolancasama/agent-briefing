/* Small, dependency-free interface icon set. Content emoji stay in DATA. */
'use strict';

const Icons = (() => {
  const paths = {
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
    play: '<path d="m8 5 11 7-11 7Z"/>',
    send: '<path d="m3 11 18-8-8 18-2-8Z"/><path d="m11 13 4-4"/>',
    retry: '<path d="M20 7v5h-5"/><path d="M19 12a7 7 0 1 0-2 5"/>',
    soundOn: '<path d="M5 9H2v6h3l5 4V5Z"/><path d="M14 9a4 4 0 0 1 0 6M17 6a8 8 0 0 1 0 12"/>',
    soundOff: '<path d="M5 9H2v6h3l5 4V5Z"/><path d="m15 9 6 6M21 9l-6 6"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    skip: '<path d="m5 5 9 7-9 7ZM18 5v14"/>',
    folder: '<path d="M3 6h7l2 2h9v11H3Z"/><path d="M3 10h18"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    archive: '<path d="M4 8h16v12H4Z"/><path d="M3 4h18v4H3ZM9 12h6"/>',
    medal: '<circle cx="12" cy="9" r="5"/><path d="m8 13-2 8 6-3 6 3-2-8"/>',
    clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2M9 10h6M9 14h6"/>',
    id: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M6 16c.8-2 5.2-2 6 0M14 10h4M14 14h4"/>',
    back: '<path d="m14 6-6 6 6 6"/><path d="M8 12h12"/>',
    building: '<path d="M4 21V8l8-5 8 5v13M8 21v-5h8v5M8 10h2M14 10h2"/>',
  };

  function icon(name, size = 20, className = '') {
    return `<svg class="icon ${className}" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths[name] || ''}</svg>`;
  }

  const api = { icon };
  Object.keys(paths).forEach(name => { api[name] = (size, className) => icon(name, size, className); });
  return api;
})();
