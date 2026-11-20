package local.d.planer;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // свой модуль: доступ к общей папке для совместных проектов
        registerPlugin(PlanerFilesPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
