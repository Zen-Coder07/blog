---
title: 开篇：这个博客怎么搭的
date: 2026-11-13
tags: [随笔, 建站]
draft: false
---

# 开篇：这个博客怎么搭的

第一篇不谈技术细节，只记录这个博客本身的搭建过程——顺便给自己留一份可重放的清单。

## 为什么是 VitePress

三个理由：Markdown 直接写、本地改完立刻能看到效果、构建产物是纯静态文件，扔到 GitHub Pages 上不用管服务器。

## 搭建步骤

1. 建仓库、配 SSH，确认 `ssh -T git@github.com` 通过
2. `npm install -D vitepress`，`docs/` 下放内容，`.vitepress/config.mts` 放导航
3. 写 `.github/workflows/deploy.yml`，让 push 自动构建并发布
4. 仓库 Settings → Pages → Source 选 `GitHub Actions`

## 几个当时踩到的坑

**`base` 必须和仓库名对齐。** 仓库叫 `blog`，站点就在 `https://<user>.github.io/blog/`，配置里少写这个前缀，线上就是白屏加一堆 404。

**Windows 上 `npm` 可能被执行策略拦。** 报 `AuthorizationManager 检查失败` 的时候改用 `npm.cmd`。

**换行符。** 没有 `.gitattributes` 的话，第一次提交会把每个文件都标成改动。

## 后面写什么

先写手里已经有素材的题：那些真实排过一次障、换过一次方案、最后跑通了的事。没跑通的不写，或者写清楚卡在哪。

---

*这篇是模板示例，可以随时删掉或改写。*
