import { createRouter, createWebHistory } from 'vue-router';
import { getActivePinia } from 'pinia';
import { useAuthStore } from '../stores/auth';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('../views/HomeView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/LoginView.vue'),
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('../views/RegisterView.vue'),
    },
    {
      path: '/setup-password',
      name: 'setup-password',
      component: () => import('../views/SetupPassword.vue'),
    },
    {
      path: '/users',
      name: 'user-management',
      component: () => import('../views/UserManagement.vue'),
      meta: { requiresAuth: true, requiresAdmin: true },
    },
    {
      path: '/auth/callback',
      name: 'auth-callback',
      component: () => import('../views/AuthCallbackView.vue'),
    },
    {
      path: '/mockup/button',
      name: 'button-mockup',
      component: () => import('../views/ButtonShowcaseView.vue'),
      meta: { title: 'Button Component Mockup - SIDATA' },
    },
    {
      path: '/mockup/link',
      name: 'link-mockup',
      component: () => import('../views/LinkShowcaseView.vue'),
      meta: { title: 'Link Component Mockup - SIDATA' },
    },
    {
      path: '/link',
      redirect: '/mockup/link',
    },
    {
      path: '/mockup/navbar',
      name: 'navbar-mockup',
      component: () => import('../views/NavbarShowcaseView.vue'),
      meta: { title: 'Navbar Component Mockup - SIDATA' },
    },
    {
      path: '/navbar',
      redirect: '/mockup/navbar',
    },
    {
      path: '/mockup/footer',
      name: 'footer-mockup',
      component: () => import('../views/FooterShowcaseView.vue'),
      meta: { title: 'Footer Component Mockup - SIDATA' },
    },
    {
      path: '/footer',
      redirect: '/mockup/footer',
    },
    {
      path: '/mockup/bar-diagram',
      name: 'bar-diagram-mockup',
      component: () => import('../views/BarDiagramShowcaseView.vue'),
      meta: { title: 'Bar Diagram Component Mockup - SIDATA' },
    },
    {
      path: '/bar-diagram',
      redirect: '/mockup/bar-diagram',
    },
    {
      path: '/mockup/stat-card',
      name: 'stat-card-mockup',
      component: () => import('../views/StatCardShowcaseView.vue'),
      meta: { title: 'Stat Card Component Mockup - SIDATA' },
    },
    {
      path: '/stat-card',
      redirect: '/mockup/stat-card',
    },
    {
      path: '/mockup/stat-overview',
      name: 'stat-overview-mockup',
      component: () => import('../views/StatOverviewShowcaseView.vue'),
      meta: { title: 'Stat Overview Component Mockup - SIDATA' },
    },
    {
      path: '/stat-overview',
      redirect: '/mockup/stat-overview',
    },
    {
      path: '/mockup/huge-quote',
      name: 'huge-quote-mockup',
      component: () => import('../views/HugeQuoteShowcaseView.vue'),
      meta: { title: 'HugeQuote Component Mockup - SIDATA' },
    },
    {
      path: '/huge-quote',
      redirect: '/mockup/huge-quote',
    },
    {
      path: '/mockup/hero',
      name: 'hero-mockup',
      component: () => import('../views/HeroShowcaseView.vue'),
      meta: { title: 'SectionHero Component Mockup - SIDATA' },
    },
    {
      path: '/hero',
      redirect: '/mockup/hero',
    },
  ],
});

router.beforeEach(async (to) => {
  const pinia = getActivePinia();
  if (!pinia) return;

  const authStore = useAuthStore(pinia);

  if (to.name === 'setup-password') {
    if (!authStore.setupToken && !authStore.mustChangePassword) {
      return { name: 'login', query: { reason: 'setup_required' } };
    }
  }

  if (!authStore.isAuthenticated && to.name !== 'setup-password' && !authStore.mustChangePassword) {
    await authStore.initAuth();
  }

  if (authStore.mustChangePassword && to.name !== 'setup-password') {
    return { name: 'setup-password' };
  }

  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    return { name: 'login' };
  }

  if (to.meta.requiresAdmin && !authStore.isAdmin) {
    return { name: 'home' };
  }

  if ((to.name === 'login' || to.name === 'register') && authStore.isAuthenticated) {
    return { name: 'home' };
  }
});

export default router;
