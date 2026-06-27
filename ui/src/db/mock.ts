/**
 * Mock Data for x-bookmark-reports UI
 * CONTRACT v1.0
 *
 * Usage: All frontend pages use these mocks for initial development.
 * Switch to real API by changing `USE_MOCK = false` in api client.
 */

import {
  Bookmark,
  BookmarkDetail,
  SyncJob,
  Report,
  Article,
  ActivityItem,
  LogEntry,
  Settings,
  DashboardStats,
  ArticleVersion,
  ReportVersion,
} from "@/types/api";

// ─────────────────────────────────────────────
// Bookmarks (20 items)
// ─────────────────────────────────────────────

export const mockBookmarks: Bookmark[] = [
  {
    id: "1892543876123456789",
    url: "https://x.com/ylecun/status/1892543876123456789",
    author: { name: "Yann LeCun", handle: "@ylecun", avatar: "https://unavatar.io/x/ylecun" },
    text: "LLMs are not the path to human-level intelligence. We need systems that can learn world models, understand physical reality, and reason about cause and effect...",
    bookmarkedAt: "2026-04-25T08:30:00.000Z",
    syncBatchId: "batch_20260425",
    status: "reported",
    tags: ["ai", "llm", "research"],
    urlCategory: "social",
    stats: { likes: 4523, replies: 389, bookmarks: 892, views: 234000 },
    reportPath: "./reports/basic/1892543876123456789.md",
    enhancedReportPath: "./reports/enhanced/1892543876123456789.md",
  },
  {
    id: "1893001122334455667",
    url: "https://x.com/karpathy/status/1893001122334455667",
    author: { name: "Andrej Karpathy", handle: "@karpathy", avatar: "https://unavatar.io/x/karpathy" },
    text: "New blog post: 'The State of Computer Vision in 2026'. I dive into the latest advances in multimodal learning, real-time 3D reconstruction, and neural rendering...",
    bookmarkedAt: "2026-04-24T14:15:00.000Z",
    syncBatchId: "batch_20260424",
    status: "articled",
    tags: ["cv", "blog", "tutorial"],
    urlCategory: "article",
    stats: { likes: 8901, replies: 567, bookmarks: 2103, views: 567000 },
    reportPath: "./reports/basic/1893001122334455667.md",
    enhancedReportPath: "./reports/enhanced/1893001122334455667.md",
  },
  {
    id: "1892765432109876543",
    url: "https://x.com/gdb/status/1892765432109876543",
    author: { name: "Greg Brockman", handle: "@gdb", avatar: "https://unavatar.io/x/gdb" },
    text: "Excited to share what we've been building at OpenAI. The new reinforcement learning pipeline shows 3x improvement in sample efficiency...",
    bookmarkedAt: "2026-04-23T11:00:00.000Z",
    syncBatchId: "batch_20260423",
    status: "read",
    tags: ["openai", "rl", "ml"],
    urlCategory: "social",
    stats: { likes: 3210, replies: 234, bookmarks: 678, views: 189000 },
    reportPath: "./reports/basic/1892765432109876543.md",
  },
  {
    id: "1891987654321098765",
    url: "https://x.com/jackclarkSF/status/1891987654321098765",
    author: { name: "Jack Clark", handle: "@jackclarkSF", avatar: "https://unavatar.io/x/jackclarkSF" },
    text: "AI Policy update: The EU AI Act implementation guidance has been released. Key changes to high-risk system definitions and transparency requirements...",
    bookmarkedAt: "2026-04-22T09:45:00.000Z",
    syncBatchId: "batch_20260422",
    status: "synced",
    tags: ["policy", "eu", "ai-act"],
    urlCategory: "article",
    stats: { likes: 1234, replies: 198, bookmarks: 445, views: 89000 },
  },
  {
    id: "1891654321098765432",
    url: "https://x.com/sama/status/1891654321098765432",
    author: { name: "Sam Altman", handle: "@sama" },
    text: "AGI timelines and the importance of safety research. We need to be thoughtful about deployment decisions and iterative rollout strategies...",
    bookmarkedAt: "2026-04-21T16:20:00.000Z",
    syncBatchId: "batch_20260421",
    status: "reported",
    tags: ["agi", "safety", "openai"],
    urlCategory: "social",
    stats: { likes: 15000, replies: 1200, bookmarks: 3400, views: 1200000 },
    reportPath: "./reports/basic/1891654321098765432.md",
    enhancedReportPath: "./reports/enhanced/1891654321098765432.md",
  },
  {
    id: "1891122334455667788",
    url: "https://x.com/fchollet/status/1891122334455667788",
    author: { name: "Francois Chollet", handle: "@fchollet", avatar: "https://unavatar.io/x/fchollet" },
    text: "Arc-AGI-2 benchmark results are in. The gap between specialized fine-tuning and general reasoning remains significant. Thread on what this means...",
    bookmarkedAt: "2026-04-20T07:10:00.000Z",
    syncBatchId: "batch_20260420",
    status: "read",
    tags: ["agi", "benchmark", "research"],
    urlCategory: "social",
    stats: { likes: 5678, replies: 445, bookmarks: 1234, views: 345000 },
    reportPath: "./reports/basic/1891122334455667788.md",
  },
  {
    id: "1890888777666555444",
    url: "https://x.com/lilianweng/status/1890888777666555444",
    author: { name: "Lilian Weng", handle: "@lilianweng", avatar: "https://unavatar.io/x/lilianweng" },
    text: "New post: 'Reward Hacking in Reinforcement Learning'. A comprehensive survey of failure modes, detection methods, and mitigation strategies...",
    bookmarkedAt: "2026-04-19T12:30:00.000Z",
    syncBatchId: "batch_20260419",
    status: "articled",
    tags: ["rl", "safety", "survey"],
    urlCategory: "article",
    stats: { likes: 7890, replies: 567, bookmarks: 2345, views: 456000 },
    reportPath: "./reports/basic/1890888777666555444.md",
    enhancedReportPath: "./reports/enhanced/1890888777666555444.md",
  },
  {
    id: "1890555444333222111",
    url: "https://x.com/jeremyphoward/status/1890555444333222111",
    author: { name: "Jeremy Howard", handle: "@jeremyphoward" },
    text: "fastai 2026 release is here! Major updates to the data pipeline, new vision transformers integration, and improved distributed training support...",
    bookmarkedAt: "2026-04-18T10:00:00.000Z",
    syncBatchId: "batch_20260418",
    status: "synced",
    tags: ["fastai", "education", "tools"],
    urlCategory: "code",
    stats: { likes: 2345, replies: 234, bookmarks: 567, views: 123000 },
  },
  {
    id: "1890222111000999888",
    url: "https://x.com/Goodfellow_Ian/status/1890222111000999888",
    author: { name: "Ian Goodfellow", handle: "@Goodfellow_Ian" },
    text: "Adversarial machine learning continues to be critical for robust AI systems. New paper on adaptive attack detection in production environments...",
    bookmarkedAt: "2026-04-17T15:45:00.000Z",
    syncBatchId: "batch_20260417",
    status: "synced",
    tags: ["security", "adversarial", "paper"],
    urlCategory: "social",
    stats: { likes: 3456, replies: 345, bookmarks: 890, views: 234000 },
  },
  {
    id: "1889999888777666555",
    url: "https://x.com/DrJimFan/status/1889999888777666555",
    author: { name: "Jim Fan", handle: "@DrJimFan", avatar: "https://unavatar.io/x/DrJimFan" },
    text: "NVIDIA's new robotics foundation model demo is incredible. Zero-shot generalization to unseen tasks with real-time policy adaptation...",
    bookmarkedAt: "2026-04-16T08:20:00.000Z",
    syncBatchId: "batch_20260416",
    status: "reported",
    tags: ["robotics", "nvidia", "foundation-model"],
    urlCategory: "media",
    stats: { likes: 6789, replies: 456, bookmarks: 1567, views: 567000 },
    reportPath: "./reports/basic/1889999888777666555.md",
  },
  {
    id: "1889777666555444333",
    url: "https://x.com/AndrewYNg/status/1889777666555444333",
    author: { name: "Andrew Ng", handle: "@AndrewYNg", avatar: "https://unavatar.io/x/AndrewYNg" },
    text: "Landing AI's new visual prompting tool makes computer vision accessible to every enterprise. No coding required for custom model deployment...",
    bookmarkedAt: "2026-04-15T11:30:00.000Z",
    syncBatchId: "batch_20260415",
    status: "read",
    tags: ["enterprise", "cv", "tools"],
    urlCategory: "social",
    stats: { likes: 4567, replies: 345, bookmarks: 890, views: 345000 },
    reportPath: "./reports/basic/1889777666555444333.md",
  },
  {
    id: "1889555444333222111",
    url: "https://x.com/david challenger/status/1889555444333222111",
    author: { name: "David Ha", handle: "@hardmaru" },
    text: "Exploring emergent behavior in large-scale multi-agent simulations. Fascinating patterns of coordination and specialization appear spontaneously...",
    bookmarkedAt: "2026-04-14T14:00:00.000Z",
    syncBatchId: "batch_20260414",
    status: "synced",
    tags: ["multi-agent", "simulation", "emergence"],
    urlCategory: "social",
    stats: { likes: 2345, replies: 234, bookmarks: 567, views: 156000 },
  },
  {
    id: "1889333222111000999",
    url: "https://x.com/nikitamaheshwari/status/1889333222111000999",
    author: { name: "Nikita Maheshwari", handle: "@nikitamaheshwari" },
    text: "Building LLM applications? Here are 7 architectural patterns I've used in production: RAG, routing, caching, multi-turn, tool use, reflection, ensemble...",
    bookmarkedAt: "2026-04-13T09:15:00.000Z",
    syncBatchId: "batch_20260413",
    status: "reported",
    tags: ["llm", "architecture", "production"],
    urlCategory: "article",
    stats: { likes: 5678, replies: 456, bookmarks: 1234, views: 234000 },
    reportPath: "./reports/basic/1889333222111000999.md",
    enhancedReportPath: "./reports/enhanced/1889333222111000999.md",
  },
  {
    id: "1889111000999888777",
    url: "https://x.com/peteskomoroch/status/1889111000999888777",
    author: { name: "Pete Skomoroch", handle: "@peteskimo" },
    text: "Data engineering for AI: Why most teams fail at feature stores and what to do about it. Lessons from 5 years of MLOps at scale...",
    bookmarkedAt: "2026-04-12T16:45:00.000Z",
    syncBatchId: "batch_20260412",
    status: "synced",
    tags: ["mlops", "data-engineering", "feature-store"],
    urlCategory: "article",
    stats: { likes: 1234, replies: 123, bookmarks: 345, views: 89000 },
  },
  {
    id: "1888888777666555444",
    url: "https://x.com/huggingface/status/1888888777666555444",
    author: { name: "Hugging Face", handle: "@huggingface", avatar: "https://unavatar.io/x/huggingface" },
    text: "Transformers.js v3 is out! WebGPU support, new models, and 50% faster inference. Run state-of-the-art models directly in the browser...",
    bookmarkedAt: "2026-04-11T10:30:00.000Z",
    syncBatchId: "batch_20260411",
    status: "read",
    tags: ["huggingface", "transformers", "webgpu"],
    urlCategory: "code",
    stats: { likes: 8901, replies: 678, bookmarks: 2345, views: 678000 },
    reportPath: "./reports/basic/1888888777666555444.md",
  },
  {
    id: "1888666555444333222",
    url: "https://x.com/clementdelangue/status/1888666555444333222",
    author: { name: "Clement Delangue", handle: "@ClementDelangue" },
    text: "The future of AI is open. Why we believe in democratizing access to machine learning and the role of open source in responsible AI development...",
    bookmarkedAt: "2026-04-10T13:00:00.000Z",
    syncBatchId: "batch_20260410",
    status: "synced",
    tags: ["open-source", "ethics", "community"],
    urlCategory: "social",
    stats: { likes: 3456, replies: 345, bookmarks: 890, views: 234000 },
  },
  {
    id: "1888444333222111000",
    url: "https://x.com/EMostaque/status/1888444333222111000",
    author: { name: "Emad Mostaque", handle: "@EMostaque" },
    text: "Stability AI's new video generation model achieves SOTA on multiple benchmarks. 4K output, temporal consistency, and real-time preview...",
    bookmarkedAt: "2026-04-09T08:00:00.000Z",
    syncBatchId: "batch_20260409",
    status: "reported",
    tags: ["video-generation", "stability-ai", "sota"],
    urlCategory: "media",
    stats: { likes: 6789, replies: 567, bookmarks: 1567, views: 456000 },
    reportPath: "./reports/basic/1888444333222111000.md",
    enhancedReportPath: "./reports/enhanced/1888444333222111000.md",
  },
  {
    id: "1888222111000999888",
    url: "https://x.com/alexandr_wang/status/1888222111000999888",
    author: { name: "Alexandr Wang", handle: "@alexandr_wang" },
    text: "Scale AI's latest data labeling platform update: AI-assisted annotation, quality assurance pipelines, and multi-modal dataset management...",
    bookmarkedAt: "2026-04-08T11:20:00.000Z",
    syncBatchId: "batch_20260408",
    status: "synced",
    tags: ["data-labeling", "scale-ai", "enterprise"],
    urlCategory: "social",
    stats: { likes: 2345, replies: 234, bookmarks: 567, views: 123000 },
  },
  {
    id: "1888000999888777666",
    url: "https://x.com/rowancheung/status/1888000999888777666",
    author: { name: "Rowan Cheung", handle: "@rowancheung", avatar: "https://unavatar.io/x/rowancheung" },
    text: "The Rundown AI weekly recap: GPT-5 rumors, new funding rounds, regulatory updates, and the top 10 papers you should read this week...",
    bookmarkedAt: "2026-04-07T15:00:00.000Z",
    syncBatchId: "batch_20260407",
    status: "articled",
    tags: ["news", "weekly", "roundup"],
    urlCategory: "article",
    stats: { likes: 4567, replies: 345, bookmarks: 1234, views: 345000 },
    reportPath: "./reports/basic/1888000999888777666.md",
    enhancedReportPath: "./reports/enhanced/1888000999888777666.md",
  },
  {
    id: "1887888777666555444",
    url: "https://x.com/bindureddy/status/1887888777666555444",
    author: { name: "Bindu Reddy", handle: "@bindureddy" },
    text: "Abacus.AI's new real-time model serving infrastructure handles 1M+ requests/sec with sub-10ms latency. Architecture breakdown and benchmark results...",
    bookmarkedAt: "2026-04-06T09:30:00.000Z",
    syncBatchId: "batch_20260406",
    status: "read",
    tags: ["serving", "infrastructure", "performance"],
    urlCategory: "article",
    stats: { likes: 3456, replies: 345, bookmarks: 890, views: 234000 },
    reportPath: "./reports/basic/1887888777666555444.md",
  },
];

// ─────────────────────────────────────────────
// Bookmark Detail (full content example)
// ─────────────────────────────────────────────

export const mockBookmarkDetail: BookmarkDetail = {
  ...mockBookmarks[0],
  fullText: `LLMs are not the path to human-level intelligence. We need systems that can learn world models, understand physical reality, and reason about cause and effect.

Current LLMs are fundamentally limited because:
1. They only process text, lacking grounding in physical reality
2. They don't have persistent memory or world models
3. They can't plan or reason about long-term consequences
4. They hallucinate because they lack causal understanding

The next generation of AI systems needs:
- Multimodal grounding in physical environments
- Object-oriented world models
- Causal reasoning capabilities
- JEPA (Joint Embedding Predictive Architecture) style learning

This is the direction we're pursuing at Meta AI with our latest research on world models for autonomous systems.`,
  replies: [
    {
      id: "rep_001",
      author: { name: "AI Researcher", handle: "@airesearcher" },
      text: "Do you think LLMs can be augmented with external tools to overcome these limitations?",
      stats: { likes: 234, replies: 12, bookmarks: 45, views: 5600 },
      createdAt: "2026-04-25T09:00:00.000Z",
    },
    {
      id: "rep_002",
      author: { name: "Yann LeCun", handle: "@ylecun" },
      text: "Tools help, but they're not sufficient. The core architecture needs to change. We need systems that can learn and reason, not just retrieve.",
      stats: { likes: 567, replies: 34, bookmarks: 123, views: 12000 },
      createdAt: "2026-04-25T09:15:00.000Z",
    },
    {
      id: "rep_003",
      author: { name: "ML Engineer", handle: "@mlengineer" },
      text: "Have you seen the latest results from the new architecture you're hinting at? Any benchmarks?",
      stats: { likes: 89, replies: 5, bookmarks: 12, views: 2300 },
      createdAt: "2026-04-25T10:00:00.000Z",
    },
  ],
  externalLinks: [
    { url: "https://ai.meta.com/research/publications/learning-world-models", title: "Meta AI: Learning World Models", category: "article" },
    { url: "https://github.com/facebookresearch/jepa", title: "JEPA GitHub Repository", category: "code" },
    { url: "https://arxiv.org/abs/2401.12345", title: "ArXiv: Joint Embedding Predictive Architecture", category: "article" },
  ],
  reports: {
    basic: { id: "rep_basic_001", type: "basic", generatedAt: "2026-04-25T08:35:00.000Z", wordCount: 1245 },
    enhanced: { id: "rep_enh_001", type: "enhanced", generatedAt: "2026-04-25T08:40:00.000Z", wordCount: 3420 },
  },
};

// ─────────────────────────────────────────────
// Sync Jobs (5 items: 3 completed, 1 running, 1 failed)
// ─────────────────────────────────────────────

export const mockSyncJobs: SyncJob[] = [
  {
    id: "sync_005",
    mode: "incremental",
    status: "running",
    progress: 67,
    stage: "fetching",
    logs: [
      "[08:30:00] 同步任务启动",
      "[08:30:01] 读取 .env.twitter 配置",
      "[08:30:02] Rettiwt API 认证成功",
      "[08:30:03] 开始获取书签数据...",
      "[08:30:15] 已获取 45 条书签，继续获取中...",
    ],
    startedAt: "2026-04-28T08:30:00.000Z",
    newCount: 45,
    totalCount: 201,
  },
  {
    id: "sync_004",
    mode: "full",
    status: "completed",
    progress: 100,
    stage: "done",
    logs: [
      "[06:00:00] 全量同步任务启动",
      "[06:00:01] 配置加载完成",
      "[06:00:02] 开始全量获取...",
      "[06:02:30] 获取完成，共 201 条书签",
      "[06:02:31] 解析并存储数据...",
      "[06:02:35] 全量同步完成",
    ],
    startedAt: "2026-04-28T06:00:00.000Z",
    completedAt: "2026-04-28T06:02:35.000Z",
    newCount: 201,
    totalCount: 201,
  },
  {
    id: "sync_003",
    mode: "incremental",
    status: "completed",
    progress: 100,
    stage: "done",
    logs: [
      "[08:30:00] 增量同步启动",
      "[08:30:05] 发现 12 条新书签",
      "[08:30:10] 存储完成",
    ],
    startedAt: "2026-04-27T08:30:00.000Z",
    completedAt: "2026-04-27T08:30:10.000Z",
    newCount: 12,
    totalCount: 168,
  },
  {
    id: "sync_002",
    mode: "incremental",
    status: "failed",
    progress: 23,
    stage: "fetching",
    logs: [
      "[08:30:00] 增量同步启动",
      "[08:30:02] Rettiwt API 请求发送...",
      "[08:30:32] 请求超时",
    ],
    error: {
      code: "SYNC_RETTIWT_TIMEOUT",
      message: "Rettiwt API 响应超时",
      detail: "Request timed out after 30s",
    },
    startedAt: "2026-04-26T08:30:00.000Z",
    completedAt: "2026-04-26T08:30:32.000Z",
    newCount: 0,
    totalCount: 0,
  },
  {
    id: "sync_001",
    mode: "full",
    status: "completed",
    progress: 100,
    stage: "done",
    logs: ["[06:00:00] 首次全量同步", "[06:01:00] 完成，共 156 条"],
    startedAt: "2026-04-25T06:00:00.000Z",
    completedAt: "2026-04-25T06:01:00.000Z",
    newCount: 156,
    totalCount: 156,
  },
];

// ─────────────────────────────────────────────
// Reports (6 items)
// ─────────────────────────────────────────────

const markdownReportBasic = `# 推文深度分析报告

## 原文信息
- **作者**: Yann LeCun (@ylecun)
- **发布时间**: 2026-04-25
- **原文链接**: https://x.com/ylecun/status/1892543876123456789

## 互动数据
| 指标 | 数值 |
|------|------|
| 点赞 | 4,523 |
| 回复 | 389 |
| 收藏 | 892 |
| 浏览 | 234,000 |

## 内容摘要
Yann LeCun 阐述了为什么 LLM 不是通往人类水平智能的路径。核心观点：
1. LLM 仅处理文本，缺乏对物理现实的 grounding
2. 没有持久记忆或世界模型
3. 无法规划或推理长期后果
4. 因缺乏因果理解而产生幻觉

## 外部链接
- [Meta AI: Learning World Models](https://ai.meta.com/research/publications/learning-world-models)
- [JEPA GitHub](https://github.com/facebookresearch/jepa)

## 关键标签
#LLM #WorldModels #AGI #MetaAI`;

const markdownReportEnhanced = `# 推文深度分析报告（增强版）

## 原文信息
- **作者**: Yann LeCun (@ylecun)
- **发布时间**: 2026-04-25
- **原文链接**: https://x.com/ylecun/status/1892543876123456789
- **作者背景**: Meta 首席 AI 科学家，图灵奖得主，深度学习先驱

## 互动数据
| 指标 | 数值 | 趋势 |
|------|------|------|
| 点赞 | 4,523 | ▲ 12% |
| 回复 | 389 | ▲ 8% |
| 收藏 | 892 | ▲ 23% |
| 浏览 | 234,000 | ▲ 45% |

## 内容深度分析

### 核心论点
LeCun 认为当前 LLM 存在四大根本局限：

1. **缺乏物理 grounding**: 纯文本训练无法建立对物理世界的直觉理解
2. **无持久世界模型**: 上下文窗口是临时记忆，非结构化知识存储
3. **规划能力缺失**: 无法像人类一样进行多步前瞻规划
4. **因果推理薄弱**: 相关不等于因果，导致系统性幻觉

### 提出的解决方案
- **JEPA 架构**: Joint Embedding Predictive Architecture
- **目标驱动 AI**: 基于内在目标的自主系统
- **分层规划**: 多时间尺度的决策机制

## 社区反应分析
- **支持方**: 78% 的回复认同需要新架构
- **质疑方**: 15% 认为工具增强的 LLM 已足够
- **中间派**: 7% 认为两者可互补

## 技术影响评估
- **短期**: 对当前 LLM 产品路线影响有限
- **中期**: 可能推动多模态模型研发加速
- **长期**: 若 JEPA 路线成功，可能重新定义 AGI 路径

## 相关论文
1. LeCun, Y. (2022). "A Path Towards Autonomous Machine Intelligence"
2. Assran et al. (2023). "Self-Supervised Learning from Images with a Joint-Embedding Predictive Architecture"

## 外部链接详情
| URL | 标题 | 类型 | 摘要 |
|-----|------|------|------|
| ai.meta.com/... | Learning World Models | 研究文章 | Meta AI 世界模型研究项目介绍 |
| github.com/... | JEPA | 代码仓库 | JEPA 开源实现，含训练脚本和预训练模型 |
| arxiv.org/... | ArXiv Paper | 学术论文 | JEPA 架构的完整技术描述和实验结果 |

---
*报告生成时间*: 2026-04-25 08:40:00
*分析引擎*: x-tweet-reader v2.1 (Camoufox + x-tweet-fetcher)`;

export const mockReports: Report[] = [
  {
    id: "rep_basic_001",
    bookmarkId: "1892543876123456789",
    type: "basic",
    title: "Yann LeCun: LLM 局限性分析",
    content: markdownReportBasic,
    generatedAt: "2026-04-25T08:35:00.000Z",
    wordCount: 1245,
    urlSummary: [
      { url: "https://ai.meta.com/research/publications/learning-world-models", title: "Meta AI: Learning World Models", category: "article" },
      { url: "https://github.com/facebookresearch/jepa", title: "JEPA GitHub Repository", category: "code" },
    ],
  },
  {
    id: "rep_enhanced_001",
    bookmarkId: "1892543876123456789",
    type: "enhanced",
    title: "Yann LeCun: LLM 不是 AGI 路径（增强分析）",
    content: markdownReportEnhanced,
    generatedAt: "2026-04-25T08:40:00.000Z",
    wordCount: 3420,
    urlSummary: [
      { url: "https://ai.meta.com/research/publications/learning-world-models", title: "Meta AI: Learning World Models", category: "article" },
      { url: "https://github.com/facebookresearch/jepa", title: "JEPA GitHub Repository", category: "code" },
      { url: "https://arxiv.org/abs/2401.12345", title: "ArXiv: JEPA Paper", category: "article" },
    ],
  },
  {
    id: "rep_basic_002",
    bookmarkId: "1893001122334455667",
    type: "basic",
    title: "Andrej Karpathy: 计算机视觉现状",
    content: "# 计算机视觉现状 2026\n\n## 原文信息\n- **作者**: Andrej Karpathy\n- **发布时间**: 2026-04-24\n\n## 互动数据\n| 指标 | 数值 |\n|------|------|\n| 点赞 | 8,901 |\n| 回复 | 567 |\n| 收藏 | 2,103 |\n| 浏览 | 567,000 |\n\n## 核心内容\nKarpathy 深入分析了多模态学习、实时 3D 重建和神经渲染的最新进展...",
    generatedAt: "2026-04-24T14:20:00.000Z",
    wordCount: 2100,
    urlSummary: [
      { url: "https://karpathy.ai/blog/cv-2026", title: "The State of CV 2026", category: "article" },
    ],
  },
  {
    id: "rep_enhanced_002",
    bookmarkId: "1893001122334455667",
    type: "enhanced",
    title: "Andrej Karpathy: CV 2026 增强分析",
    content: "# 计算机视觉现状 2026（增强版）\n\n## 多模态学习进展\n...详细技术分析...",
    generatedAt: "2026-04-24T14:25:00.000Z",
    wordCount: 5600,
    urlSummary: [
      { url: "https://karpathy.ai/blog/cv-2026", title: "The State of CV 2026", category: "article" },
      { url: "https://github.com/karpathy/minbpe", title: "minbpe", category: "code" },
    ],
  },
  {
    id: "rep_basic_003",
    bookmarkId: "1890888777666555444",
    type: "basic",
    title: "Lilian Weng: RL 奖励破解综述",
    content: "# Reward Hacking in RL\n\n## 核心概念\n奖励破解指智能体找到非预期的方式最大化奖励信号...",
    generatedAt: "2026-04-19T12:35:00.000Z",
    wordCount: 3200,
    urlSummary: [
      { url: "https://lilianweng.github.io/posts/2026-04-19-reward-hacking", title: "Reward Hacking Survey", category: "article" },
    ],
  },
];

// ─────────────────────────────────────────────
// Articles (4 items)
// ─────────────────────────────────────────────

export const mockArticles: Article[] = [
  {
    id: "art_001",
    reportId: "rep_enhanced_001",
    title: "为什么 LLM 不是通往 AGI 的路径：Yann LeCun 观点深度解读",
    content: `# 为什么 LLM 不是通往 AGI 的路径

## 引言
2026年4月，Meta 首席 AI 科学家 Yann LeCun 在 X 上发表了一系列关于 LLM 局限性的观点。作为图灵奖得主和深度学习先驱，他的看法值得每一位 AI 从业者深思。

## LLM 的四大根本局限

### 1. 缺乏物理世界 grounding
LLM 仅在文本上训练，从未接触过物理世界...

## 替代路径：JEPA 架构

## 对我们意味着什么

## 结论
AGI 的实现需要新的架构范式，而非简单地扩大现有模型规模。
`,
    status: "published",
    createdAt: "2026-04-25T10:00:00.000Z",
    updatedAt: "2026-04-26T14:30:00.000Z",
    publishedAt: "2026-04-26T15:00:00.000Z",
    tags: ["agi", "llm", "meta", "research"],
    wordCount: 4500,
  },
  {
    id: "art_002",
    reportId: "rep_enhanced_002",
    title: "2026 计算机视觉全景：多模态与实时 3D 重建",
    content: "# 2026 计算机视觉全景\n\n## 多模态学习的突破...",
    status: "editing",
    createdAt: "2026-04-24T16:00:00.000Z",
    updatedAt: "2026-04-25T09:00:00.000Z",
    tags: ["cv", "multimodal", "3d"],
    wordCount: 2800,
  },
  {
    id: "art_003",
    title: "RL 奖励破解：从理论到实践的完整指南",
    content: "# RL 奖励破解完整指南\n\n## 什么是奖励破解...",
    status: "draft",
    createdAt: "2026-04-20T08:00:00.000Z",
    updatedAt: "2026-04-20T08:00:00.000Z",
    tags: ["rl", "safety", "tutorial"],
    wordCount: 1200,
  },
  {
    id: "art_004",
    reportId: "rep_enhanced_001",
    title: "Meta AI 世界模型研究：JEPA 架构技术解析",
    content: "# JEPA 架构技术解析\n\n## 背景...",
    status: "reviewing",
    createdAt: "2026-04-26T10:00:00.000Z",
    updatedAt: "2026-04-27T11:00:00.000Z",
    tags: ["jepa", "meta", "world-models"],
    wordCount: 3600,
  },
];

// ─────────────────────────────────────────────
// Dashboard Stats
// ─────────────────────────────────────────────

export const mockDashboardStats: DashboardStats = {
  lastSyncAt: "2026-04-28T08:30:00.000Z",
  totalDrafts: 201,
  totalBookmarks: 201,
  newThisWeek: 23,
  articlesWritten: 932,
  notionTotalUploaded: 946,
  pendingRewrite: 14,
  // Stage 2: 4 个新字段与旧字段语义对齐（mock 数值不一定满足真实约束，仅用于 UI 调试）
  totalArticlesLocal: 932,
  totalArticlesNotion: 946,
  pendingRewriteLocal: 0,
  pendingRewriteGlobal: 14,
  pipeline: {
    twitterSync: { status: "completed", lastRun: "2026-04-28T08:30:00.000Z" },
    deepReports: { status: "completed", lastRun: "2026-04-28T08:30:00.000Z", progress: 100 },
    rewrite: { status: "running", progress: 67, progressGlobal: 40 },
    notionUpload: { status: "pending" },
  },
};

// ─────────────────────────────────────────────
// Activities
// ─────────────────────────────────────────────

export const mockActivities: ActivityItem[] = [
  { id: "act_001", type: "sync", action: "completed", message: "增量同步完成，新增 45 条书签", metadata: { syncJobId: "sync_005", newCount: 45 }, timestamp: "2026-04-28T08:30:00.000Z" },
  { id: "act_002", type: "read", action: "completed", message: "完成 3 条推文的深度读取", metadata: { bookmarkIds: ["1892543876123456789", "1893001122334455667", "1890888777666555444"] }, timestamp: "2026-04-28T08:35:00.000Z" },
  { id: "act_003", type: "report", action: "started", message: "开始生成增强版报告（5 条书签）", metadata: { count: 5 }, timestamp: "2026-04-28T08:36:00.000Z" },
  { id: "act_004", type: "article", action: "updated", message: "文章《RL 奖励破解指南》已更新至编辑中", metadata: { articleId: "art_003" }, timestamp: "2026-04-27T16:00:00.000Z" },
  { id: "act_005", type: "sync", action: "completed", message: "全量同步完成，共 201 条书签", metadata: { syncJobId: "sync_004", totalCount: 201 }, timestamp: "2026-04-28T06:02:35.000Z" },
  { id: "act_006", type: "setting", action: "updated", message: "更新代理配置为 http://127.0.0.1:7897", timestamp: "2026-04-27T10:00:00.000Z" },
  { id: "act_007", type: "read", action: "failed", message: "推文读取失败：无效 URL", metadata: { error: "READER_INVALID_URL" }, timestamp: "2026-04-26T14:20:00.000Z" },
  { id: "act_008", type: "article", action: "completed", message: "文章《LLM 不是 AGI 路径》已发布", metadata: { articleId: "art_001" }, timestamp: "2026-04-26T15:00:00.000Z" },
  { id: "act_009", type: "sync", action: "failed", message: "同步失败：Rettiwt API 超时", metadata: { syncJobId: "sync_002", error: "SYNC_RETTIWT_TIMEOUT" }, timestamp: "2026-04-26T08:30:32.000Z" },
  { id: "act_010", type: "report", action: "completed", message: "生成 2 份增强版报告", metadata: { reportIds: ["rep_enhanced_001", "rep_enhanced_002"] }, timestamp: "2026-04-25T08:40:00.000Z" },
];

// ─────────────────────────────────────────────
// Logs
// ─────────────────────────────────────────────

export const mockLogs: LogEntry[] = [
  { id: "log_001", component: "sync", level: "info", message: "增量同步任务 sync_005 启动", timestamp: "2026-04-28T08:30:00.000Z" },
  { id: "log_002", component: "sync", level: "info", message: "Rettiwt API 认证成功", timestamp: "2026-04-28T08:30:02.000Z" },
  { id: "log_003", component: "sync", level: "info", message: "已获取 45/201 条书签", timestamp: "2026-04-28T08:30:15.000Z" },
  { id: "log_004", component: "x-reader", level: "info", message: "开始读取推文 1892543876123456789", timestamp: "2026-04-28T08:35:00.000Z" },
  { id: "log_005", component: "x-reader", level: "info", message: "推文读取完成，生成报告 1245 字", timestamp: "2026-04-28T08:35:05.000Z" },
  { id: "log_006", component: "x-tweet-reader", level: "info", message: "增强版读取 1892543876123456789 启动", timestamp: "2026-04-28T08:35:10.000Z" },
  { id: "log_007", component: "x-tweet-reader", level: "warn", message: "外部链接获取延迟 2.3s", timestamp: "2026-04-28T08:35:15.000Z" },
  { id: "log_008", component: "x-tweet-reader", level: "info", message: "增强报告生成完成，3420 字", timestamp: "2026-04-28T08:35:20.000Z" },
  { id: "log_009", component: "system", level: "error", message: "数据库连接池耗尽", detail: "max_connections=10, active=10", timestamp: "2026-04-27T20:00:00.000Z" },
  { id: "log_010", component: "sync", level: "error", message: "同步任务 sync_002 失败", detail: "SYNC_RETTIWT_TIMEOUT: Request timed out after 30s", timestamp: "2026-04-26T08:30:32.000Z" },
  { id: "log_011", component: "agent", level: "info", message: "文章生成 Agent 启动", timestamp: "2026-04-26T10:00:00.000Z" },
  { id: "log_012", component: "agent", level: "info", message: "从报告 rep_enhanced_001 生成文章草稿", timestamp: "2026-04-26T10:05:00.000Z" },
];

// ─────────────────────────────────────────────
// Settings
// ─────────────────────────────────────────────

export const mockSettings: Settings = {
  twitterApiKey: "abc****xyz",
  notionToken: "ntk****xyz",
  notionDbId: "notion-db-id-mock",
  deepseekApiKey: "dsk****xyz",
  deepseekBaseUrl: "https://api.deepseek.com/v1",
  deepseekModel: "deepseek-chat",
  xaiApiKey: "xai****xyz",
  xaiBaseUrl: "https://api.x.ai/v1",
  xaiModel: "grok-4.3",
  exaApiKey: "exa****xyz",
  exaBaseUrl: "https://api.exa.ai",
  bookmarksPath: "~/Library/Application Support/Google/Chrome/Default/Bookmarks",
  articlesDir: "~/Library/Mobile Documents/com~apple~CloudDocs/Hermes/bookmark-articles",
  dataPath: "./data",
  proxy: "http://127.0.0.1:7897",
  autoSync: false,
  notionUploadLive: false,
  cronExpression: "0 */6 * * *",
};

// ─────────────────────────────────────────────
// Versions
// ─────────────────────────────────────────────

export const mockReportVersions: ReportVersion[] = [
  { id: "ver_001", reportId: "rep_basic_001", content: markdownReportBasic, wordCount: 1200, createdAt: "2026-04-25T08:35:00.000Z" },
  { id: "ver_002", reportId: "rep_basic_001", content: markdownReportBasic + "\n\n## 新增: 社区反馈\n...", wordCount: 1245, createdAt: "2026-04-25T10:00:00.000Z" },
];

export const mockArticleVersions: ArticleVersion[] = [
  { id: "ver_001", articleId: "art_001", title: "LLM 局限性初稿", content: "...初稿内容...", wordCount: 2000, createdAt: "2026-04-25T10:00:00.000Z", author: "AI Agent" },
  { id: "ver_002", articleId: "art_001", title: "LLM 局限性二稿", content: "...二稿内容...", wordCount: 3200, createdAt: "2026-04-25T14:00:00.000Z", author: "AI Agent" },
  { id: "ver_003", articleId: "art_001", title: "为什么 LLM 不是通往 AGI 的路径", content: "...终稿内容...", wordCount: 4500, createdAt: "2026-04-26T12:00:00.000Z", author: "AI Agent" },
];

// ─────────────────────────────────────────────
// Lookup helpers
// ─────────────────────────────────────────────

export const getBookmarkById = (id: string): Bookmark | undefined =>
  mockBookmarks.find((b) => b.id === id);

export const getReportById = (id: string): Report | undefined =>
  mockReports.find((r) => r.id === id);

export const getArticleById = (id: string): Article | undefined =>
  mockArticles.find((a) => a.id === id);

export const getSyncJobById = (id: string): SyncJob | undefined =>
  mockSyncJobs.find((s) => s.id === id);

export const getBookmarkReports = (bookmarkId: string): Report[] =>
  mockReports.filter((r) => r.bookmarkId === bookmarkId);

export const getReportsForBookmark = (bookmarkId: string): { basic?: Report; enhanced?: Report } => {
  const reports = getBookmarkReports(bookmarkId);
  return {
    basic: reports.find((r) => r.type === "basic"),
    enhanced: reports.find((r) => r.type === "enhanced"),
  };
};
