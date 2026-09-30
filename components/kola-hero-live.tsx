"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useSpring,
  useReducedMotion,
} from "framer-motion";

export type KolaStatus = "idle" | "listening" | "thinking" | "speaking";

type Ripple = { id: number; x: number; y: number };

/**
 * Eye overlay positions as percentages of the artwork, matching
 * public/kola-hero.png (800x800). Keep in sync with scripts/gen-kola-hero.cjs.
 */
const EYE_BOXES = [
  { left: 32.5, top: 44.5 },
  { left: 57.0, top: 44.5 },
] as const;

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export function KolaHeroLive({
  status = "idle",
  audioLevel = 0,
}: {
  status?: KolaStatus;
  audioLevel?: number;
}) {
  const reduceMotion = useReducedMotion();
  const [ok, setOk] = useState(false);
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const [isHover, setIsHover] = useState(false);
  const [isBlinking, setIsBlinking] = useState(false);

  const rippleId = useRef(0);
  const blinkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const smoothX = useSpring(mouseX, { damping: 25, stiffness: 80, mass: 1.2 });
  const smoothY = useSpring(mouseY, { damping: 25, stiffness: 80, mass: 1.2 });
  // Source motion values are created once: the original code called
  // useMotionValue(0) inline inside useSpring, allocating a new value per render.
  const targetRotY = useMotionValue(0);
  const targetRotX = useMotionValue(0);
  const rotateY = useSpring(targetRotY, { damping: 30, stiffness: 50 });
  const rotateX = useSpring(targetRotX, { damping: 30, stiffness: 50 });

  const isSpeaking = status === "speaking";
  const isThinking = status === "thinking";
  const level = clamp01(audioLevel);

  useEffect(() => {
    const img = new window.Image();
    img.onload = () => setOk(true);
    img.onerror = () => setOk(false);
    img.src = "/kola-hero.png";
  }, []);

  // Gentle mouse follow; suppressed while busy so the head stays focused.
  useEffect(() => {
    if (reduceMotion) return;
    if (isSpeaking || isThinking) {
      targetRotY.set(0);
      targetRotX.set(0);
      mouseX.set(0);
      mouseY.set(0);
      return;
    }
    const handleMove = (e: MouseEvent | TouchEvent) => {
      const touch = e as TouchEvent;
      const cx = touch.touches
        ? touch.touches[0].clientX
        : (e as MouseEvent).clientX;
      const cy = touch.touches
        ? touch.touches[0].clientY
        : (e as MouseEvent).clientY;
      if (cx == null || cy == null) return;
      const x = (cx / window.innerWidth - 0.5) * 2;
      const y = (cy / window.innerHeight - 0.5) * 2;
      mouseX.set(x * 16);
      mouseY.set(y * 10);
      targetRotY.set(x * 6);
      targetRotX.set(-y * 4);
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("touchmove", handleMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("touchmove", handleMove);
    };
  }, [
    mouseX,
    mouseY,
    targetRotX,
    targetRotY,
    isSpeaking,
    isThinking,
    reduceMotion,
  ]);

  // Auto-blink; faster while thinking.
  useEffect(() => {
    if (reduceMotion) return;
    const interval = setInterval(() => {
      if (Math.random() > 0.3 || isThinking) {
        setIsBlinking(true);
        if (blinkTimer.current) clearTimeout(blinkTimer.current);
        blinkTimer.current = setTimeout(() => setIsBlinking(false), 180);
      }
    }, isThinking ? 800 : 3200);
    return () => {
      clearInterval(interval);
      if (blinkTimer.current) clearTimeout(blinkTimer.current);
    };
  }, [isThinking, reduceMotion]);

  const addRipple = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const touch = e as React.TouchEvent;
    const clientX = touch.touches
      ? touch.touches[0].clientX
      : (e as React.MouseEvent).clientX;
    const clientY = touch.touches
      ? touch.touches[0].clientY
      : (e as React.MouseEvent).clientY;
    if (clientX == null || clientY == null) return;
    const id = ++rippleId.current;
    setRipples((r) => [
      ...r,
      { id, x: clientX - rect.left, y: clientY - rect.top },
    ]);
    setTimeout(() => setRipples((r) => r.filter((rp) => rp.id !== id)), 1200);
  }, []);

  if (!ok) return null;

  const eyeScaleY = isBlinking ? 0.1 : 1;

  return (
    <motion.div
      onMouseEnter={() => setIsHover(true)}
      onMouseLeave={() => setIsHover(false)}
      onMouseDown={addRipple}
      onTouchStart={(e) => {
        setIsHover(true);
        addRipple(e);
      }}
      onTouchEnd={() => setIsHover(false)}
      className="relative aspect-square w-full max-w-[22rem] cursor-pointer select-none [perspective:1200px]"
      style={{
        x: smoothX,
        y: smoothY,
        rotateX,
        rotateY,
        transformStyle: "preserve-3d",
      }}
    >
      {/* Rings */}
      <motion.div
        animate={{ rotate: 360, scale: isSpeaking ? [1, 1.08, 1] : 1 }}
        transition={{
          rotate: {
            duration: isHover ? 18 : 40,
            repeat: Infinity,
            ease: "linear",
          },
          scale: { duration: 0.6, repeat: isSpeaking ? Infinity : 0 },
        }}
        className="absolute inset-0 rounded-full border border-cyan-400/20"
      />
      <div className="absolute inset-0 rounded-full border border-dashed border-cyan-400/10 animate-orbit" />

      {/* Breathing glow, stronger while speaking */}
      <motion.div
        animate={{
          scale: isSpeaking ? 1.3 + level * 0.5 : [1, 1.15, 1],
          opacity: isSpeaking ? 0.18 : [0.06, 0.12, 0.06],
        }}
        transition={{
          duration: isSpeaking ? 0.2 : 4,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="absolute left-1/2 top-1/2 h-[70%] w-[70%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-400 blur-3xl"
      />

      {/* KOLA */}
      <motion.div
        animate={{ y: isSpeaking ? [0, -2, 0] : [0, -6, 0] }}
        transition={{
          duration: isSpeaking ? 0.25 : 5,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="absolute inset-0"
        style={{
          filter: `drop-shadow(0 0 ${isSpeaking ? 60 : 25}px rgba(34,211,238,${
            isSpeaking ? 0.5 : 0.15
          }))`,
        }}
      >
        <Image
          src="/kola-hero.png"
          alt="KOLA"
          fill
          sizes="(max-width: 1024px) 22rem, 22rem"
          className="object-contain"
          priority
          draggable={false}
        />

        {/* Eyes live inside the floating wrapper so they track the artwork
            instead of drifting as KOLA bobs. */}
        {EYE_BOXES.map((box) => (
          <motion.div
            key={box.left}
            className="absolute h-[7%] w-[10.5%] origin-center"
            style={{ left: `${box.left}%`, top: `${box.top}%` }}
            animate={{ scaleY: eyeScaleY }}
            transition={{ duration: 0.12 }}
          >
            <motion.div
              animate={{
                boxShadow: isSpeaking
                  ? `0 0 ${20 + level * 40}px ${8 + level * 10}px rgba(34,211,238,1)`
                  : "0 0 12px 3px rgba(34,211,238,0.8)",
                scale: isSpeaking ? 1 + level * 0.8 : 1,
              }}
              className="h-full w-full rounded-[100%] bg-cyan-200"
            />
          </motion.div>
        ))}
      </motion.div>

      {/* Voice waveform. Amplitude is passed down as a CSS variable so
          changing audioLevel never restarts the bar animations. */}
      <AnimatePresence>
        {isSpeaking && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute bottom-0 left-1/2 flex -translate-x-1/2 items-end gap-1"
            style={
              {
                "--kola-wave-amp": `${Math.max(4, level * 38)}px`,
              } as React.CSSProperties
            }
          >
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="kola-wave-bar w-1.5 rounded-full bg-gradient-to-t from-cyan-400 to-blue-300"
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Thinking dots */}
      <AnimatePresence>
        {isThinking && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute bottom-0 left-1/2 flex -translate-x-1/2 gap-1"
          >
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="h-1.5 w-1.5 rounded-full bg-cyan-300"
                animate={{ y: [0, -6, 0], opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Click ripple */}
      <AnimatePresence>
        {ripples.map((r) => (
          <motion.span
            key={r.id}
            initial={{ scale: 0, opacity: 0.8 }}
            animate={{ scale: 4.5, opacity: 0 }}
            transition={{ duration: 1.1, ease: [0.23, 1, 0.32, 1] }}
            className="pointer-events-none absolute left-0 top-0 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-300/60 bg-cyan-400/10"
            style={{ left: r.x, top: r.y }}
          />
        ))}
      </AnimatePresence>
    </motion.div>
  );
}

export default KolaHeroLive;

