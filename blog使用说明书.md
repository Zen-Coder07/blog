# 博客使用说明书

这份文档讲清楚一件事：**从写一篇文章，到它出现在线上，一共要动哪些地方。**

站点地址：[https://zen-coder07.github.io/blog/](https://zen-coder07.github.io/blog/)
仓库地址：[https://github.com/Zen-Coder07/blog](https://github.com/Zen-Coder07/blog)
自动化部署：[https://github.com/Zen-Coder07/blog/actions](https://github.com/Zen-Coder07/blog/actions)

\---

## 一、目录结构速查

```
blog/
├─ .github/workflows/deploy.yml   # push 到 main 自动构建 + 发布
├─ docs/                          # 站点根目录，所有内容都在这里
│  ├─ index.md                    # 首页（大标题、简介、入口按钮）
│  ├─ posts/
│  │  ├─ index.md                 # 「全部文章」列表页，手工维护
│  │  └─ 2026-11-13-hello-world.md  # 每篇文章一个文件
│  ├─ public/                     # 图片等静态资源，原样拷到站点根
│  └─ .vitepress/
│     ├─ config.mts               # 站点配置：标题、导航、侧边栏、搜索
│     └─ dist/                    # 构建产物（已 gitignore，不用管）
├─ package.json
└─ .gitattributes                 # 统一换行符为 LF
```

**记住一句话：内容写在 `docs/` 里，配置写在 `docs/.vitepress/config.mts` 里。**

\---

## 二、一次性准备（只做一次）

1. 装 Node.js（18+，本地用的是 24.x；CI 上跑 22）
2. 拉代码、装依赖：

```bash
   git clone git@github.com:Zen-Coder07/blog.git
   cd blog
   npm install
   ```

3. 确认 SSH 能连 GitHub：`ssh -T git@github.com`
4. 仓库 Settings → Pages → Source 选 **GitHub Actions**（改过一次就行，之后不用再碰）

\---

## 三、写一篇新文章

### 第 1 步：新建文件

路径固定：

```
docs/posts/2026-11-20-your-slug.md
```

* 前缀是**写作日期**，格式 `YYYY-MM-DD`
* 后半段是**英文短名**（用连字符，别用空格和中文），因为它直接成为 URL：

```
  https://zen-coder07.github.io/blog/posts/2026-11-20-your-slug.html
  ```

* 文件名一旦发布就**尽量别改**，改了等于旧链接 404

### 第 2 步：写文件头（frontmatter）

照抄现成的那篇 `docs/posts/2026-11-13-hello-world.md`：

```markdown
---
title: 文章标题
date: 2026-11-20
tags: \\\[排障, VitePress]
draft: false
---

# 文章标题

正文从这里开始……
```

字段说明：

|字段|作用|备注|
|-|-|-|
|`title`|文章标题|侧边栏和浏览器标签会用到|
|`date`|写作日期|便于以后按时间排序|
|`tags`|标签|纯记录用，当前没有标签页|
|`draft`|草稿标记|**当前不生效**，写了照样会被发布|

> 注意：`title` 和正文里的 `# 一级标题` 是两套东西。VitePress 用 `#` 那行渲染页面标题，`title` 用于页面 `<title>` 和侧边栏展示。两边写成一致的，观感最正常。

### 第 3 步：补两个入口（最容易漏）

文章文件放进去了，直接输 URL 能访问，但**不会自动出现在任何列表里**。必须手动加两处：

**① 左侧边栏** — `docs/.vitepress/config.mts`，找到 `sidebar` → `/posts/` → `items`，加一行：

```ts
{ text: '文章标题', link: '/posts/2026-11-20-your-slug' }
```

注意 `link` 里**不带 `.md` 后缀**，也不带 `.html`。

**② 文章总目录** — `docs/posts/index.md`，加一行：

```markdown
- \\\[文章标题](./2026-11-20-your-slug.md)
```

注意这里**带 `.md` 后缀**，因为是 Markdown 相对链接。

> 两处格式不一样，一个不带后缀一个带，这是最容易写错的地方。

### 图片放哪

放到 `docs/public/` 下，比如 `docs/public/img/architecture.png`，文章里这样引用：

```markdown
!\\\[架构图](/img/architecture.png)
```

因为配置了 `base: '/blog/'`，VitePress 会自动把 `/img/...` 处理成 `/blog/img/...`，不用手写前缀。

\---

## 四、本地看效果

```bash
npm run dev
```

打开 [http://localhost:5173/blog/](http://localhost:5173/blog/)

* **地址必须带 `/blog/`**，访问 `http://localhost:5173/` 会是 404 或白屏
* 改 Markdown 会热更新，不用重启
* 改 `config.mts`（导航、侧边栏）偶尔需要重启

其他命令：

```bash
npm run build     # 只构建，产物在 docs/.vitepress/dist
npm run preview   # 预览构建产物（发布前自检用）
```

\---

## 五、发布

```bash
git add -A
git commit -m "post: 文章标题"
git push origin main
```

push 到 `main` 就会自动触发部署，**大约 30～60 秒**完成。

想手动重跑：Actions 页面 → 选 `Deploy blog` → `Run workflow`。

\---

## 六、线上确认

1. 打开 [https://github.com/Zen-Coder07/blog/actions](https://github.com/Zen-Coder07/blog/actions)，看最新一次 `Deploy blog` 是绿色对勾
2. 打开 [https://zen-coder07.github.io/blog/](https://zen-coder07.github.io/blog/)，进文章列表看到新文章
3. 页面没更新就 `Ctrl + F5` 强刷，Pages 有缓存

\---

## 七、出问题怎么查

|现象|原因|处理|
|-|-|-|
|线上整站白屏、控制台一堆 404|`base` 和仓库名对不上|`config.mts` 里必须是 `base: '/blog/'`|
|文章能打开，但侧边栏/列表里没有|忘了改第 3 步的两处入口|回看「补两个入口」|
|侧边栏点了 404|用了 `.md` 后缀，或少了 `/posts/` 前缀|应为 `link: '/posts/2026-11-20-your-slug'`|
|sitemap 里 URL 是 404|`sitemap.hostname` 漏了子路径|必须是 `https://zen-coder07.github.io/blog/`|
|Actions 红了|构建失败|看日志，多数是 Markdown 里链接写错或 frontmatter 语法错|
|Windows 下 `npm` 报 `AuthorizationManager 检查失败`|执行策略拦截|改用 `npm.cmd run dev`|
|提交时整个仓库都标成改动|换行符|已有 `.gitattributes` 统一为 LF，别删|

\---

## 八、内容约定（自己定的规矩）

* **只写跑通过的东西。** 没跑通的，要么不写，要么写清楚卡在哪一步。
* **标题不是广告词。** 写清楚是什么问题、怎么解的，方便以后自己检索。
* **一篇文章一个文件**，别把不相关的主题塞一起。
* **提交信息**用 `post: xxx`（新文章）/ `fix: xxx`（修配置）/ `chore: xxx`（杂项）。

\---

## 附：加文章的最短路径（熟练后照这个抄）

```bash
# 1. 新建文件
#    docs/posts/2026-11-20-your-slug.md
# 2. 改 config.mts 侧边栏 + docs/posts/index.md 目录
# 3. 本地看
npm run dev
# 4. 发布
git add -A \\\&\\\& git commit -m "post: 文章标题" \\\&\\\& git push origin main
```

