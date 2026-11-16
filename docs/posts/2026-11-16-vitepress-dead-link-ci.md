---
title: 本地 build 通过，CI 却红了：一次 VitePress 死链事故
date: 2026-11-16
tags: [VitePress, 部署, 排障]
draft: false
---

# 本地 build 通过，CI 却红了：一次 VitePress 死链事故

> **一句话结论：** 本地构建会看到工作区里的未提交文件，CI 只看仓库里已有的文件；文章互相链接时，「本地绿、CI 红」多半就是死链检查。

## 现象

给博客加了一篇 MySQL 排障文章，只提交了这一个文件，push 后 GitHub Actions 的结果是：

| 步骤 | 结果 |
|---|---|
| `npm ci` | 成功 |
| `npm run build` | 失败 |
| `deploy` | 跳过 |

线上表现：首页和旧文章正常，新文章的 URL 404——失败的部署不会替换正在服务的版本。

本地执行同一条命令却是成功的：

```bash
npm run build
# ✓ build complete
```

死链检查的报错是这样的（在本地复现时内容一致）：

```text
(!) Found dead link ./2026-11-16-fullstack-crud in file posts\2026-11-16-mysql-explain-index.md
[vitepress] 1 dead link(s) found.
```

## 为什么本地能过

VitePress 构建 `docs/` 下的所有 Markdown，死链检查也按「文件是否存在」来解析。本地工作区里躺着还没提交的草稿，链接目标全都能找到：

```text
docs/posts/
├─ 2026-11-16-mysql-explain-index.md   # 已提交，链接指向下面几篇
├─ 2026-11-16-fullstack-crud.md        # 未提交，本地存在
├─ 2026-11-13-ai-assisted-coding.md    # 未提交
└─ java-basics.md                      # 未提交
```

CI 里 checkout 出来的只有已提交内容，链接指向一个仓库里不存在的文件，VitePress 默认把死链当成构建错误，于是 build 失败。

所以 `npm run build` 的结果不只取决于代码，还取决于工作区里有什么没提交。

## 互链文章把问题放大

这批文章是互相链接的，形成一条链：

```text
mysql-explain-index → fullstack-crud → ai-assisted-coding → java-basics
```

逐篇发布时，只要链接指向的下一篇还没提交，构建就会断。互链等于把几篇文章绑成了一个发布单元：要么一起发，要么先别链。

## 在本地复现 CI 的构建

最接近 CI 的做法是用 `git worktree`，它只包含已提交的文件：

```bash
git worktree add ../blog-check HEAD
cd ../blog-check
npm ci
npm run build
cd -
git worktree remove --force ../blog-check
```

如果只想快速验证一次，也可以把未提交内容暂存起来：

```bash
git stash push -u -m "check-ci-build"
npm run build
git stash pop
```

第二个方法更快，但别忘了 `git stash pop`；`-u` 必须带上，否则未跟踪的草稿文件会继续留在工作区，等于没模拟干净。

## 两种修法

| 做法 | 适合 | 代价 |
|---|---|---|
| 把互链文章整批提交 | 系列文章本来就一起发 | 一次要审完几篇，提交变大 |
| 先删掉「相关」链接，之后再补 | 想先让单篇上线 | 少了一个入口，需要记着补回来 |

我没有关掉死链检查。`ignoreDeadLinks` 能让构建变绿，但也会把真正拼错的链接一起藏起来，等读者点到 404 才发现。

## 这次怎么处理的

1. 先补上链接目标 `fullstack-crud.md`，但它的文末又链向 `ai-assisted-coding.md`，链还是没闭合
2. 最后把两篇的「相关」链接临时去掉，先让文章上线
3. 等整个系列的草稿都提交、链接全部可达后，再把「相关」加回来

## 坑

- 本地 `npm run build` 通过，不代表 CI 通过：未提交、被 `.gitignore` 忽略的文件都会影响本地构建结果
- VitePress 的 dev server 不会因为死链中断，页面点进去才 404；只有 `build` 会把它当错误
- 部署失败不会回滚线上：旧版本继续服务，新文章 404，容易误判成「push 了但没发布」
- 改了提交信息、重写历史之后，普通 `git push` 会被拒绝，要用 `git push --force-with-lease`
- Markdown 里的相对链接带 `.md`，侧边栏和正文的站内路由不带 `.md`，两处写法不一样
