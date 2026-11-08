const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * 桌面小组件（Android AppWidget）。
 *
 * JS 侧把「今天的课表」写进 filesDir/widget.json（见 lib/widgetSync.ts），
 * 小组件在系统刷新周期（30 分钟）、点「刷新」、或点小组件打开 App 时，读取这个文件渲染。
 *
 * 为什么不写在 android/ 里：android/ 是 expo prebuild 生成物、被 .gitignore 忽略，
 * 只有通过 config plugin 注入才能在每次 prebuild 后保留下来。
 */

const KOTLIN_PROVIDER = `package __PKG__.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import org.json.JSONObject
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import __PKG__.MainActivity
import __PKG__.R

class ScheduleWidgetProvider : AppWidgetProvider() {

  companion object {
    const val ACTION_REFRESH = "__PKG__.WIDGET_REFRESH"
    private const val PREFS = "sicau_widget"
  }

  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    for (id in ids) manager.updateAppWidget(id, buildViews(context))
  }

  override fun onReceive(context: Context, intent: Intent) {
    super.onReceive(context, intent)
    if (intent.action == ACTION_REFRESH) {
      val manager = AppWidgetManager.getInstance(context)
      val ids = manager.getAppWidgetIds(ComponentName(context, ScheduleWidgetProvider::class.java))
      for (id in ids) manager.updateAppWidget(id, buildViews(context))
    }
  }

  private fun dataFile(context: Context): File = File(context.filesDir, "widget.json")

  private fun buildViews(context: Context): RemoteViews {
    val views = RemoteViews(context.packageName, R.layout.schedule_widget)

    val open = PendingIntent.getActivity(
      context, 0,
      Intent(context, MainActivity::class.java).apply {
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
      },
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    views.setOnClickPendingIntent(R.id.widget_root, open)

    val refresh = PendingIntent.getBroadcast(
      context, 1,
      Intent(context, ScheduleWidgetProvider::class.java).apply { action = ACTION_REFRESH },
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    views.setOnClickPendingIntent(R.id.widget_refresh, refresh)

    val file = dataFile(context)
    if (!file.exists()) {
      views.setTextViewText(R.id.widget_title, "川农口袋")
      views.setTextViewText(R.id.widget_line1, "打开 App 同步一次课表")
      views.setTextViewText(R.id.widget_line2, "之后这里会显示今天的课")
      views.setTextViewText(R.id.widget_line3, "")
      views.setTextViewText(R.id.widget_updated, "")
      return views
    }

    return try {
      val json = JSONObject(file.readText())
      val week = json.optInt("week", 0)
      val day = json.optString("day", "")
      val title = if (week > 0) "第" + week + "周 · " + day else day
      views.setTextViewText(R.id.widget_title, title)

      val courses = json.optJSONArray("courses")
      val texts = arrayOf("", "", "")
      val rooms = arrayOf("", "", "")
      if (courses != null) {
        for (i in 0 until minOf(courses.length(), 3)) {
          val c = courses.getJSONObject(i)
          texts[i] = c.optString("time", "") + "  " + c.optString("name", "")
          rooms[i] = c.optString("room", "")
        }
      }
      val ids = intArrayOf(R.id.widget_line1, R.id.widget_line2, R.id.widget_line3)
      val roomIds = intArrayOf(R.id.widget_room1, R.id.widget_room2, R.id.widget_room3)
      for (i in 0..2) {
        views.setTextViewText(ids[i], texts[i])
        views.setTextViewText(roomIds[i], rooms[i])
      }

      if (texts[0].isEmpty()) {
        views.setTextViewText(R.id.widget_line1, json.optString("emptyText", "今天没课，好好休息"))
      }

      val updated = json.optString("updatedAt", "")
      views.setTextViewText(R.id.widget_updated, if (updated.isEmpty()) "" else "更新于 " + updated)
      views
    } catch (e: Exception) {
      views.setTextViewText(R.id.widget_title, "川农口袋")
      views.setTextViewText(R.id.widget_line1, "数据读取失败，打开 App 再同步一次")
      views
    }
  }
}
`;

const LAYOUT = `<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
  android:id="@+id/widget_root"
  android:layout_width="match_parent"
  android:layout_height="match_parent"
  android:orientation="vertical"
  android:background="@drawable/widget_bg"
  android:padding="14dp">

  <LinearLayout
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:orientation="horizontal"
    android:gravity="center_vertical">

    <TextView
      android:id="@+id/widget_title"
      android:layout_width="0dp"
      android:layout_height="wrap_content"
      android:layout_weight="1"
      android:text="川农口袋"
      android:textColor="#0E7A43"
      android:textSize="13sp"
      android:textStyle="bold" />

    <TextView
      android:id="@+id/widget_refresh"
      android:layout_width="wrap_content"
      android:layout_height="wrap_content"
      android:text="刷新"
      android:textColor="#7C8B80"
      android:textSize="11sp"
      android:paddingLeft="10dp"
      android:paddingRight="4dp" />
  </LinearLayout>

  <LinearLayout
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:orientation="vertical"
    android:layout_marginTop="8dp">

    <TextView
      android:id="@+id/widget_line1"
      android:layout_width="match_parent"
      android:layout_height="wrap_content"
      android:maxLines="1"
      android:ellipsize="end"
      android:text="08:10-09:50  高等数学"
      android:textColor="#16201A"
      android:textSize="14sp"
      android:textStyle="bold" />

    <TextView
      android:id="@+id/widget_room1"
      android:layout_width="match_parent"
      android:layout_height="wrap_content"
      android:maxLines="1"
      android:ellipsize="end"
      android:text="4-A306 · 王老师"
      android:textColor="#7C8B80"
      android:textSize="11sp" />

    <TextView
      android:id="@+id/widget_line2"
      android:layout_width="match_parent"
      android:layout_height="wrap_content"
      android:maxLines="1"
      android:ellipsize="end"
      android:text="10:10-11:50  动物生理学"
      android:textColor="#16201A"
      android:textSize="13sp"
      android:layout_marginTop="4dp" />

    <TextView
      android:id="@+id/widget_room2"
      android:layout_width="match_parent"
      android:layout_height="wrap_content"
      android:maxLines="1"
      android:ellipsize="end"
      android:text="1-教 205"
      android:textColor="#7C8B80"
      android:textSize="11sp" />

    <TextView
      android:id="@+id/widget_line3"
      android:layout_width="match_parent"
      android:layout_height="wrap_content"
      android:maxLines="1"
      android:ellipsize="end"
      android:textColor="#16201A"
      android:textSize="13sp"
      android:layout_marginTop="4dp" />

    <TextView
      android:id="@+id/widget_room3"
      android:layout_width="match_parent"
      android:layout_height="wrap_content"
      android:maxLines="1"
      android:ellipsize="end"
      android:textColor="#7C8B80"
      android:textSize="11sp" />
  </LinearLayout>

  <TextView
    android:id="@+id/widget_updated"
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:layout_marginTop="6dp"
    android:textColor="#9AA79E"
    android:textSize="10sp" />
</LinearLayout>
`;

const BG = `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
  <solid android:color="@color/widget_bg" />
  <corners android:radius="22dp" />
  <stroke android:width="1dp" android:color="@color/widget_border" />
</shape>
`;

const INFO = `<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
  android:initialLayout="@layout/schedule_widget"
  android:minWidth="250dp"
  android:minHeight="110dp"
  android:targetCellWidth="4"
  android:targetCellHeight="2"
  android:resizeMode="horizontal|vertical"
  android:updatePeriodMillis="1800000"
  android:widgetCategory="home_screen"
  android:previewLayout="@layout/schedule_widget"
  android:description="@string/widget_description" />
`;

const COLORS = `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <color name="widget_bg">#F7FBF8</color>
  <color name="widget_border">#D8EADC</color>
</resources>
`;

const COLORS_NIGHT = `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <color name="widget_bg">#15211A</color>
  <color name="widget_border">#25382C</color>
</resources>
`;

const STRINGS = `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <string name="widget_description">今日课表：节次、课程与教室</string>
</resources>
`;

function writeIfChanged(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === content) return;
  fs.writeFileSync(file, content);
}

function withWidgetManifest(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    if (!app) return cfg;
    app.receiver = app.receiver || [];
    const exists = app.receiver.some(
      (r) => r.$ && r.$['android:name'] === '.widget.ScheduleWidgetProvider'
    );
    if (!exists) {
      app.receiver.push({
        $: {
          'android:name': '.widget.ScheduleWidgetProvider',
          'android:exported': 'true',
          'android:label': '川农课表',
        },
        'intent-filter': [
          {
            action: [{ $: { 'android:name': 'android.appwidget.action.APPWIDGET_UPDATE' } }],
          },
        ],
        'meta-data': [
          {
            $: {
              'android:name': 'android.appwidget.provider',
              'android:resource': '@xml/schedule_widget_info',
            },
          },
        ],
      });
    }
    return cfg;
  });
}

function withWidgetSources(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const root = cfg.modRequest.platformProjectRoot;
      const pkg = cfg.android?.package || 'io.github.grerat666708.sicaupocket';
      const javaDir = path.join(root, 'app/src/main/java', pkg.replace(/\./g, '/'), 'widget');
      const res = path.join(root, 'app/src/main/res');

      writeIfChanged(path.join(javaDir, 'ScheduleWidgetProvider.kt'), KOTLIN_PROVIDER.replace(/__PKG__/g, pkg));
      writeIfChanged(path.join(res, 'layout/schedule_widget.xml'), LAYOUT);
      writeIfChanged(path.join(res, 'drawable/widget_bg.xml'), BG);
      writeIfChanged(path.join(res, 'xml/schedule_widget_info.xml'), INFO);
      writeIfChanged(path.join(res, 'values/widget_colors.xml'), COLORS);
      writeIfChanged(path.join(res, 'values-night/widget_colors.xml'), COLORS_NIGHT);
      writeIfChanged(path.join(res, 'values/widget_strings.xml'), STRINGS);
      return cfg;
    },
  ]);
}

module.exports = function withScheduleWidget(config) {
  config = withWidgetManifest(config);
  config = withWidgetSources(config);
  return config;
};
