import home from '../Images/bg-home.webp';
import homeMobile from '../Images/bg-home-mobile.webp';
import hangman from '../Images/bg-hangman.webp';
import hangmanMobile from '../Images/bg-hangman-mobile.webp';
import illucia from '../Images/bg-illucia.jpg';
import illuciaMobile from '../Images/bg-illucia-mobile.jpg';
import hall from '../Images/bg-hall.webp';
import hallMobile from '../Images/bg-hall-mobile.webp';
import artsy from '../Images/artsy.png';
import professor from '../Images/ronnyai.png';
import illuciaFigure from '../Images/illucia.webp';
import { createImagePreloader } from './preload-images.js';

export const MOBILE_ART_MEDIA = '(max-width: 800px)';
const backgrounds = {
  '/': { desktop: home, mobile: homeMobile, position: 'center' },
  '/hangman': { desktop: hangman, mobile: hangmanMobile, position: 'top', blend: 'color-burn' },
  '/illucia': { desktop: illucia, mobile: illuciaMobile, position: 'top' },
  '/illucia-observatory': { desktop: illucia, mobile: illuciaMobile, position: 'top' },
  '/hall-of-fame': { desktop: hall, mobile: hallMobile, position: 'top' },
};

export function getPageArt(pathname) {
  return backgrounds[pathname.replace(/\/$/, '') || '/'] || backgrounds['/'];
}

const preload = createImagePreloader((url) => {
  const image = new Image();
  image.src = url;
  return image.decode();
});

// Start only the artwork a visitor expresses interest in; don't download every
// page in the background or compete with the first page on a slow connection.
export function prefetchLinkArt(event) {
  const connection = navigator.connection;
  if (connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType || '')) return;
  const anchor = event.target.closest?.('a[href]');
  if (!anchor) return;
  const url = new URL(anchor.href);
  if (url.origin !== window.location.origin) return;
  const path = url.pathname.replace(/\/$/, '') || '/';
  if (!backgrounds[path] && path !== '/login' && path !== '/signup') return;
  const art = getPageArt(path);
  preload(window.matchMedia(MOBILE_ART_MEDIA).matches ? art.mobile : art.desktop);
  if (path === '/' || path === '/hangman') {
    preload(artsy);
    preload(professor);
  }
  if (path === '/') preload(illuciaFigure);
}
