import { Fragment, type ReactNode } from "react";

/** 把 t() 文案里的 {name} 占位符替换成 React 节点（如 <code>、<strong>） */
export function renderRich(text: string, nodes: Record<string, ReactNode>): ReactNode[] {
  return text.split(/\{(\w+)\}/g).map((part, i) =>
    i % 2 === 1 ? <Fragment key={i}>{nodes[part] ?? `{${part}}`}</Fragment> : part
  );
}
