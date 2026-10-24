import type { BridgeDetectContext, FrameworkBridge } from "./types";
import { springBootBridge } from "./spring-boot";
import { flaskBridge } from "./flask";
import { fastapiBridge } from "./fastapi";
import { djangoBridge } from "./django";

/**
 * 已注册的框架桥接实现，按数组顺序依次检测（命中即返回）。
 * 新增框架时在此追加一条实现即可，核心流程无需改动。
 */
export const bridges: FrameworkBridge[] = [
  springBootBridge,
  flaskBridge,
  fastapiBridge,
  djangoBridge,
];

/** 顺序检测命中的第一个桥接，未命中返回 null。 */
export async function detectBridge(
  ctx: BridgeDetectContext,
): Promise<FrameworkBridge | null> {
  for (const bridge of bridges) {
    try {
      if (await bridge.detect(ctx)) return bridge;
    } catch {
      // 单个桥接检测失败不阻断整体流程，继续尝试下一个
      continue;
    }
  }
  return null;
}
