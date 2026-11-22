package local.d.planer;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyPermanentlyInvalidatedException;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Свой модуль: данные для виджета «Сегодня» на главном экране и вход по отпечатку пальца.
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

    // ---------- Вход по отпечатку пальца ----------
    // Ключ шифрования данных (DEK) шифруется ключом из защищённого хранилища Android (AndroidKeyStore).
    // Этот ключ нельзя достать из телефона, а пользоваться им можно только после прикладывания пальца.
    // Если в телефоне добавят или удалят отпечаток — ключ становится недействительным (нужен вход по паролю).
    private static final String BIO_KEY = "planer_bio_v1";
    private static final int BIO = BiometricManager.Authenticators.BIOMETRIC_STRONG;

    private interface CipherJob { void run(Cipher c) throws Exception; }

    private SecretKey bioKey(boolean create) throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        if (!create) return ks.containsAlias(BIO_KEY) ? (SecretKey) ks.getKey(BIO_KEY, null) : null;
        if (ks.containsAlias(BIO_KEY)) ks.deleteEntry(BIO_KEY);
        KeyGenParameterSpec.Builder b = new KeyGenParameterSpec.Builder(BIO_KEY, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .setUserAuthenticationRequired(true)
            .setInvalidatedByBiometricEnrollment(true);
        if (Build.VERSION.SDK_INT >= 30) b.setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG);
        KeyGenerator kg = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        kg.init(b.build());
        return kg.generateKey();
    }

    private void bioPrompt(PluginCall call, Cipher c, String title, String sub, CipherJob job) {
        BiometricPrompt bp = new BiometricPrompt(getActivity(), ContextCompat.getMainExecutor(getContext()), new BiometricPrompt.AuthenticationCallback() {
            @Override
            public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                try {
                    BiometricPrompt.CryptoObject co = result.getCryptoObject();
                    job.run(co != null && co.getCipher() != null ? co.getCipher() : c);
                } catch (Exception ex) {
                    call.reject("Не удалось открыть ключ: " + ex.getMessage(), "crypto");
                }
            }
            @Override
            public void onAuthenticationError(int code, CharSequence msg) {
                String k = (code == BiometricPrompt.ERROR_NEGATIVE_BUTTON || code == BiometricPrompt.ERROR_USER_CANCELED || code == BiometricPrompt.ERROR_CANCELED) ? "cancel"
                    : (code == BiometricPrompt.ERROR_LOCKOUT || code == BiometricPrompt.ERROR_LOCKOUT_PERMANENT) ? "lockout" : "err" + code;
                call.reject(String.valueOf(msg), k);
            }
        });
        BiometricPrompt.PromptInfo info = new BiometricPrompt.PromptInfo.Builder()
            .setTitle(title).setSubtitle(sub)
            .setNegativeButtonText("Ввести пароль")
            .setAllowedAuthenticators(BIO)
            .setConfirmationRequired(false)
            .build();
        bp.authenticate(info, new BiometricPrompt.CryptoObject(c));
    }

    @PluginMethod
    public void bioStatus(PluginCall call) {
        int r = BiometricManager.from(getContext()).canAuthenticate(BIO);
        JSObject o = new JSObject();
        o.put("available", r == BiometricManager.BIOMETRIC_SUCCESS);
        o.put("reason", r == BiometricManager.BIOMETRIC_SUCCESS ? "ok" : r == BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED ? "none"
            : r == BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE ? "nohw" : r == BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE ? "busy"
            : r == BiometricManager.BIOMETRIC_ERROR_SECURITY_UPDATE_REQUIRED ? "update" : "other");
        call.resolve(o);
    }

    @PluginMethod
    public void bioEnroll(PluginCall call) {
        String secret = call.getString("secret", null);
        if (secret == null) { call.reject("нет ключа", "arg"); return; }
        getActivity().runOnUiThread(() -> {
            try {
                Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
                c.init(Cipher.ENCRYPT_MODE, bioKey(true));
                bioPrompt(call, c, "Вход по отпечатку", "Приложите палец, чтобы включить вход в Планер по отпечатку", ci -> {
                    byte[] ct = ci.doFinal(Base64.decode(secret, Base64.NO_WRAP));
                    JSObject o = new JSObject();
                    o.put("iv", Base64.encodeToString(ci.getIV(), Base64.NO_WRAP));
                    o.put("ct", Base64.encodeToString(ct, Base64.NO_WRAP));
                    call.resolve(o);
                });
            } catch (Exception ex) {
                call.reject("Не удалось подготовить вход по отпечатку: " + ex.getMessage(), "setup");
            }
        });
    }

    @PluginMethod
    public void bioDecrypt(PluginCall call) {
        String iv = call.getString("iv", null), ct = call.getString("ct", null);
        if (iv == null || ct == null) { call.reject("нет данных", "arg"); return; }
        getActivity().runOnUiThread(() -> {
            try {
                SecretKey k = bioKey(false);
                if (k == null) { call.reject("Ключ отпечатка не найден", "invalid"); return; }
                Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
                try {
                    c.init(Cipher.DECRYPT_MODE, k, new GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP)));
                } catch (KeyPermanentlyInvalidatedException inv) {
                    call.reject("Отпечатки в телефоне изменились", "invalid"); return;
                }
                bioPrompt(call, c, "Вход в Планер", "Приложите палец", ci -> {
                    byte[] plain = ci.doFinal(Base64.decode(ct, Base64.NO_WRAP));
                    JSObject o = new JSObject();
                    o.put("secret", Base64.encodeToString(plain, Base64.NO_WRAP));
                    call.resolve(o);
                });
            } catch (Exception ex) {
                call.reject("Вход по отпечатку не сработал: " + ex.getMessage(), "setup");
            }
        });
    }

    @PluginMethod
    public void bioClear(PluginCall call) {
        try {
            KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
            ks.load(null);
            if (ks.containsAlias(BIO_KEY)) ks.deleteEntry(BIO_KEY);
        } catch (Exception ignored) { }
        call.resolve();
    }
}
