package local.d.planer;

import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // свой модуль: доступ к общей папке для совместных проектов и данные для виджета «Сегодня»
        registerPlugin(PlanerFilesPlugin.class);
        super.onCreate(savedInstanceState);
        markNew(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        markNew(intent);
    }

    // «+» на виджете: отмечаем, что нужно открыть новую задачу (приложение заберёт отметку при запуске или возврате)
    private void markNew(Intent intent) {
        if (intent != null && TodayWidget.ACTION_NEW.equals(intent.getAction())) {
            getSharedPreferences(TodayWidget.PREFS, Context.MODE_PRIVATE).edit().putBoolean("pendingNew", true).apply();
            intent.setAction(Intent.ACTION_MAIN);
        }
    }
}
