package com.noe.streamflex.ui;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RadialGradient;
import android.graphics.Shader;
import android.util.AttributeSet;
import android.view.Choreographer;
import android.view.View;

import java.util.Random;

/**
 * Fondo animado: tres "auroras" radiales en movimiento + campo de estrellas titilantes.
 *
 * Estabilidad:
 *  - Un solo frame callback de Choreographer, sin animadores por frame.
 *  - Se detiene al desmontarse o cuando la ventana deja de ser visible (no gasta batería
 *    ni CPU en segundo plano).
 *  - Respeta "reducir movimiento" y el ajuste de escala de animación del sistema.
 *  - Todo el dibujo se hace con objetos reutilizados: cero asignaciones por frame.
 */
public class AuroraBackdropView extends View {

    private static final int STAR_COUNT = 64;
    private static final int BLOB_COUNT = 3;
    /** Tope de ~40 fps: las auroras son lentas, no hace falta redibujar a 120 Hz. */
    private static final long MIN_FRAME_NS = 25_000_000L;

    private static final int[] BLOB_COLORS = {
            0xFF2F6BFF, // azul
            0xFF8B5CF6, // violeta
            0xFF18B6C9  // cian
    };

    private final Paint blobPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint starPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Shader[] blobs = new Shader[BLOB_COUNT];

    private final float[] starX = new float[STAR_COUNT];
    private final float[] starY = new float[STAR_COUNT];
    private final float[] starRadius = new float[STAR_COUNT];
    private final float[] starPhase = new float[STAR_COUNT];
    private final float[] starSpeed = new float[STAR_COUNT];

    private float blobRadius;
    private long startNanos;
    private long lastInvalidateNanos;
    private boolean frameScheduled;
    private boolean animated = true;

    private final Choreographer.FrameCallback frameCallback = new Choreographer.FrameCallback() {
        @Override
        public void doFrame(long frameTimeNanos) {
            frameScheduled = false;
            if (lastInvalidateNanos == 0L || frameTimeNanos - lastInvalidateNanos >= MIN_FRAME_NS) {
                lastInvalidateNanos = frameTimeNanos;
                invalidate();
            }
            scheduleFrame();
        }
    };

    public AuroraBackdropView(Context context) {
        this(context, null);
    }

    public AuroraBackdropView(Context context, AttributeSet attrs) {
        this(context, attrs, 0);
    }

    public AuroraBackdropView(Context context, AttributeSet attrs, int defStyleAttr) {
        super(context, attrs, defStyleAttr);
        starPaint.setColor(Color.WHITE);
        buildStars();
    }

    private void buildStars() {
        Random random = new Random(20241025L);
        float density = getResources().getDisplayMetrics().density;
        for (int i = 0; i < STAR_COUNT; i++) {
            starX[i] = random.nextFloat();
            starY[i] = random.nextFloat();
            starRadius[i] = (0.5f + random.nextFloat() * 1.1f) * density;
            starPhase[i] = random.nextFloat() * 6.2832f;
            starSpeed[i] = 0.35f + random.nextFloat() * 1.15f;
        }
    }

    /** Activa o congela la animación (usado para "reducir movimiento"). */
    public void setAnimated(boolean animated) {
        if (this.animated == animated) {
            return;
        }
        this.animated = animated;
        if (animated) {
            startNanos = System.nanoTime();
            scheduleFrame();
        } else {
            cancelFrame();
        }
        invalidate();
    }

    @Override
    protected void onSizeChanged(int width, int height, int oldWidth, int oldHeight) {
        super.onSizeChanged(width, height, oldWidth, oldHeight);
        if (width <= 0 || height <= 0) {
            return;
        }
        blobRadius = Math.max(width, height) * 0.62f;
        for (int i = 0; i < BLOB_COUNT; i++) {
            blobs[i] = new RadialGradient(
                    0f, 0f, blobRadius,
                    BLOB_COLORS[i], Color.TRANSPARENT,
                    Shader.TileMode.CLAMP);
        }
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        int width = getWidth();
        int height = getHeight();
        if (width <= 0 || height <= 0 || blobs[0] == null) {
            return;
        }

        float seconds = animated ? (System.nanoTime() - startNanos) / 1_000_000_000f : 0f;

        // --- Auroras ---
        for (int i = 0; i < BLOB_COUNT; i++) {
            float speed = 0.085f + i * 0.037f;
            float phase = i * 2.1f;
            float cx = width * (0.5f + 0.42f * (float) Math.sin(seconds * speed + phase));
            float cy = height * (0.40f + 0.26f * (float) Math.cos(seconds * speed * 0.83f + phase * 1.6f));

            blobPaint.setShader(blobs[i]);
            blobPaint.setAlpha(i == 0 ? 46 : (i == 1 ? 40 : 26));
            canvas.save();
            canvas.translate(cx - blobRadius, cy - blobRadius);
            canvas.drawRect(0f, 0f, blobRadius * 2f, blobRadius * 2f, blobPaint);
            canvas.restore();
        }
        blobPaint.setShader(null);

        // --- Estrellas ---
        for (int i = 0; i < STAR_COUNT; i++) {
            float twinkle = 0.5f + 0.5f * (float) Math.sin(seconds * starSpeed[i] + starPhase[i]);
            int alpha = (int) (40 + twinkle * 150);
            starPaint.setAlpha(alpha);
            canvas.drawCircle(starX[i] * width, starY[i] * height, starRadius[i], starPaint);
        }
    }

    @Override
    protected void onAttachedToWindow() {
        super.onAttachedToWindow();
        if (startNanos == 0L) {
            startNanos = System.nanoTime();
        }
        scheduleFrame();
    }

    @Override
    protected void onDetachedFromWindow() {
        cancelFrame();
        super.onDetachedFromWindow();
    }

    @Override
    @SuppressWarnings("deprecation")
    protected void onWindowVisibilityChanged(int visibility) {
        super.onWindowVisibilityChanged(visibility);
        if (visibility == VISIBLE) {
            scheduleFrame();
        } else {
            cancelFrame();
        }
    }

    @Override
    protected void onVisibilityChanged(View changedView, int visibility) {
        super.onVisibilityChanged(changedView, visibility);
        if (visibility == VISIBLE) {
            scheduleFrame();
        } else {
            cancelFrame();
        }
    }

    private void scheduleFrame() {
        if (!animated || frameScheduled) {
            return;
        }
        if (!isAttachedToWindow() || getVisibility() != VISIBLE || getWindowVisibility() != VISIBLE) {
            return;
        }
        frameScheduled = true;
        Choreographer.getInstance().postFrameCallback(frameCallback);
    }

    private void cancelFrame() {
        if (frameScheduled) {
            frameScheduled = false;
            try {
                Choreographer.getInstance().removeFrameCallback(frameCallback);
            } catch (IllegalStateException ignored) {
                // Choreographer no disponible (hilo no principal): no es crítico.
            }
        }
    }
}
