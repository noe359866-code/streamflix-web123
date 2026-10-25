package com.noe.streamflex;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.HapticFeedbackConstants;
import android.view.LayoutInflater;
import android.view.MotionEvent;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.view.animation.DecelerateInterpolator;
import android.widget.LinearLayout;
import android.widget.TextView;

import com.noe.streamflex.ui.AuroraBackdropView;
import com.noe.streamflex.ui.PulseRingView;
import com.noe.streamflex.ui.ShimmerTitleView;

/**
 * StreamFlex 0.0.1 — pantalla principal.
 *
 * Principios de estabilidad aplicados:
 *  - Ningún recurso obligatorio: si una vista o un dato no está disponible, hay respaldo.
 *  - Animaciones cancelables y con "modo reducido" (ajuste del sistema o escala 0).
 *  - Insets (notch, barra de estado, navegación) aplicados por código: nada queda tapado.
 *  - Contenido en ScrollView con relleno: funciona en pantallas pequeñas y en horizontal.
 *  - Sin permisos, sin red, sin librerías de terceros.
 */
public class MainActivity extends Activity {

    private static final long STAGGER_MS = 85L;
    private static final long FADE_MS = 540L;
    private static final float ENTRANCE_OFFSET_DP = 22f;
    private static final String FALLBACK_VERSION = "0.0.1";

    private View rootView;
    private View logoBadge;
    private ShimmerTitleView titleView;
    private AuroraBackdropView backdrop;
    private PulseRingView pulseRing;
    private TextView versionChip;
    private View[] stagedViews = new View[0];

    private String versionName = FALLBACK_VERSION;
    private boolean reducedMotion;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        configureWindow();

        try {
            setContentView(R.layout.activity_main);
        } catch (RuntimeException e) {
            // Respaldo ultra-defensivo: nunca dejar al usuario con una pantalla en blanco.
            TextView fallback = new TextView(this);
            fallback.setText(getString(R.string.app_name) + " v" + FALLBACK_VERSION);
            fallback.setTextColor(Color.WHITE);
            fallback.setTextSize(24f);
            fallback.setGravity(android.view.Gravity.CENTER);
            setContentView(fallback);
            return;
        }

        bindViews();
        reducedMotion = isReducedMotion();
        versionName = readVersionName();
        applyDynamicText();
        applyInsets();
        installInteractions();
        startVisuals();
    }

    // ------------------------------------------------------------------ ventana

    private void configureWindow() {
        Window window = getWindow();
        window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(getResources().getColor(R.color.bg_dark));

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.setDecorFitsSystemWindows(false);
            WindowInsetsController controller = window.getInsetsController();
            if (controller != null) {
                // El fondo es oscuro: iconos de sistema en claro.
                controller.setSystemBarsAppearance(
                        0,
                        WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                                | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS);
            }
        } else {
            //noinspection deprecation
            window.getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
        }
    }

    private void applyInsets() {
        if (rootView == null) {
            return;
        }
        rootView.setOnApplyWindowInsetsListener(new View.OnApplyWindowInsetsListener() {
            @Override
            public WindowInsets onApplyWindowInsets(View view, WindowInsets insets) {
                int top;
                int bottom;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    android.graphics.Insets bars = insets.getInsets(
                            WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                    top = bars.top;
                    bottom = bars.bottom;
                } else {
                    //noinspection deprecation
                    top = insets.getSystemWindowInsetTop();
                    //noinspection deprecation
                    bottom = insets.getSystemWindowInsetBottom();
                }
                view.setPadding(0, top, 0, bottom);
                return insets;
            }
        });
        rootView.requestApplyInsets();
    }

    // --------------------------------------------------------------- referencias

    private void bindViews() {
        rootView = findViewById(R.id.root);
        logoBadge = findViewById(R.id.logo_badge);
        titleView = findViewById(R.id.app_title);
        backdrop = findViewById(R.id.backdrop);
        pulseRing = findViewById(R.id.pulse_ring);
        versionChip = findViewById(R.id.version_chip);

        stagedViews = new View[]{
                findViewById(R.id.logo_stack),
                findViewById(R.id.app_title),
                findViewById(R.id.version_row),
                findViewById(R.id.tagline),
                findViewById(R.id.feature_row),
                findViewById(R.id.hint_details),
                findViewById(R.id.footer_block)
        };
    }

    // ------------------------------------------------------------------ datos

    private String readVersionName() {
        try {
            PackageInfo info = getPackageManager().getPackageInfo(getPackageName(), 0);
            if (info.versionName != null && info.versionName.trim().length() > 0) {
                return info.versionName;
            }
        } catch (Exception ignored) {
            // Nos quedamos con la versión de respaldo.
        }
        return FALLBACK_VERSION;
    }

    private int countDeclaredPermissions() {
        try {
            PackageInfo info = getPackageManager()
                    .getPackageInfo(getPackageName(), PackageManager.GET_PERMISSIONS);
            String[] permissions = info.requestedPermissions;
            return permissions == null ? 0 : permissions.length;
        } catch (Exception e) {
            return 0;
        }
    }

    private boolean isReducedMotion() {
        try {
            float scale = Settings.Global.getFloat(
                    getContentResolver(), Settings.Global.ANIMATOR_DURATION_SCALE, 1f);
            return scale == 0f;
        } catch (Exception e) {
            // Si el fabricante bloquea el ajuste, asumimos movimiento normal.
            return false;
        }
    }

    private void applyDynamicText() {
        if (versionChip != null) {
            versionChip.setText(getString(R.string.version_chip_format, versionName));
        }
        TextView buildLine = findViewById(R.id.build_line);
        if (buildLine != null) {
            buildLine.setText(getString(R.string.build_line, Integer.toString(Build.VERSION.SDK_INT)));
        }
        TextView footer = findViewById(R.id.footer_line);
        if (footer != null) {
            footer.setText(getString(R.string.footer_format, versionName));
        }
    }

    // ------------------------------------------------------------- interacciones

    private void installInteractions() {
        if (logoBadge != null) {
            logoBadge.setOnTouchListener(new View.OnTouchListener() {
                @Override
                public boolean onTouch(View view, MotionEvent event) {
                    switch (event.getActionMasked()) {
                        case MotionEvent.ACTION_DOWN:
                            view.animate().scaleX(0.95f).scaleY(0.95f)
                                    .setDuration(110L).start();
                            break;
                        case MotionEvent.ACTION_UP:
                        case MotionEvent.ACTION_CANCEL:
                            view.animate().scaleX(1f).scaleY(1f)
                                    .setDuration(170L).start();
                            break;
                        default:
                            break;
                    }
                    return false; // deja pasar el click normal
                }
            });
            logoBadge.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View view) {
                    view.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY);
                    showAboutDialog();
                }
            });
        }
    }

    // ---------------------------------------------------------------- animación

    private void startVisuals() {
        if (reducedMotion) {
            if (backdrop != null) {
                backdrop.setAnimated(false);
            }
            if (pulseRing != null) {
                pulseRing.setAnimated(false);
            }
            showFinalState();
            return;
        }
        if (backdrop != null) {
            backdrop.setAnimated(true);
        }
        if (pulseRing != null) {
            pulseRing.setAnimated(true);
        }
        playIntro();
    }

    private void playIntro() {
        if (!isActivityUsable()) {
            return;
        }
        float offset = ENTRANCE_OFFSET_DP * getResources().getDisplayMetrics().density;
        for (int i = 0; i < stagedViews.length; i++) {
            View view = stagedViews[i];
            if (view == null) {
                continue;
            }
            view.animate().cancel();
            view.setAlpha(0f);
            view.setTranslationY(offset);
            view.animate()
                    .alpha(1f)
                    .translationY(0f)
                    .setStartDelay(STAGGER_MS * i)
                    .setDuration(FADE_MS)
                    .setInterpolator(new DecelerateInterpolator())
                    .start();
        }

        if (logoBadge != null) {
            logoBadge.setScaleX(0.84f);
            logoBadge.setScaleY(0.84f);
            logoBadge.animate()
                    .scaleX(1f)
                    .scaleY(1f)
                    .setStartDelay(STAGGER_MS)
                    .setDuration(640L)
                    .setInterpolator(new DecelerateInterpolator())
                    .start();
        }

        if (titleView != null) {
            titleView.postDelayed(new Runnable() {
                @Override
                public void run() {
                    if (isActivityUsable() && titleView != null) {
                        titleView.startShimmer();
                    }
                }
            }, 420L);
        }
    }

    private void showFinalState() {
        for (View view : stagedViews) {
            if (view == null) {
                continue;
            }
            view.animate().cancel();
            view.setAlpha(1f);
            view.setTranslationY(0f);
        }
        if (logoBadge != null) {
            logoBadge.setScaleX(1f);
            logoBadge.setScaleY(1f);
        }
        if (titleView != null) {
            titleView.stopShimmer();
        }
    }

    private boolean isActivityUsable() {
        if (isFinishing()) {
            return false;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN_MR1 && isDestroyed()) {
            return false;
        }
        return true;
    }

    // ------------------------------------------------------------------ diálogo

    private void showAboutDialog() {
        if (!isActivityUsable()) {
            return;
        }

        View content;
        try {
            content = LayoutInflater.from(this).inflate(R.layout.dialog_about, null, false);
        } catch (RuntimeException e) {
            content = null;
        }

        if (content == null) {
            new AlertDialog.Builder(this, android.R.style.Theme_Material_Dialog_Alert)
                    .setTitle(getString(R.string.about_title))
                    .setMessage(getString(R.string.app_name) + " v" + versionName)
                    .setPositiveButton(R.string.about_close, null)
                    .show();
            return;
        }

        LinearLayout rows = content.findViewById(R.id.about_rows);
        if (rows != null) {
            addRow(rows, getString(R.string.label_version), versionName + "  (code 1)");
            addRow(rows, getString(R.string.label_package), getPackageName());
            addRow(rows, getString(R.string.label_android),
                    Build.VERSION.RELEASE + "  ·  SDK " + Build.VERSION.SDK_INT);
            addRow(rows, getString(R.string.label_device), describeDevice());
            addRow(rows, getString(R.string.label_abi), describeAbi());
            addRow(rows, getString(R.string.label_permissions), permissionsSummary());
            addRow(rows, getString(R.string.label_libraries), getString(R.string.value_no_libraries));
        }

        new AlertDialog.Builder(this, android.R.style.Theme_Material_Dialog_Alert)
                .setTitle(getString(R.string.about_title))
                .setView(content)
                .setPositiveButton(R.string.about_close, null)
                .show();
    }

    private void addRow(LinearLayout container, String label, String value) {
        View row;
        try {
            row = LayoutInflater.from(this).inflate(R.layout.item_info_row, container, false);
        } catch (RuntimeException e) {
            return;
        }
        TextView labelView = row.findViewById(R.id.row_label);
        TextView valueView = row.findViewById(R.id.row_value);
        if (labelView != null) {
            labelView.setText(label);
        }
        if (valueView != null) {
            valueView.setText(value);
        }
        container.addView(row);
    }

    private String describeDevice() {
        String manufacturer = safe(Build.MANUFACTURER);
        String model = safe(Build.MODEL);
        if (model.toLowerCase().startsWith(manufacturer.toLowerCase())) {
            return model;
        }
        return manufacturer + " " + model;
    }

    private String describeAbi() {
        String[] abis = Build.SUPPORTED_ABIS;
        if (abis != null && abis.length > 0) {
            return abis[0];
        }
        return getString(R.string.value_unknown);
    }

    private String permissionsSummary() {
        int count = countDeclaredPermissions();
        if (count == 0) {
            return getString(R.string.value_no_permissions);
        }
        return Integer.toString(count);
    }

    private String safe(String value) {
        return value == null || value.trim().isEmpty() ? getString(R.string.value_unknown) : value.trim();
    }

    // ------------------------------------------------------------------ ciclo

    @Override
    protected void onResume() {
        super.onResume();
        // Si el usuario activó "quitar animaciones" mientras la app estaba abierta,
        // nos adaptamos sin reiniciar.
        boolean stillReduced = isReducedMotion();
        if (stillReduced != reducedMotion) {
            reducedMotion = stillReduced;
            startVisuals();
        }
    }

    @Override
    protected void onDestroy() {
        if (titleView != null) {
            titleView.stopShimmer();
        }
        if (backdrop != null) {
            backdrop.setAnimated(false);
        }
        if (pulseRing != null) {
            pulseRing.setAnimated(false);
        }
        super.onDestroy();
    }
}
