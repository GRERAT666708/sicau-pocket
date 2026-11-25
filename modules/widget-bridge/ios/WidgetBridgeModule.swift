import ExpoModulesCore
import WidgetKit

/// App 与小组件共用的 App Group
private let appGroup = "group.io.github.grerat666708.sicaupocket"

public class WidgetBridgeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("WidgetBridge")

    /// App Group 容器路径，JS 侧把 widget.json 写进去
    Function("groupPath") { () -> String? in
      FileManager.default
        .containerURL(forSecurityApplicationGroupIdentifier: appGroup)?
        .path
    }

    /// 数据变了让 WidgetKit 重画
    Function("reload") {
      if #available(iOS 14.0, *) {
        WidgetCenter.shared.reloadAllTimelines()
      }
    }
  }
}
