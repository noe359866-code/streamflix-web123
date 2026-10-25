package com.noe.streamflex;

import android.animation.ObjectAnimator;
import android.animation.ValueAnimator;
import android.app.Activity;
import android.content.pm.PackageInfo;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.view.animation.AccelerateDecelerateInterpolator;
import android.view.animation.DecelerateInterpolator;
import android.widget.TextView;

/**
 * StreamFlex v0.0.1 — pantalla de inicio propia.
 *
 * App 100% propia: no usa librerías externas, no pide permisos y no
 * recopila datos. Solo muestra la identidad de la app y su versión real,
 * leída desde el propio paquete instalado.
 */
public class MainActivity extends Activity {

    private ObjectAnimator glowPulse;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        makeStatusBarTranslucent();
        setContentView(R.layout.activity_main);

        TextView versionView = findViewById(R.id.version_chip);
        versionView.setText("v" + readVersionName());

        TextView buildView = findViewById(R.id.build_line);
        buildView.setText(getString(R.string.build_line, Integer.toString(Build.VERSION.SDK_INT)));

        animateIn();
    }

    /** Lee versionName real del paquete: siempre coincide con la versión del APK. */
    private String readVersionName() {
        try {
            PackageInfo info = getPackageManager().getPackageInfo(getPackageName(), 0);
            if (info.versionName != null) {
                return info.versionName;
            }
        } catch (Exception ignored) {
        }
        return "0.0.1";
    }

    private void makeStatusBarTranslucent() {
        Window window = getWindow();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
            window.setStatusBarColor(Color.TRANSPARENT);
            window.setNavigationBarColor(Color.parseColor("#0B0F1A"));
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            // Contenido oscuro sobre el degradado claro del centro: iconos claros.
            window.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
        }
    }

    private void animateIn() {
        View logo = findViewById(R.id.logo_container);
        View title = findViewById(R.id.app_title);
        View chip = findViewById(R.id.version_chip);
        View tagline = findViewById(R.id.tagline);
        View glow = findViewById(R.id.logo_glow);

        View[] staged = new View[]{logo, title, chip, tagline};
        for (int i = 0; i < staged.length; i++) {
            View v = staged[i];
            v.setAlpha(0f);
            v.setTranslationY(dp(24));
            v.animate()
                    .alpha(1f)
                    .translationY(0f)
                    .setStartDelay(120L * i)
                    .setDuration(620L)
                    .setInterpolator(new DecelerateInterpolator())
                    .start();
        }

        glow.setScaleX(0.7f);
        glow.setScaleY(0.7f);
        glowPulse = ObjectAnimator.ofFloat(glow, "alpha", 0.25f, 0.75f);
        glowPulse.setDuration(2200L);
        glowPulse.setRepeatMode(ValueAnimator.REVERSE);
        glowPulse.setRepeatCount(ValueAnimator.INFINITE);
        glowPulse.setInterpolator(new AccelerateDecelerateInterpolator());
        glowPulse.start();

        logo.animate()
                .scaleX(1f)
                .scaleY(1f)
                .setDuration(760L)
                .setInterpolator(new DecelerateInterpolator())
                .start();

        glowPulse.setStartDelay(600L);
    }

    private float dp(float value) {
        return value * getResources().getDisplayMetrics().density;
    }

    @Override
    protected void onDestroy() {
        if (glowPulse != null) {
            glowPulse.cancel();
            glowPulse = null;
        }
        super.onDestroy();
    }
}
