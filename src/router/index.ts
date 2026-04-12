import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'
import CatalogView from '@/views/CatalogView.vue'
import DatasetView from '@/views/DatasetView.vue'
import WorkflowListView from '@/views/WorkflowListView.vue'
import WorkflowView from '@/views/WorkflowView.vue'
import RunView from '@/views/RunView.vue'
import ActivityListView from '@/views/ActivityListView.vue'
import SystemListView from '@/views/SystemListView.vue'
import SystemView from '@/views/SystemView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
    },
    {
      path: '/catalog',
      name: 'catalog',
      component: CatalogView,
    },
    {
      path: '/dataset',
      name: 'dataset',
      component: DatasetView,
    },
    {
      path: '/workflows',
      name: 'workflows',
      component: WorkflowListView,
    },
    {
      path: '/workflow',
      name: 'workflow',
      component: WorkflowView,
    },
    {
      path: '/run',
      name: 'run',
      component: RunView,
    },
    {
      path: '/activities',
      name: 'activities',
      component: ActivityListView,
    },
    {
      path: '/systems',
      name: 'systems',
      component: SystemListView,
    },
    {
      path: '/system',
      name: 'system',
      component: SystemView,
    },
  ],
})

export default router
