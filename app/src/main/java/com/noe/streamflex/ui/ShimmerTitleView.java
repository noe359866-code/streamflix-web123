package com.noe.streamflex.ui;

import android.animation.ValueAnimator;
import android.content.Context;
import android.graphics.LinearGradient;
import android.graphics.Matrix;
import android.graphics.Shader;
import android.util.AttributeSet;
import android.view.animation.LinearInterpolator;
import android.widget.TextView;

/**
 * Título con degradado "shimmer" que barre la luz de izquierda a derecha.
 * Si no se llama a {@link #startShimmer()} el texto queda con el degradado estático,
 * así que nunca se pierde legibilidad.
 */
public class ShimmerTitleView extends TextView {

    private static final int[] COLORS = {0xFFE6EDFF, 0xFFFFFFFF, 0xFFB9C8FF, 0xFFFFFFFF, 0xFFE6EDFF};
    private static final float[] POSITIONS = {0f, 0.28f, 0.5f, 0.72f, 1f};
    private static final long SWEEP_MS = 3400L;

    private final Matrix shaderMatrix = new Matrix();
    private LinearGradient gradient;
    private ValueAnimator sweepAnimator;
    private boolean shimmerRunning;
    private int textWidth;

    public ShimmerTitleView(Context context) {
        this(context, null);
    }

    public ShimmerTitleView(Context context, AttributeSet attrs) {
        this(context, attrs, 0);
    }

    public ShimmerTitleView(Context context, AttributeSet attrs, int defStyleAttr) {
        super(context, attrs, defStyleAttr);
        setWillNotDraw(false);
    }

    @Override
    protected void onSizeChanged(int width, int height, int oldWidth, int oldHeight) {
        super.onSizeChanged(width, height, oldWidth, oldHeight);
        if (width <= 0) {
            return;
        }
        textWidth = width;
        gradient = new LinearGradient(
                0f, 0f, Math.max(1f, width * 0.75f), 0f,
                COLORS, POSITIONS, Shader.TileMode.CLAMP);
        getPaint().setShader(gradient);
        resetShaderOffset();
    }

    /** Arranca el barrido de luz. Si ya está corriendo, no hace nada. */
    public void startShimmer() {
        if (textWidth <= 0 || gradient == null || shimmerRunning) {
            return;
        }
        shimmerRunning = true;
        sweepAnimator = ValueAnimator.ofFloat(-textWidth, textWidth * 1.6f);
        sweepAnimator.setDuration(SWEEP_MS);
        sweepAnimator.setRepeatCount(ValueAnimator.INFINITE);
        sweepAnimator.setRepeatMode(ValueAnimator.RESTART);
        sweepAnimator.setInterpolator(new LinearInterpolator());
        sweepAnimator.addUpdateListener(new ValueAnimator.AnimatorUpdateListener() {
            @Override
            public void onAnimationUpdate(ValueAnimator animation) {
                float value = (Float) animation.getAnimatedValue();
                shaderMatrix.setTranslate(value, 0f);
                LinearGradient current = gradient;
                if (current != null) {
                    current.setLocalMatrix(shaderMatrix);
                    invalidate();
                }
            }
        });
        sweepAnimator.start();
    }

    public void stopShimmer() {
        shimmerRunning = false;
        if (sweepAnimator != null) {
            sweepAnimator.cancel();
            sweepAnimator = null;
        }
        resetShaderOffset();
    }

    private void resetShaderOffset() {
        if (gradient == null) {
            return;
        }
        shaderMatrix.setTranslate(-textWidth * 0.25f, 0f);
        gradient.setLocalMatrix(shaderMatrix);
        invalidate();
    }

    @Override
    protected void onAttachedToWindow() {
        super.onAttachedToWindow();
        if (gradient != null) {
            resetShaderOffset();
        }
    }

    @Override
    protected void onDetachedFromWindow() {
        stopShimmer();
        super.onDetachedFromWindow();
    }
}
