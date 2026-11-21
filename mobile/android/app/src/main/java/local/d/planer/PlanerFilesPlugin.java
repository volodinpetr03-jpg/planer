package local.d.planer;

import android.content.Context;
import android.content.SharedPreferences;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Свой модуль: данные для виджета «Сегодня» на главном экране.
// (Доступ к файлам телефона больше не нужен: совместные проекты работают через Яндекс Диск напрямую.)
@CapacitorPlugin(name = "PlanerFiles")
public class PlanerFilesPlugin extends Plugin {
    // Виджет «Сегодня»: приложение передаёт готовый список задач
    @PluginMethod
    public void widgetSet(PluginCall call) {
        try {
            String json = call.getString("json", null);
            SharedPreferences.Editor e = getContext().getSharedPreferences(TodayWidget.PREFS, Context.MODE_PRIVATE).edit();
            if (json == null) e.remove("data"); else e.putString("data", json);
            e.apply();
            TodayWidget.refresh(getContext());
            call.resolve();
        } catch (Exception ex) {
            call.reject(String.valueOf(ex.getMessage()));
        }
    }

    // Нажатие «+» на виджете: приложение спрашивает, не нужно ли открыть новую задачу
    @PluginMethod
    public void widgetTake(PluginCall call) {
        SharedPreferences p = getContext().getSharedPreferences(TodayWidget.PREFS, Context.MODE_PRIVATE);
        boolean add = p.getBoolean("pendingNew", false);
        if (add) p.edit().putBoolean("pendingNew", false).apply();
        JSObject r = new JSObject();
        r.put("newTask", add);
        call.resolve(r);
    }
}
