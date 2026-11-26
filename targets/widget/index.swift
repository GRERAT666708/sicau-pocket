import SwiftUI
import WidgetKit

// 与 App 共用的一份数据：App 把 lib/widgetSync.ts 里的 WidgetPayload 原样写到
// App Group 容器的 widget.json，这里解码后渲染。
private let appGroup = "group.io.github.grerat666708.sicaupocket"

struct WidgetCourse: Codable, Identifiable {
  var time: String
  var name: String
  var room: String
  var color: String
  var id: String { name + time }
}

struct WidgetHighlight: Codable {
  var time: String
  var name: String
  var room: String
  var color: String
  var state: String
}

/// 小尺寸小组件要显示的那一两门课：正在上 / 下一节 / 再后面
struct WidgetFocus: Codable, Identifiable {
  var time: String
  var name: String
  var room: String
  var color: String
  var state: String
  var id: String { name + time }
}

struct WidgetPayload: Codable {
  /// App 写数据时带上的格式版本；老版本 App 不写这个字段，按 1 处理
  var payloadVersion: Int?
  var week: Int
  var day: String
  var dateLabel: String
  var courses: [WidgetCourse]
  var more: Int
  var highlight: WidgetHighlight?
  var focus: [WidgetFocus]?
  var done: Bool?
  var doneText: String?
  var emptyText: String?
  var updatedAt: String

  var schemaVersion: Int { payloadVersion ?? 1 }
}

/// 这个小组件能认的最高数据版本：比它新的数据会被当成「暂时读不到」，
/// 而不是解码失败后静默显示「今天没课」。
private let supportedPayloadVersion = 1

enum WidgetStore {
  static func load() -> WidgetPayload? {
    guard
      let url = FileManager.default
        .containerURL(forSecurityApplicationGroupIdentifier: appGroup)?
        .appendingPathComponent("widget.json"),
      let data = try? Data(contentsOf: url),
      let payload = try? JSONDecoder().decode(WidgetPayload.self, from: data)
    else { return nil }
    guard payload.schemaVersion <= supportedPayloadVersion else { return nil }
    return payload
  }
}

extension Color {
  /// "#10864A" -> Color
  init(hex: String) {
    let s = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
    var v: UInt64 = 0
    Scanner(string: s).scanHexInt64(&v)
    self.init(
      .sRGB,
      red: Double((v >> 16) & 0xFF) / 255,
      green: Double((v >> 8) & 0xFF) / 255,
      blue: Double(v & 0xFF) / 255,
      opacity: 1
    )
  }
}

struct Palette {
  let scheme: ColorScheme
  var ink: Color { scheme == .dark ? Color(hex: "ECF1EC") : Color(hex: "16201A") }
  var sub: Color { scheme == .dark ? Color(hex: "A9BDAD") : Color(hex: "4A5A50") }
  var faint: Color { scheme == .dark ? Color(hex: "8AA095") : Color(hex: "637569") }
  var card: LinearGradient {
    scheme == .dark
      ? LinearGradient(colors: [Color(hex: "18211C"), Color(hex: "121814")], startPoint: .top, endPoint: .bottom)
      : LinearGradient(colors: [Color.white, Color(hex: "F4F7F3")], startPoint: .top, endPoint: .bottom)
  }
  var pill: Color { scheme == .dark ? Color(hex: "1B3626") : Color(hex: "E1F2E7") }
  var brand: Color { scheme == .dark ? Color(hex: "3FCB84") : Color(hex: "10864A") }
}

struct DatePill: View {
  let text: String
  let p: Palette

  var body: some View {
    Text(text)
      .font(.system(size: 11, weight: .semibold))
      .foregroundStyle(p.brand)
      .padding(.horizontal, 8)
      .padding(.vertical, 3)
      .background(p.pill, in: Capsule())
  }
}

struct CourseRow: View {
  let course: WidgetCourse
  let p: Palette
  var showRoom = true

  var body: some View {
    HStack(alignment: .top, spacing: 7) {
      RoundedRectangle(cornerRadius: 1.5)
        .fill(Color(hex: course.color))
        .frame(width: 3)
      VStack(alignment: .leading, spacing: 1) {
        HStack(spacing: 5) {
          Text(course.name)
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(p.ink)
            .lineLimit(1)
          Spacer(minLength: 2)
          Text(course.time)
            .font(.system(size: 10, weight: .medium))
            .foregroundStyle(p.faint)
            .lineLimit(1)
        }
        if showRoom && !course.room.isEmpty {
          Text(course.room)
            .font(.system(size: 10))
            .foregroundStyle(p.sub)
            .lineLimit(1)
        }
      }
    }
    .fixedSize(horizontal: false, vertical: true)
  }
}

struct FocusRow: View {
  let item: WidgetFocus
  let p: Palette

  private var tag: String? {
    switch item.state {
    case "class": return "正在上课"
    case "next": return "下一节"
    default: return nil
    }
  }

  var body: some View {
    HStack(alignment: .top, spacing: 7) {
      RoundedRectangle(cornerRadius: 1.5)
        .fill(Color(hex: item.color))
        .frame(width: 3)
      VStack(alignment: .leading, spacing: 2) {
        HStack(spacing: 5) {
          Text(item.name)
            .font(.system(size: 12.5, weight: .semibold))
            .foregroundStyle(p.ink)
            .lineLimit(1)
            .minimumScaleFactor(0.8)
          Spacer(minLength: 2)
          if let tag {
            Text(tag)
              .font(.system(size: 9, weight: .semibold))
              .foregroundStyle(p.brand)
              .lineLimit(1)
              .fixedSize()
          }
        }
        HStack(spacing: 4) {
          Text(item.time)
            .font(.system(size: 9.5, weight: .medium))
            .foregroundStyle(p.faint)
            .lineLimit(1)
          if !item.room.isEmpty {
            Text("·")
              .font(.system(size: 9.5))
              .foregroundStyle(p.faint)
            Text(item.room)
              .font(.system(size: 9.5))
              .foregroundStyle(p.sub)
              .lineLimit(1)
          }
        }
      }
    }
    .fixedSize(horizontal: false, vertical: true)
  }
}

struct EmptyState: View {
  let text: String
  var subtitle: String = "点开 App 看看课表"
  let p: Palette

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(text)
        .font(.system(size: 13, weight: .semibold))
        .foregroundStyle(p.ink)
        .lineLimit(2)
      Text(subtitle)
        .font(.system(size: 10))
        .foregroundStyle(p.sub)
        .lineLimit(2)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
  }
}

/// 「数据没读到」用这个，和「今天真没课」区分开：
/// 以前两种都落进 EmptyState，桌面上分不清是没课还是文件没写进来。
struct NoDataState: View {
  let title: String
  let subtitle: String
  let p: Palette

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(title)
        .font(.system(size: 13, weight: .semibold))
        .foregroundStyle(p.ink)
        .lineLimit(2)
      Text(subtitle)
        .font(.system(size: 10))
        .foregroundStyle(p.sub)
        .lineLimit(2)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
  }
}

struct MediumView: View {
  let payload: WidgetPayload?
  let p: Palette
  var dayStart = false

  private var shown: [WidgetCourse] { Array((payload?.courses ?? []).prefix(3)) }

  var body: some View {
    VStack(alignment: .leading, spacing: 5) {
      HStack {
        DatePill(text: payload?.dateLabel ?? "今天", p: p)
        Spacer()
        Text(payload.map { "第 \($0.week) 周" } ?? "")
          .font(.system(size: 10, weight: .medium))
          .foregroundStyle(p.faint)
      }

      if dayStart {
        // 午夜那一条 entry：先换天，别让桌面上挂着昨天的课表
        NoDataState(title: "新的一天", subtitle: "打开 App 刷新今天的课表", p: p)
      } else if let payload {
        if shown.isEmpty {
          EmptyState(text: payload.emptyText ?? "今天没课，好好休息", p: p)
        } else {
          VStack(alignment: .leading, spacing: 5) {
            ForEach(shown) { CourseRow(course: $0, p: p) }
          }
          Spacer(minLength: 0)
          HStack {
            Text(
              payload.done == true
                ? (payload.doneText ?? "今日课程已经上完了")
                : (payload.more > 0 ? "还有 \(payload.more) 门" : "共 \(payload.courses.count) 门")
            )
              .font(.system(size: 10))
              .foregroundStyle(p.faint)
              .lineLimit(1)
            Spacer()
            Text("刷新 \(payload.updatedAt)")
              .font(.system(size: 10))
              .foregroundStyle(p.faint)
          }
        }
      } else {
        NoDataState(title: "还没有课表数据", subtitle: "打开 App 同步一次就好", p: p)
      }
    }
    .padding(.horizontal, 12)
    .padding(.vertical, 10)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
  }
}

struct SmallView: View {
  let payload: WidgetPayload?
  let p: Palette
  var dayStart = false

  private var focus: [WidgetFocus] { Array((payload?.focus ?? []).prefix(2)) }

  var body: some View {
    VStack(alignment: .leading, spacing: 5) {
      DatePill(text: payload?.dateLabel ?? "今天", p: p)

      if dayStart {
        NoDataState(title: "新的一天", subtitle: "打开 App 刷新今天的课表", p: p)
      } else if let payload {
        if payload.done == true {
          // 今天的课全部上完了
          VStack(alignment: .leading, spacing: 4) {
            Text(payload.doneText ?? "今日课程已经上完了")
              .font(.system(size: 13, weight: .semibold))
              .foregroundStyle(p.ink)
              .lineLimit(2)
              .minimumScaleFactor(0.85)
            Text("今天共 \(payload.courses.count) 门课")
              .font(.system(size: 10))
              .foregroundStyle(p.sub)
              .lineLimit(1)
          }
          .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        } else if !focus.isEmpty {
          // 2×2 里放最常见的两门：正在上 + 下一节，或下一节 + 再下一节
          VStack(alignment: .leading, spacing: 7) {
            ForEach(focus) { FocusRow(item: $0, p: p) }
          }
          Spacer(minLength: 0)
          if payload.courses.count > focus.count {
            Text("今天共 \(payload.courses.count) 门课")
              .font(.system(size: 9.5))
              .foregroundStyle(p.faint)
              .lineLimit(1)
          }
        } else if let first = payload.courses.first {
          Text("今天第一节")
            .font(.system(size: 10, weight: .medium))
            .foregroundStyle(p.sub)
          Text(first.name)
            .font(.system(size: 14, weight: .bold))
            .foregroundStyle(p.ink)
            .lineLimit(2)
            .minimumScaleFactor(0.85)
          Spacer(minLength: 0)
          Text(first.time)
            .font(.system(size: 10, weight: .medium))
            .foregroundStyle(p.faint)
          if !first.room.isEmpty {
            Text(first.room)
              .font(.system(size: 10))
              .foregroundStyle(p.sub)
              .lineLimit(1)
          }
        } else {
          EmptyState(text: payload.emptyText ?? "今天没课，好好休息", p: p)
        }
      } else {
        NoDataState(title: "还没有课表数据", subtitle: "打开 App 同步一次就好", p: p)
      }
    }
    .padding(.horizontal, 12)
    .padding(.vertical, 10)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
  }
}

struct Entry: TimelineEntry {
  let date: Date
  let payload: WidgetPayload?
  /// 午夜那一条：只负责「换天」，让桌面提示打开 App 刷新，别整晚挂着前一天的课表
  var dayStart = false
}

struct Provider: TimelineProvider {
  func placeholder(in context: Context) -> Entry {
    Entry(date: Date(), payload: nil)
  }

  func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) {
    completion(Entry(date: Date(), payload: WidgetStore.load()))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) {
    let now = Date()
    let payload = WidgetStore.load()

    // 下一个 00:00:05（今天还没过就取今天，过了就取明天）
    let midnight = Calendar.current.nextDate(
      after: now,
      matching: DateComponents(hour: 0, minute: 0, second: 5),
      matchingPolicy: .nextTime
    ) ?? now.addingTimeInterval(20 * 60)

    // 平时每 20 分钟醒一次（App 写数据时也会主动 reload）；
    // 再加一条午夜 entry，避免 23:50 之后整晚都显示前一天的课表。
    let entries = [
      Entry(date: now, payload: payload),
      Entry(date: midnight, payload: nil, dayStart: true),
    ]
    let nextRefresh = min(now.addingTimeInterval(20 * 60), midnight)
    completion(Timeline(entries: entries, policy: .after(nextRefresh)))
  }
}

struct SicauWidgetView: View {
  @Environment(\.widgetFamily) private var family
  @Environment(\.colorScheme) private var scheme
  let entry: Entry

  var body: some View {
    let p = Palette(scheme: scheme)
    Group {
      if family == .systemSmall {
        SmallView(payload: entry.payload, p: p, dayStart: entry.dayStart)
      } else {
        MediumView(payload: entry.payload, p: p, dayStart: entry.dayStart)
      }
    }
    .containerBackground(for: .widget) {
      p.card
    }
    .overlay(alignment: .topTrailing) {
      // 和安卓版一样，右上角压一个淡校徽水印
      Image(scheme == .dark ? "emblemWhite" : "emblem")
        .resizable()
        .interpolation(.high)
        .scaledToFit()
        .frame(width: family == .systemSmall ? 72 : 96)
        .opacity(scheme == .dark ? 0.09 : 0.10)
        .offset(x: family == .systemSmall ? 26 : 30, y: family == .systemSmall ? -10 : -16)
        .allowsHitTesting(false)
    }
    .widgetURL(URL(string: "sicau-pocket://schedule"))
  }
}

struct SicauScheduleWidget: Widget {
  let kind = "SicauScheduleWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: Provider()) { entry in
      SicauWidgetView(entry: entry)
    }
    .configurationDisplayName("川农课表")
    .description("今天几节课、在哪上，放桌面不用点开 App。")
    .supportedFamilies([.systemSmall, .systemMedium])
    .contentMarginsDisabled()
  }
}

@main
struct SicauWidgetBundle: WidgetBundle {
  var body: some Widget {
    SicauScheduleWidget()
  }
}
