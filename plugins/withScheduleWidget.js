const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * 桌面小组件（Android AppWidget）：4×2 大尺寸 + 2×2 小尺寸。
 *
 * JS 侧把「今天要显示的课」写进 filesDir/widget.json（见 lib/widgetSync.ts），
 * 两个小组件都读同一个文件：大尺寸列今天前 3 节，小尺寸只显示「正在上 / 下一节」。
 *
 * 为什么不直接改 android/：那是 expo prebuild 生成物、被 .gitignore 忽略，
 * 只有通过 config plugin 注入，改完图标/重装依赖后重新 prebuild 才不会丢。
 */

const KOTLIN = `package __PKG__.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.view.View
import android.widget.RemoteViews
import org.json.JSONObject
import java.io.File
import __PKG__.MainActivity
import __PKG__.R

class ScheduleWidgetProvider : AppWidgetProvider() {

  companion object {
    const val ACTION_REFRESH = "__PKG__.WIDGET_REFRESH"
    private val ROW_NAMES = intArrayOf(R.id.widget_name1, R.id.widget_name2, R.id.widget_name3, R.id.widget_name4, R.id.widget_name5, R.id.widget_name6)
    private val ROW_DETAILS = intArrayOf(R.id.widget_detail1, R.id.widget_detail2, R.id.widget_detail3, R.id.widget_detail4, R.id.widget_detail5, R.id.widget_detail6)
    private val ROW_BARS = intArrayOf(R.id.widget_bar1, R.id.widget_bar2, R.id.widget_bar3, R.id.widget_bar4, R.id.widget_bar5, R.id.widget_bar6)
    private val ROWS = intArrayOf(R.id.widget_row1, R.id.widget_row2, R.id.widget_row3, R.id.widget_row4, R.id.widget_row5, R.id.widget_row6)
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

    val file = File(context.filesDir, "widget.json")
    if (!file.exists()) {
      views.setTextViewText(R.id.widget_date, "川农口袋")
      views.setTextViewText(ROW_NAMES[0], "打开 App 同步一次课表")
      views.setTextViewText(ROW_DETAILS[0], "之后这里显示今天的课")
      for (i in 1..5) views.setViewVisibility(ROWS[i], View.GONE)
      views.setTextViewText(R.id.widget_more, "")
      return views
    }

    return try {
      val json = JSONObject(file.readText())
      val date = json.optString("dateLabel", json.optString("day", ""))
      views.setTextViewText(R.id.widget_date, date)

      val courses = json.optJSONArray("courses")
      val count = if (courses == null) 0 else courses.length()
      for (i in 0..5) {
        if (i >= count) {
          views.setViewVisibility(ROWS[i], View.GONE)
        } else {
          val c = courses!!.getJSONObject(i)
          views.setViewVisibility(ROWS[i], View.VISIBLE)
          views.setTextViewText(ROW_NAMES[i], c.optString("name", ""))
          views.setTextViewText(ROW_DETAILS[i], c.optString("time", "") + "  " + c.optString("room", ""))
          val color = safeColor(c.optString("color", "#0E7A43"))
          views.setTextColor(ROW_NAMES[i], color)
          views.setInt(ROW_BARS[i], "setBackgroundColor", color)
        }
      }

      if (count == 0) {
        views.setViewVisibility(ROWS[0], View.VISIBLE)
        views.setTextViewText(ROW_NAMES[0], json.optString("emptyText", "今天没课，好好休息"))
        views.setTextViewText(ROW_DETAILS[0], "点开 App 看看课表")
        val gray = safeColor("#5C6B60")
        views.setTextColor(ROW_NAMES[0], gray)
        views.setInt(ROW_BARS[0], "setBackgroundColor", safeColor("#C9D8CD"))
      }

      val more = json.optInt("more", 0)
      views.setTextViewText(R.id.widget_more, if (more > 0) "还有 " + more + " 门" else "")
      views
    } catch (e: Exception) {
      views.setTextViewText(R.id.widget_date, "川农口袋")
      views.setTextViewText(ROW_NAMES[0], "数据读取失败")
      views.setTextViewText(ROW_DETAILS[0], "打开 App 再同步一次")
      views
    }
  }

  private fun safeColor(hex: String): Int = try {
    Color.parseColor(hex)
  } catch (e: Exception) {
    Color.parseColor("#0E7A43")
  }
}
`;

const KOTLIN_SMALL = `package __PKG__.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.widget.RemoteViews
import org.json.JSONObject
import java.io.File
import __PKG__.MainActivity
import __PKG__.R

/** 2x2 小尺寸：只显示「正在上 / 下一节」这一门课 */
class ScheduleWidgetSmallProvider : AppWidgetProvider() {

  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    for (id in ids) manager.updateAppWidget(id, buildViews(context))
  }

  override fun onReceive(context: Context, intent: Intent) {
    super.onReceive(context, intent)
    if (intent.action == ScheduleWidgetProvider.ACTION_REFRESH) {
      val manager = AppWidgetManager.getInstance(context)
      val ids = manager.getAppWidgetIds(ComponentName(context, ScheduleWidgetSmallProvider::class.java))
      for (id in ids) manager.updateAppWidget(id, buildViews(context))
    }
  }

  private fun buildViews(context: Context): RemoteViews {
    val views = RemoteViews(context.packageName, R.layout.schedule_widget_small)

    val open = PendingIntent.getActivity(
      context, 2,
      Intent(context, MainActivity::class.java).apply {
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
      },
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    views.setOnClickPendingIntent(R.id.widget_small_root, open)

    val refresh = PendingIntent.getBroadcast(
      context, 3,
      Intent(context, ScheduleWidgetSmallProvider::class.java).apply {
        action = ScheduleWidgetProvider.ACTION_REFRESH
      },
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    views.setOnClickPendingIntent(R.id.widget_small_refresh, refresh)

    val file = File(context.filesDir, "widget.json")
    if (!file.exists()) {
      views.setTextViewText(R.id.widget_small_date, "川农口袋")
      views.setTextViewText(R.id.widget_small_more, "")
      views.setTextViewText(R.id.widget_small_state, "打开 App 同步一次课表")
      setRowsVisible(views, 0)
      views.setViewVisibility(R.id.widget_small_state, android.view.View.VISIBLE)
      return views
    }

    return try {
      val json = JSONObject(file.readText())
      views.setTextViewText(R.id.widget_small_date, json.optString("dateLabel", json.optString("day", "")))

      val courses = json.optJSONArray("courses")
      val count = if (courses == null) 0 else courses.length()
      val shown = Math.min(count, 3)

      if (shown == 0) {
        setRowsVisible(views, 0)
        views.setTextViewText(R.id.widget_small_more, "")
        views.setViewVisibility(R.id.widget_small_more, android.view.View.GONE)
        views.setTextViewText(R.id.widget_small_state, json.optString("emptyText", "今天没课，好好休息"))
        views.setViewVisibility(R.id.widget_small_state, android.view.View.VISIBLE)
      } else {
        views.setViewVisibility(R.id.widget_small_state, android.view.View.GONE)
        for (i in 0 until shown) {
          val c = courses!!.getJSONObject(i)
          val color = safeColor(c.optString("color", "#0E7A43"))
          val time = c.optString("time", "").substringBefore("-").trim()
          when (i) {
            0 -> {
              views.setTextViewText(R.id.widget_small_time1, time)
              views.setTextViewText(R.id.widget_small_name1, c.optString("name", ""))
              views.setTextColor(R.id.widget_small_name1, color)
              views.setInt(R.id.widget_small_bar1, "setBackgroundColor", color)
            }
            1 -> {
              views.setTextViewText(R.id.widget_small_time2, time)
              views.setTextViewText(R.id.widget_small_name2, c.optString("name", ""))
              views.setTextColor(R.id.widget_small_name2, color)
              views.setInt(R.id.widget_small_bar2, "setBackgroundColor", color)
            }
            else -> {
              views.setTextViewText(R.id.widget_small_time3, time)
              views.setTextViewText(R.id.widget_small_name3, c.optString("name", ""))
              views.setTextColor(R.id.widget_small_name3, color)
              views.setInt(R.id.widget_small_bar3, "setBackgroundColor", color)
            }
          }
        }
        setRowsVisible(views, shown)
        if (count > shown) {
          views.setTextViewText(R.id.widget_small_more, "其他 " + (count - shown) + " 个")
          views.setViewVisibility(R.id.widget_small_more, android.view.View.VISIBLE)
        } else {
          views.setTextViewText(R.id.widget_small_more, "")
          views.setViewVisibility(R.id.widget_small_more, android.view.View.GONE)
        }
      }
      views
    } catch (e: Exception) {
      setRowsVisible(views, 0)
      views.setTextViewText(R.id.widget_small_state, "读取失败，打开 App 再同步一次")
      views.setViewVisibility(R.id.widget_small_state, android.view.View.VISIBLE)
      views
    }
  }

  /** 只显示前 n 行（每行 = 小色条 + 时间 + 课程名） */
  private fun setRowsVisible(views: RemoteViews, n: Int) {
    val ids = intArrayOf(
      R.id.widget_small_bar1, R.id.widget_small_time1, R.id.widget_small_name1,
      R.id.widget_small_bar2, R.id.widget_small_time2, R.id.widget_small_name2,
      R.id.widget_small_bar3, R.id.widget_small_time3, R.id.widget_small_name3,
    )
    for (i in ids.indices) {
      val row = i / 3
      val visible = row < n
      views.setViewVisibility(ids[i], if (visible) android.view.View.VISIBLE else android.view.View.GONE)
    }
  }

  private fun safeColor(hex: String): Int = try {
    Color.parseColor(hex)
  } catch (e: Exception) {
    Color.parseColor("#0E7A43")
  }
}
`;

const LAYOUT = `<?xml version="1.0" encoding="utf-8"?>
<FrameLayout xmlns:android="http://schemas.android.com/apk/res/android"
  android:id="@+id/widget_root"
  android:layout_width="match_parent"
  android:layout_height="match_parent"
  android:background="@drawable/widget_bg">

  <ImageView
    android:id="@+id/widget_emblem"
    android:layout_width="112dp"
    android:layout_height="112dp"
    android:layout_gravity="top|right"
    android:layout_marginTop="-18dp"
    android:layout_marginRight="-22dp"
    android:alpha="0.10"
    android:scaleType="fitCenter"
    android:src="@drawable/widget_emblem"
    android:contentDescription="校徽" />

  <LinearLayout
  android:id="@+id/widget_content"
  android:layout_width="match_parent"
  android:layout_height="match_parent"
  android:orientation="vertical"
  android:paddingLeft="14dp"
  android:paddingRight="14dp"
  android:paddingTop="12dp"
  android:paddingBottom="10dp">

  <LinearLayout
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:orientation="horizontal"
    android:gravity="center_vertical">

    <TextView
      android:id="@+id/widget_date"
      android:layout_width="wrap_content"
      android:layout_height="wrap_content"
      android:background="@drawable/widget_pill"
      android:paddingLeft="10dp"
      android:paddingRight="10dp"
      android:paddingTop="3dp"
      android:paddingBottom="3dp"
      android:text="周日 11月8日"
      android:textColor="#0E7A43"
      android:textSize="12sp"
      android:textStyle="bold" />

    <TextView
      android:layout_width="0dp"
      android:layout_height="1dp"
      android:layout_weight="1" />
  </LinearLayout>

  <LinearLayout
    android:id="@+id/widget_row1"
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:layout_marginTop="10dp"
    android:orientation="horizontal">

    <TextView
      android:id="@+id/widget_bar1"
      android:layout_width="3dp"
      android:layout_height="30dp"
      android:background="#0E7A43" />

    <LinearLayout
      android:layout_width="0dp"
      android:layout_height="wrap_content"
      android:layout_weight="1"
      android:layout_marginLeft="9dp"
      android:orientation="vertical">

      <TextView
        android:id="@+id/widget_name1"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:ellipsize="end"
        android:maxLines="1"
        android:text="高等数学"
        android:textColor="#0E7A43"
        android:textSize="13sp"
        android:textStyle="bold" />

      <TextView
        android:id="@+id/widget_detail1"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:ellipsize="end"
        android:maxLines="1"
        android:text="08:10-09:50  4-A306"
        android:textColor="#7C8B80"
        android:textSize="11sp" />
    </LinearLayout>
  </LinearLayout>

  <LinearLayout
    android:id="@+id/widget_row2"
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:layout_marginTop="8dp"
    android:orientation="horizontal">

    <TextView
      android:id="@+id/widget_bar2"
      android:layout_width="3dp"
      android:layout_height="30dp"
      android:background="#3E3A99" />

    <LinearLayout
      android:layout_width="0dp"
      android:layout_height="wrap_content"
      android:layout_weight="1"
      android:layout_marginLeft="9dp"
      android:orientation="vertical">

      <TextView
        android:id="@+id/widget_name2"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:ellipsize="end"
        android:maxLines="1"
        android:text="动物生物化学"
        android:textColor="#3E3A99"
        android:textSize="13sp"
        android:textStyle="bold" />

      <TextView
        android:id="@+id/widget_detail2"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:ellipsize="end"
        android:maxLines="1"
        android:text="10:10-11:50  4-B608"
        android:textColor="#7C8B80"
        android:textSize="11sp" />
    </LinearLayout>
  </LinearLayout>

  <LinearLayout
    android:id="@+id/widget_row3"
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:layout_marginTop="8dp"
    android:orientation="horizontal">

    <TextView
      android:id="@+id/widget_bar3"
      android:layout_width="3dp"
      android:layout_height="30dp"
      android:background="#8A4B12" />

    <LinearLayout
      android:layout_width="0dp"
      android:layout_height="wrap_content"
      android:layout_weight="1"
      android:layout_marginLeft="9dp"
      android:orientation="vertical">

      <TextView
        android:id="@+id/widget_name3"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:ellipsize="end"
        android:maxLines="1"
        android:text="细胞生物学（动）"
        android:textColor="#8A4B12"
        android:textSize="13sp"
        android:textStyle="bold" />

      <TextView
        android:id="@+id/widget_detail3"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:ellipsize="end"
        android:maxLines="1"
        android:text="14:20-16:00  4-B203"
        android:textColor="#7C8B80"
        android:textSize="11sp" />
    </LinearLayout>
  </LinearLayout>

  <LinearLayout
    android:id="@+id/widget_row4"
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:layout_marginTop="6dp"
    android:orientation="horizontal">

    <TextView
      android:id="@+id/widget_bar4"
      android:layout_width="3dp"
      android:layout_height="30dp"
      android:background="#1F6F4A" />

    <LinearLayout
      android:layout_width="0dp"
      android:layout_height="wrap_content"
      android:layout_weight="1"
      android:layout_marginLeft="9dp"
      android:orientation="vertical">

      <TextView
        android:id="@+id/widget_name4"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:ellipsize="end"
        android:maxLines="1"
        android:text="高等数学"
        android:textColor="#1F6F4A"
        android:textSize="13sp"
        android:textStyle="bold" />

      <TextView
        android:id="@+id/widget_detail4"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:ellipsize="end"
        android:maxLines="1"
        android:text="08:10-09:50  4-A306"
        android:textColor="#7C8B80"
        android:textSize="11sp" />
    </LinearLayout>
  </LinearLayout>

  <LinearLayout
    android:id="@+id/widget_row5"
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:layout_marginTop="6dp"
    android:orientation="horizontal">

    <TextView
      android:id="@+id/widget_bar5"
      android:layout_width="3dp"
      android:layout_height="30dp"
      android:background="#5B4B8A" />

    <LinearLayout
      android:layout_width="0dp"
      android:layout_height="wrap_content"
      android:layout_weight="1"
      android:layout_marginLeft="9dp"
      android:orientation="vertical">

      <TextView
        android:id="@+id/widget_name5"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:ellipsize="end"
        android:maxLines="1"
        android:text="高等数学"
        android:textColor="#5B4B8A"
        android:textSize="13sp"
        android:textStyle="bold" />

      <TextView
        android:id="@+id/widget_detail5"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:ellipsize="end"
        android:maxLines="1"
        android:text="08:10-09:50  4-A306"
        android:textColor="#7C8B80"
        android:textSize="11sp" />
    </LinearLayout>
  </LinearLayout>

  <LinearLayout
    android:id="@+id/widget_row6"
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:layout_marginTop="6dp"
    android:orientation="horizontal">

    <TextView
      android:id="@+id/widget_bar6"
      android:layout_width="3dp"
      android:layout_height="30dp"
      android:background="#7A4A1E" />

    <LinearLayout
      android:layout_width="0dp"
      android:layout_height="wrap_content"
      android:layout_weight="1"
      android:layout_marginLeft="9dp"
      android:orientation="vertical">

      <TextView
        android:id="@+id/widget_name6"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:ellipsize="end"
        android:maxLines="1"
        android:text="高等数学"
        android:textColor="#7A4A1E"
        android:textSize="13sp"
        android:textStyle="bold" />

      <TextView
        android:id="@+id/widget_detail6"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:ellipsize="end"
        android:maxLines="1"
        android:text="08:10-09:50  4-A306"
        android:textColor="#7C8B80"
        android:textSize="11sp" />
    </LinearLayout>
  </LinearLayout>

  <LinearLayout
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:layout_marginTop="6dp"
    android:orientation="horizontal"
    android:gravity="center_vertical">

    <TextView
      android:id="@+id/widget_more"
      android:layout_width="0dp"
      android:layout_height="wrap_content"
      android:layout_weight="1"
      android:text="其他 2 个日程"
      android:textColor="#9AA79E"
      android:textSize="10sp" />

    <TextView
      android:id="@+id/widget_refresh"
      android:layout_width="wrap_content"
      android:layout_height="wrap_content"
      android:text="刷新"
      android:textColor="#9AA79E"
      android:textSize="10sp"
      android:paddingLeft="8dp"
      android:paddingTop="2dp"
      android:paddingBottom="2dp" />
  </LinearLayout>
  </LinearLayout>
</FrameLayout>
`;

const LAYOUT_SMALL = `<?xml version="1.0" encoding="utf-8"?>
<FrameLayout xmlns:android="http://schemas.android.com/apk/res/android"
  android:id="@+id/widget_small_root"
  android:layout_width="match_parent"
  android:layout_height="match_parent"
  android:background="@drawable/widget_bg">

  <ImageView
    android:layout_width="92dp"
    android:layout_height="92dp"
    android:layout_gravity="bottom|right"
    android:layout_marginBottom="-16dp"
    android:layout_marginRight="-18dp"
    android:alpha="0.09"
    android:scaleType="fitCenter"
    android:src="@drawable/widget_emblem"
    android:contentDescription="校徽" />

  <LinearLayout
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="vertical"
    android:paddingLeft="12dp"
    android:paddingRight="12dp"
    android:paddingTop="10dp"
    android:paddingBottom="10dp">

    <LinearLayout
      android:layout_width="match_parent"
      android:layout_height="wrap_content"
      android:gravity="center_vertical"
      android:orientation="horizontal">

      <TextView
        android:id="@+id/widget_small_date"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:background="@drawable/widget_pill"
        android:paddingLeft="8dp"
        android:paddingRight="8dp"
        android:paddingTop="2dp"
        android:paddingBottom="2dp"
        android:text="周日 11月8日"
        android:textColor="#0E7A43"
        android:textSize="11sp"
        android:textStyle="bold" />

      <TextView
        android:layout_width="0dp"
        android:layout_height="1dp"
        android:layout_weight="1" />

      <TextView
        android:id="@+id/widget_small_refresh"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:paddingLeft="6dp"
        android:text="刷新"
        android:textColor="#9AA79E"
        android:textSize="10sp" />
    </LinearLayout>

    <LinearLayout
      android:layout_width="match_parent"
      android:layout_height="wrap_content"
      android:layout_marginTop="7dp"
      android:orientation="horizontal">

      <TextView
        android:id="@+id/widget_small_bar1"
        android:layout_width="3dp"
        android:layout_height="16dp"
        android:background="#0E7A43" />

      <TextView
        android:id="@+id/widget_small_time1"
        android:layout_width="40dp"
        android:layout_height="wrap_content"
        android:layout_marginLeft="7dp"
        android:text="08:10"
        android:textColor="#8A998F"
        android:textSize="10sp" />

      <TextView
        android:id="@+id/widget_small_name1"
        android:layout_width="0dp"
        android:layout_height="wrap_content"
        android:layout_marginLeft="4dp"
        android:layout_weight="1"
        android:ellipsize="end"
        android:maxLines="1"
        android:text="高等数学"
        android:textColor="#0E7A43"
        android:textSize="12sp"
        android:textStyle="bold" />
    </LinearLayout>

    <LinearLayout
      android:layout_width="match_parent"
      android:layout_height="wrap_content"
      android:layout_marginTop="5dp"
      android:orientation="horizontal">

      <TextView
        android:id="@+id/widget_small_bar2"
        android:layout_width="3dp"
        android:layout_height="16dp"
        android:background="#7E6BD9" />

      <TextView
        android:id="@+id/widget_small_time2"
        android:layout_width="40dp"
        android:layout_height="wrap_content"
        android:layout_marginLeft="7dp"
        android:text="10:10"
        android:textColor="#8A998F"
        android:textSize="10sp" />

      <TextView
        android:id="@+id/widget_small_name2"
        android:layout_width="0dp"
        android:layout_height="wrap_content"
        android:layout_marginLeft="4dp"
        android:layout_weight="1"
        android:ellipsize="end"
        android:maxLines="1"
        android:text="动物生物化学"
        android:textColor="#7E6BD9"
        android:textSize="12sp"
        android:textStyle="bold" />
    </LinearLayout>

    <LinearLayout
      android:layout_width="match_parent"
      android:layout_height="wrap_content"
      android:layout_marginTop="5dp"
      android:orientation="horizontal">

      <TextView
        android:id="@+id/widget_small_bar3"
        android:layout_width="3dp"
        android:layout_height="16dp"
        android:background="#C97B2E" />

      <TextView
        android:id="@+id/widget_small_time3"
        android:layout_width="40dp"
        android:layout_height="wrap_content"
        android:layout_marginLeft="7dp"
        android:text="14:20"
        android:textColor="#8A998F"
        android:textSize="10sp" />

      <TextView
        android:id="@+id/widget_small_name3"
        android:layout_width="0dp"
        android:layout_height="wrap_content"
        android:layout_marginLeft="4dp"
        android:layout_weight="1"
        android:ellipsize="end"
        android:maxLines="1"
        android:text="细胞生物学"
        android:textColor="#C97B2E"
        android:textSize="12sp"
        android:textStyle="bold" />
    </LinearLayout>

    <TextView
      android:id="@+id/widget_small_more"
      android:layout_width="match_parent"
      android:layout_height="wrap_content"
      android:layout_marginTop="5dp"
      android:ellipsize="end"
      android:maxLines="1"
      android:text=""
      android:textColor="#9AA79E"
      android:textSize="9sp" />

    <TextView
      android:id="@+id/widget_small_state"
      android:layout_width="match_parent"
      android:layout_height="wrap_content"
      android:layout_marginTop="6dp"
      android:ellipsize="end"
      android:maxLines="2"
      android:text=""
      android:textColor="#8A998F"
      android:textSize="11sp"
      android:visibility="gone" />
  </LinearLayout>
</FrameLayout>
`;

const INFO = `<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
  android:description="@string/widget_description"
  android:initialLayout="@layout/schedule_widget"
  android:minWidth="250dp"
  android:minHeight="110dp"
  android:previewLayout="@layout/schedule_widget"
  android:resizeMode="horizontal|vertical"
  android:targetCellHeight="2"
  android:targetCellWidth="4"
  android:updatePeriodMillis="1800000"
  android:widgetCategory="home_screen" />
`;

const INFO_SMALL = `<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
  android:description="@string/widget_description_small"
  android:initialLayout="@layout/schedule_widget_small"
  android:minWidth="110dp"
  android:minHeight="110dp"
  android:previewLayout="@layout/schedule_widget_small"
  android:resizeMode="horizontal|vertical"
  android:targetCellHeight="2"
  android:targetCellWidth="2"
  android:updatePeriodMillis="1800000"
  android:widgetCategory="home_screen" />
`;

const BG = `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
  <solid android:color="#F7FBF8" />
  <corners android:radius="22dp" />
  <stroke android:width="1dp" android:color="#E3EFE6" />
</shape>
`;

const PILL = `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
  <solid android:color="#DCF2E4" />
  <corners android:radius="10dp" />
</shape>
`;

const STRINGS = `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <string name="widget_description">今日课表：第几周、前 3 节的时间 / 课程 / 教室</string>
  <string name="widget_description_small">今天的课表：最多 3 门课的时间与课程名</string>
</resources>
`;

function writeIfChanged(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === content) return;
  fs.writeFileSync(file, content);
}

function receiver(name, label, infoResource) {
  return {
    $: { 'android:name': name, 'android:exported': 'true', 'android:label': label },
    'intent-filter': [
      { action: [{ $: { 'android:name': 'android.appwidget.action.APPWIDGET_UPDATE' } }] },
    ],
    'meta-data': [
      { $: { 'android:name': 'android.appwidget.provider', 'android:resource': infoResource } },
    ],
  };
}

function withWidgetManifest(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    if (!app) return cfg;
    app.receiver = app.receiver || [];
    const has = (name) => app.receiver.some((r) => r.$ && r.$['android:name'] === name);
    if (!has('.widget.ScheduleWidgetProvider')) {
      app.receiver.push(receiver('.widget.ScheduleWidgetProvider', '川农课表', '@xml/schedule_widget_info'));
    }
    if (!has('.widget.ScheduleWidgetSmallProvider')) {
      app.receiver.push(
        receiver('.widget.ScheduleWidgetSmallProvider', '川农课表（小）', '@xml/schedule_widget_small_info')
      );
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

      writeIfChanged(path.join(javaDir, 'ScheduleWidgetProvider.kt'), KOTLIN.replace(/__PKG__/g, pkg));
      writeIfChanged(path.join(javaDir, 'ScheduleWidgetSmallProvider.kt'), KOTLIN_SMALL.replace(/__PKG__/g, pkg));
      writeIfChanged(path.join(res, 'layout/schedule_widget.xml'), LAYOUT);
      writeIfChanged(path.join(res, 'layout/schedule_widget_small.xml'), LAYOUT_SMALL);
      writeIfChanged(path.join(res, 'drawable/widget_bg.xml'), BG);
      writeIfChanged(path.join(res, 'drawable/widget_pill.xml'), PILL);
      writeIfChanged(path.join(res, 'xml/schedule_widget_info.xml'), INFO);
      writeIfChanged(path.join(res, 'xml/schedule_widget_small_info.xml'), INFO_SMALL);
      writeIfChanged(path.join(res, 'values/widget_strings.xml'), STRINGS);

      // 顶部淡淡的校徽水印：把 assets 里的 emblem 复制成 drawable
      try {
        const src = path.join(cfg.modRequest.projectRoot, 'assets/images/emblem-green.png');
        const dst = path.join(res, 'drawable/widget_emblem.png');
        if (fs.existsSync(src)) {
          fs.mkdirSync(path.dirname(dst), { recursive: true });
          fs.copyFileSync(src, dst);
        }
      } catch (e) {
        // 没有校徽也不影响小组件
      }
      return cfg;
    },
  ]);
}

module.exports = function withScheduleWidget(config) {
  config = withWidgetManifest(config);
  config = withWidgetSources(config);
  return config;
};
