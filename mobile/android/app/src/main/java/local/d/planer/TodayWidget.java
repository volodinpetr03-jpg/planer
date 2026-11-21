package local.d.planer;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.view.View;
import android.widget.RemoteViews;
import java.time.LocalDate;
import org.json.JSONArray;
import org.json.JSONObject;

// Виджет «Сегодня» на главном экране: задачи на сегодня и просроченные.
// Данные кладёт приложение (PlanerFilesPlugin.widgetSet) при каждом сохранении; сам виджет ничего не меняет.
public class TodayWidget extends AppWidgetProvider {
    static final String PREFS = "planer_widget";
    static final String ACTION_NEW = "local.d.planer.NEW_TASK";
    private static final int[] ROWS = { R.id.w_r0, R.id.w_r1, R.id.w_r2, R.id.w_r3, R.id.w_r4, R.id.w_r5 };

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) mgr.updateAppWidget(id, build(ctx));
    }

    static void refresh(Context ctx) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, TodayWidget.class));
        if (ids == null || ids.length == 0) return;
        RemoteViews v = build(ctx);
        for (int id : ids) mgr.updateAppWidget(id, v);
    }

    private static PendingIntent open(Context ctx, boolean add) {
        Intent i = new Intent(ctx, MainActivity.class);
        i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (add) i.setAction(ACTION_NEW);
        return PendingIntent.getActivity(ctx, add ? 2 : 1, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static RemoteViews build(Context ctx) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_today);
        v.setOnClickPendingIntent(R.id.w_root, open(ctx, false));
        v.setOnClickPendingIntent(R.id.w_add, open(ctx, true));
        for (int r : ROWS) v.setViewVisibility(r, View.GONE);
        String title = "Сегодня", sub = "", empty = null;
        try {
            SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            String raw = p.getString("data", null);
            if (raw == null) {
                empty = "Откройте Планер — здесь появятся задачи на сегодня";
            } else {
                JSONObject d = new JSONObject(raw);
                title = d.optString("title", "Сегодня");
                String today = LocalDate.now().toString();
                if (d.optBoolean("locked", false)) {
                    empty = "Планер защищён паролем. Задач на сегодня: " + d.optInt("left", 0);
                } else if (!today.equals(d.optString("date", ""))) {
                    title = "Сегодня";
                    empty = "Откройте Планер, чтобы обновить список";
                } else {
                    int left = d.optInt("left", 0), done = d.optInt("done", 0);
                    sub = left == 0 && done > 0 ? "всё сделано" : (done > 0 ? done + " из " + (done + left) : String.valueOf(left));
                    JSONArray items = d.optJSONArray("items");
                    int n = items == null ? 0 : Math.min(items.length(), ROWS.length);
                    for (int k = 0; k < n; k++) {
                        JSONObject it = items.getJSONObject(k);
                        boolean dn = it.optBoolean("done", false), over = it.optBoolean("over", false);
                        String time = it.optString("time", "");
                        String line = (dn ? "✓  " : "○  ") + (time.isEmpty() ? "" : time + "  ") + it.optString("t", "");
                        v.setTextViewText(ROWS[k], line);
                        v.setTextColor(ROWS[k], dn ? Color.parseColor("#7E8494") : over ? Color.parseColor("#FF6B6B") : Color.parseColor("#E8EAF0"));
                        v.setViewVisibility(ROWS[k], View.VISIBLE);
                    }
                    int more = d.optInt("more", 0);
                    if (n == 0) empty = done > 0 ? "Все задачи на сегодня выполнены 🎉" : "На сегодня задач нет";
                    else if (more > 0) empty = "и ещё " + more;
                }
            }
        } catch (Exception e) {
            empty = "Откройте Планер, чтобы обновить список";
        }
        v.setTextViewText(R.id.w_title, title);
        v.setTextViewText(R.id.w_sub, sub);
        if (empty != null) { v.setTextViewText(R.id.w_empty, empty); v.setViewVisibility(R.id.w_empty, View.VISIBLE); }
        else v.setViewVisibility(R.id.w_empty, View.GONE);
        return v;
    }
}
