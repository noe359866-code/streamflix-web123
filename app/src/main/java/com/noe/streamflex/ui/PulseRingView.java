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

/**
 * Halos que laten detrás del logo. Un único frame callback, se detiene al desmontarse
 * y puede congelarse para respetar "reducir movimiento".
 */
public class PulseRingView extends View {

    private static final int RING_COUNT = 2;
    private static final long MIN_FRAME_NS = 25_000_000L;

    private final Paint ringPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint hazePaint = new Paint(Paint.ANTI_ALIAS_FLAG);

    private long startNanos;
    private long lastInvalidateNanos;
    private boolean frameScheduled;
    private boolean animated = true;
    private float strokeWidth;

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

    public PulseRingView(Context context) {
        this(context, null);
    }

    public PulseRingView(Context context, AttributeSet attrs) {
        this(context, attrs, 0);
    }

    public PulseRingView(Context context, AttributeSet attrs, int defStyleAttr) {
        super(context, attrs, defStyleAttr);
        strokeWidth = 1.4f * getResources().getDisplayMetrics().density;
        ringPaint.setStyle(Paint.Style.STROKE);
        ringPaint.setStrokeWidth(strokeWidth);
        ringPaint.setColor(0xFF7FB0FF);
    }

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
        float radius = Math.min(width, height) * 0.5f;
        hazePaint.setShader(new RadialGradient(
                radius, radius, radius,
                new int[]{0x554F8EF7, 0x228B5CF6, Color.TRANSPARENT},
                new float[]{0f, 0.55f, 1f},
                Shader.TileMode.CLAMP));
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        int width = getWidth();
        int height = getHeight();
        if (width <= 0 || height <= 0) {
            return;
        }

        float centerX = width * 0.5f;
        float centerY = height * 0.5f;
        float maxRadius = Math.min(width, height) * 0.5f;
        float seconds = animated ? (System.nanoTime() - startNanos) / 1_000_000_000f : 0.25f;

        // Halo suave fijo
        if (hazePaint.getShader() != null) {
            canvas.drawCircle(centerX, centerY, maxRadius, hazePaint);
        }

        // Anillos que laten hacia afuera
        for (int i = 0; i < RING_COUNT; i++) {
            float progress = (seconds * 0.32f + i * (1f / RING_COUNT)) % 1f;
            float radius = maxRadius * (0.55f + 0.42f * progress);
            int alpha = (int) (110 * (1f - progress) * (1f - progress));
            ringPaint.setAlpha(Math.max(0, Math.min(255, alpha)));
            canvas.drawCircle(centerX, centerY, radius, ringPaint);
        }
        ringPaint.setAlpha(255);
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
                // Nada que hacer fuera del hilo principal.
            }
        }
    }
}
