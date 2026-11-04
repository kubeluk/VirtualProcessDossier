import { createRouter, createWebHistory } from 'vue-router'
export default createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  scrollBehavior(to, from, saved) {
    if (saved) return saved
    if (to.path === from.path) return
    return { top: 0 }
  },
  routes: [
    {
      path: '/',
      name: 'overview',
      component: () => import('../views/OverviewView.vue'),
      meta: { title: 'Context overview' },
    },
    {
      path: '/runs',
      name: 'runs',
      component: () => import('../views/BrowseView.vue'),
      props: { kind: 'runs' },
      meta: { title: 'Production runs' },
    },
    {
      path: '/runs/new',
      name: 'new-run',
      component: () => import('../views/PrepareRunView.vue'),
      meta: { title: 'Prepare a run' },
    },
    {
      path: '/run',
      name: 'run',
      component: () => import('../views/RunView.vue'),
      meta: { title: 'Run context' },
    },
    {
      path: '/datasets',
      name: 'datasets',
      component: () => import('../views/BrowseView.vue'),
      props: { kind: 'datasets' },
      meta: { title: 'Datasets' },
    },
    {
      path: '/dataset',
      name: 'dataset',
      component: () => import('../views/DatasetView.vue'),
      meta: { title: 'Dataset context' },
    },
    {
      path: '/laminates',
      name: 'laminates',
      component: () => import('../views/ReferenceView.vue'),
      props: { kind: 'laminates' },
      meta: { title: 'Laminates' },
    },
    {
      path: '/laminates/new',
      component: () => import('../views/LaminateEditorView.vue'),
      meta: { title: 'Create laminate' },
    },
    {
      path: '/laminate/edit',
      component: () => import('../views/LaminateEditorView.vue'),
      meta: { title: 'Edit laminate' },
    },
    {
      path: '/laminate',
      name: 'laminate',
      component: () => import('../views/LaminateView.vue'),
      meta: { title: 'Laminate context' },
    },
    {
      path: '/equipment',
      name: 'equipment',
      component: () => import('../views/ReferenceView.vue'),
      props: { kind: 'equipment' },
      meta: { title: 'Equipment' },
    },
    {
      path: '/process',
      name: 'process',
      component: () => import('../views/ProcessView.vue'),
      meta: { title: 'Process definition' },
    },
    {
      path: '/entity',
      name: 'entity',
      component: () => import('../views/EntityView.vue'),
      meta: { title: 'Related context' },
    },
    { path: '/catalog', redirect: '/datasets' },
    {
      path: '/:pathMatch(.*)*',
      component: () => import('../views/NotFoundView.vue'),
      meta: { title: 'Page not found' },
    },
  ],
})
