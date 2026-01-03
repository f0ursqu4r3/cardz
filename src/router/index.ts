import { createRouter, createWebHistory } from 'vue-router'

import LandingView from '../views/LandingView.vue'
import TableBrowserView from '../views/TableBrowserView.vue'
import TableView from '../views/TableView.vue'

const router = createRouter({
  history: createWebHistory('/'),
  routes: [
    {
      path: '/',
      name: 'landing',
      component: LandingView,
    },
    {
      path: '/browse',
      name: 'browser',
      component: TableBrowserView,
    },
    {
      path: '/table/new',
      name: 'table-new',
      component: TableView,
    },
    {
      path: '/table/:code',
      name: 'table',
      component: TableView,
    },
  ],
})

export default router
