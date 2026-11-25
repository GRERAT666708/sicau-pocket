import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

/**
 * iOS 桌面小组件的数据桥。
 *
 * WidgetKit 的小组件跑在独立进程里，读不到 App 的沙盒（也读不到 AsyncStorage），
 * 唯一合法的共享区是 App Group 容器：App 把 widget.json 写进去，小组件读同一份。
 */

type Native = {
  groupPath(): string | null;
  reload(): void;
};

const Native = Platform.OS === 'ios' ? requireOptionalNativeModule<Native>('WidgetBridge') : null;

/** App Group 容器目录；模拟器/未配置能力时返回 null */
export function widgetGroupPath(): string | null {
  try {
    return Native?.groupPath() ?? null;
  } catch {
    return null;
  }
}

/** 让系统重画小组件（数据变更后调用） */
export function reloadWidgets(): void {
  try {
    Native?.reload();
  } catch {
    // 小组件是附加功能，失败不影响主流程
  }
}

export const widgetBridgeAvailable = () => !!Native;
