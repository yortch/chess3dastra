const requestedTheme = new URLSearchParams(window.location.search).get('scoutTheme');
const theme = ['light', 'dark'].includes(requestedTheme)
  ? requestedTheme
  : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
document.documentElement.dataset.theme = theme;
document.documentElement.dataset.mode = theme;
