import articles from "./articles";
import bookmarks from "./bookmarks";
import common from "./common";
import dashboard from "./dashboard";
import health from "./health";
import layout from "./layout";
import network from "./network";
import settings from "./settings";
import sync from "./sync";

// 命名空间注册表：键名形如 "settings.title"
export const registry = {
  articles,
  bookmarks,
  common,
  dashboard,
  health,
  layout,
  network,
  settings,
  sync,
};
