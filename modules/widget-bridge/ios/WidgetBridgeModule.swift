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

    /// 把 widget.json 直接写进 App Group 容器。
    /// expo-file-system 只允许写自己沙盒里的目录，共享容器会被
    /// FileNotWritableException 拦掉，所以在原生侧写最稳。
    AsyncFunction("write") { (text: String) -> Bool in
      guard
        let url = FileManager.default
          .containerURL(forSecurityApplicationGroupIdentifier: appGroup)?
          .appendingPathComponent("widget.json")
      else { return false }
      try text.write(to: url, atomically: true, encoding: .utf8)
      return true
    }

    /// 数据变了让 WidgetKit 重画
    Function("reload") {
      if #available(iOS 14.0, *) {
        WidgetCenter.shared.reloadAllTimelines()
      }
    }
  }
}
