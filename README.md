# YouTube-Post-Markdown
# YouTube Post → Markdown

一个 Tampermonkey 用户脚本:把 YouTube **社区帖子**(`/post/…`)或视频页的**评论、回复**一键导出为 Markdown 文件。

## 功能

- 自动滚动加载全部顶层评论,并展开所有回复
- 导出帖子正文、图片、附带视频链接
- 评论带作者、时间、点赞数,标注 📌置顶 / 👑作者 / ❤️作者点赞
- 回复以引用块嵌套在对应评论下
- 表情按 alt 文本输出;链接转为 Markdown 链接,`/redirect` 还原为真实地址
- 文件头含 YAML frontmatter(来源、作者、时间、点赞、导出时间),可直接放进 Obsidian 等笔记软件

## 安装

1. 安装 [Tampermonkey](https://www.tampermonkey.net/)(或 Violentmonkey)
2. 点击安装:[`youtube-post-to-md.user.js`](../../raw/main/youtube-post-to-md.user.js)
3. 刷新 YouTube 页面

## 使用

打开帖子页(如 `https://www.youtube.com/post/Ugkx…`)或视频页,点击右下角 **⬇ 导出 MD**。

| 操作 | 效果 |
| --- | --- |
| 点击 | 加载全部评论与回复后导出 |
| 加载中再点 | 取消加载,导出已加载部分 |
| Shift + 点击 | 跳过加载,直接导出当前已加载内容 |

## 输出示例

```markdown
---
title: "某频道 的社区帖子:标题"
source: https://www.youtube.com/post/Ugkx…
author: "某频道"
published: "22 hours ago"
likes: "2.1K"
exported: 2026-10-05T08:00:00.000Z
---

# 某频道 的社区帖子:标题

帖子正文……

---

## 评论(顶层 60 / 页面显示共 442)

### 1. **@user** 📌置顶 · 21 hours ago · 👍 239

评论内容

> **@replier** · 20 hours ago · 👍 3
>
> 回复内容
```

## 已知限制

- YouTube 只提供相对时间(如 "21 hours ago"),评论时间保持原样
- 页面加载过程中若网络慢,可能漏掉部分回复,可重新导出
- YouTube 改版可能导致选择器失效,欢迎提 Issue

## License

MIT
