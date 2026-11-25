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

struct WidgetPayload: Codable {
  var week: Int
  var day: String
  var dateLabel: String
  var courses: [WidgetCourse]
  var more: Int
  var highlight: WidgetHighlight?
  var emptyText: String?
  var updatedAt: String
}

enum WidgetStore {
  static func load() -> WidgetPayload? {
    guard
      let url = FileManager.default
        .containerURL(forSecurityApplicationGroupIdentifier: appGroup)?
        .appendingPathComponent("widget.json"),
      let data = try? Data(contentsOf: url)
    else { return nil }
    return try? JSONDecoder().decode(WidgetPayload.self, from: data)
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

struct EmptyState: View {
  let text: String
  let p: Palette

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(text)
        .font(.system(size: 13, weight: .semibold))
        .foregroundStyle(p.ink)
        .lineLimit(2)
      Text("点开 App 看看课表")
        .font(.system(size: 10))
        .foregroundStyle(p.sub)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
  }
}

struct MediumView: View {
  let payload: WidgetPayload?
  let p: Palette

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

      if let payload, !shown.isEmpty {
        VStack(alignment: .leading, spacing: 5) {
          ForEach(shown) { CourseRow(course: $0, p: p) }
        }
        Spacer(minLength: 0)
        HStack {
          Text(payload.more > 0 ? "还有 \(payload.more) 门" : "共 \(payload.courses.count) 门")
            .font(.system(size: 10))
            .foregroundStyle(p.faint)
          Spacer()
          Text("刷新 \(payload.updatedAt)")
            .font(.system(size: 10))
            .foregroundStyle(p.faint)
        }
      } else {
        EmptyState(text: payload?.emptyText ?? "今天没课，好好休息", p: p)
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

  var body: some View {
    VStack(alignment: .leading, spacing: 5) {
      DatePill(text: payload?.dateLabel ?? "今天", p: p)

      if let h = payload?.highlight {
        Text(h.state == "class" ? "正在上课" : "下一节")
          .font(.system(size: 10, weight: .medium))
          .foregroundStyle(p.sub)
        Text(h.name)
          .font(.system(size: 14, weight: .bold))
          .foregroundStyle(p.ink)
          .lineLimit(2)
          .minimumScaleFactor(0.85)
        Spacer(minLength: 0)
        Text(h.time)
          .font(.system(size: 10, weight: .medium))
          .foregroundStyle(p.faint)
        if !h.room.isEmpty {
          Text(h.room)
            .font(.system(size: 10))
            .foregroundStyle(p.sub)
            .lineLimit(1)
        }
      } else if let payload, let first = payload.courses.first {
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
        EmptyState(text: payload?.emptyText ?? "今天没课，好好休息", p: p)
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
}

struct Provider: TimelineProvider {
  func placeholder(in context: Context) -> Entry {
    Entry(date: Date(), payload: nil)
  }

  func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) {
    completion(Entry(date: Date(), payload: WidgetStore.load()))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) {
    // 每 20 分钟醒一次，App 侧写数据时还会主动 reload
    let entry = Entry(date: Date(), payload: WidgetStore.load())
    completion(Timeline(entries: [entry], policy: .after(Date().addingTimeInterval(20 * 60))))
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
        SmallView(payload: entry.payload, p: p)
      } else {
        MediumView(payload: entry.payload, p: p)
      }
    }
    .containerBackground(for: .widget) {
      p.card
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
