package com.xogridmaker.app;

import android.content.SharedPreferences;
import android.util.Log;

import com.capacitorjs.plugins.pushnotifications.MessagingService;

import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Keeps a dormant device's FCM token in sync with the server.
 *
 * FCM calls onNewToken in this background service even when the app is killed
 * — that's the one moment a never-reopened install learns its push token
 * rotated. The Capacitor push plugin's own service only forwards the token to
 * JS while the WebView is alive, so a backgrounded rotation would otherwise be
 * lost and the device would silently stop receiving coach notifications.
 *
 * We EXTEND the plugin's MessagingService (not replace it) and call super so
 * normal foreground push handling is untouched; we just additionally POST the
 * new token to /api/push/refresh, authenticated by the per-device secret the
 * WebView stored via @capacitor/preferences (SharedPreferences "CapacitorStorage").
 */
public class PushTokenService extends MessagingService {
    private static final String TAG = "PushTokenService";
    private static final String REFRESH_URL = "https://www.xogridmaker.com/api/push/refresh";
    // Matches @capacitor/preferences default group + the JS key in registerPush.ts.
    private static final String PREFS_NAME = "CapacitorStorage";
    private static final String SECRET_KEY = "pushRefreshSecret";

    @Override
    public void onNewToken(String token) {
        super.onNewToken(token); // preserve the plugin's normal token handling
        if (token == null || token.isEmpty()) return;

        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        final String secret = prefs.getString(SECRET_KEY, null);
        // No secret yet → this install has never registered while logged in.
        // The normal /api/push/register flow will capture the token (and mint a
        // secret) the next time the app is opened.
        if (secret == null || secret.isEmpty()) return;

        new Thread(() -> postRefresh(secret, token)).start();
    }

    private void postRefresh(String secret, String token) {
        HttpURLConnection conn = null;
        try {
            JSONObject body = new JSONObject();
            body.put("secret", secret);
            body.put("token", token);
            body.put("platform", "android");

            conn = (HttpURLConnection) new URL(REFRESH_URL).openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setConnectTimeout(10000);
            conn.setReadTimeout(10000);
            conn.setDoOutput(true);
            try (OutputStream os = conn.getOutputStream()) {
                os.write(body.toString().getBytes(StandardCharsets.UTF_8));
            }
            int code = conn.getResponseCode();
            if (code >= 300) Log.w(TAG, "refresh non-2xx: " + code);
        } catch (Exception e) {
            // Best-effort: a failed refresh just falls back to the next app open.
            Log.w(TAG, "token refresh failed", e);
        } finally {
            if (conn != null) conn.disconnect();
        }
    }
}
