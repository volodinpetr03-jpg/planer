package local.d.planer;

import android.Manifest;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Доступ к общей папке в памяти телефона (её синхронизирует с Google Диском приложение FolderSync).
// На Android 11 и новее это разрешение «Доступ ко всем файлам» — включается один раз в настройках Android.
@CapacitorPlugin(name = "PlanerFiles")
public class PlanerFilesPlugin extends Plugin {
    private boolean granted() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) return Environment.isExternalStorageManager();
        return ContextCompat.checkSelfPermission(getContext(), Manifest.permission.WRITE_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED;
    }

    @PluginMethod
    public void hasAccess(PluginCall call) {
        JSObject r = new JSObject();
        r.put("granted", granted());
        call.resolve(r);
    }

    @PluginMethod
    public void askAccess(PluginCall call) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                Intent i = new Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, Uri.parse("package:" + getContext().getPackageName()));
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                try { getContext().startActivity(i); }
                catch (Exception e) {
                    Intent j = new Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION);
                    j.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    getContext().startActivity(j);
                }
            } else {
                ActivityCompat.requestPermissions(getActivity(), new String[]{ Manifest.permission.READ_EXTERNAL_STORAGE, Manifest.permission.WRITE_EXTERNAL_STORAGE }, 7301);
            }
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

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
