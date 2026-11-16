import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Zen-Coder07 的技术博客',
  description: '写代码、排障、折腾的记录',
  lang: 'zh-CN',
  base: '/blog/',
  lastUpdated: true,
  sitemap: { hostname: 'https://zen-coder07.github.io/blog/' },
  themeConfig: {
    outline: { level: [2, 3], label: '本页目录' },
    nav: [
      { text: '首页', link: '/' },
      { text: '文章', link: '/posts/' }
    ],
    sidebar: {
      '/posts/': [
        {
          text: 'Java',
          items: [
            { text: '1600 行写一个奶茶店点单系统：11 个 bug', link: '/posts/2026-11-15-milktea-saga' },
            { text: '用 Java 写一个控制台扫雷：BFS 与 8 个调试教训', link: '/posts/2026-11-15-minesweeper' }
          ]
        },
        {
          text: '数据库',
          items: [
            { text: 'EXPLAIN：索引明明加了，为什么还是没走', link: '/posts/2026-11-16-mysql-explain-index' }
          ]
        },
        {
          text: '全栈',
          items: [
            { text: '一个 CRUD 的全栈链路：契约是怎么断的', link: '/posts/2026-11-16-fullstack-crud' }
          ]
        },
        {
          text: '建站与工具',
          items: [
            { text: '本地 build 通过，CI 却红了：死链事故', link: '/posts/2026-11-16-vitepress-dead-link-ci' },
            { text: '开篇：这个博客怎么搭的', link: '/posts/2026-11-13-hello-world' }
          ]
        }
      ]
    },
    search: { provider: 'local' },
    docFooter: { prev: '上一篇', next: '下一篇' },
    socialLinks: [{ icon: 'github', link: 'https://github.com/Zen-Coder07' }]
  }
})
