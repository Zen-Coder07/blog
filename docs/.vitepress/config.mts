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
            { text: '1600 行写一个奶茶店点单系统：11 个 bug', link: '/posts/2026-11-15-milktea-saga' }
          ]
        },
        {
          text: '建站与工具',
          items: [
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
