import { initHomePage } from './pages/home.js';
import { initLoginPage } from './pages/login.js';

const page = document.body.dataset.page;

if (page === 'home') {
  initHomePage();
} else if (page === 'login') {
  initLoginPage();
}
