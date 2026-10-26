import { defineMessages } from "../define";

// /api/health 返回的 issues[].code → 文案（HealthBanner 使用）
export default defineMessages({
  en: {
    "issue.failStreak": "The pipeline has failed {count} times in a row. Check the logs.",
    "issue.interrupted":
      "The last automatic run stopped during the \"{step}\" step without recording a result ({at}). See logs/bookmark-auto.log.",
    "issue.stalled":
      "No successful run for {hours} hours (normally every 3 hours). The pipeline may have stalled.",
    "issue.networkOffline": "Network diagnosis: neither direct connection nor any proxy can reach X / Notion.",
    "issue.pendingUploads": "{count} articles are waiting to be uploaded to Notion.",
    "issue.searxngError":
      "SearXNG is unreachable; research has fallen back to Firecrawl / Exa (check the SearXNG container and network).",
    "issue.searxngDegraded":
      "SearXNG is reachable but returns 0 results (engines may be rate-limited); research will use Firecrawl credits instead.",
    "issue.launchdNotLoaded": "The launchd schedule is not loaded, so the pipeline will not run automatically.",
    fixNetworkLink: "Open Settings → \"Detect & fix network\" →",
  },
  zh: {
    "issue.failStreak": "最近 {count} 次流水线连续失败，请检查日志",
    "issue.interrupted": "上一次自动运行在「{step}」步骤中断且没有记录结果（{at}），请查看 logs/bookmark-auto.log",
    "issue.stalled": "距上次成功运行已 {hours} 小时（正常每 3 小时一次），流水线可能已停摆",
    "issue.networkOffline": "网络诊断显示直连和所有代理都无法访问 X / Notion",
    "issue.pendingUploads": "{count} 篇文章积压未上传到 Notion",
    "issue.searxngError": "SearXNG 实例不可达，研究流量已回退至 Firecrawl / Exa（请检查 SearXNG 容器与网络连接）",
    "issue.searxngDegraded": "SearXNG 实例可达但搜索返回 0 结果（引擎可能被限流），研究流量将转向 Firecrawl 消耗额度",
    "issue.launchdNotLoaded": "launchd 调度未加载，流水线不会自动运行",
    fixNetworkLink: "去设置页「一键检测并修复网络」→",
  },
});
