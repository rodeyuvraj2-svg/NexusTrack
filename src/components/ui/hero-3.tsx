"use client";

import React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

// ─── Props ───────────────────────────────────────────────────────────────────
interface AnimatedMarqueeHeroProps {
  tagline: string;
  title: React.ReactNode;
  description: string;
  ctaText: string;
  secondaryCtaText?: string;
  onSecondaryCtaClick?: () => void;
  images: string[];
  className?: string;
}

// ─── Animation variants ───────────────────────────────────────────────────────
const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12, delayChildren: 0.1 } },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 120, damping: 18 } },
};

// ─── Primary CTA ──────────────────────────────────────────────────────────────
const PrimaryButton = ({ children }: { children: React.ReactNode }) => (
  <motion.button
    whileHover={{ scale: 1.04 }}
    whileTap={{ scale: 0.96 }}
    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 via-purple-500 to-indigo-500 px-7 py-3.5 text-sm font-semibold text-white shadow-xl shadow-purple-500/25 transition-shadow hover:shadow-purple-500/40 btn-press"
  >
    {children}
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
    </svg>
  </motion.button>
);

// ─── Secondary CTA ────────────────────────────────────────────────────────────
const SecondaryButton = ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
  <motion.button
    whileHover={{ scale: 1.04 }}
    whileTap={{ scale: 0.96 }}
    onClick={onClick}
    className="inline-flex items-center gap-2 rounded-xl border border-border/60 bg-card/40 px-7 py-3.5 text-sm font-medium text-foreground/80 backdrop-blur-sm transition-colors hover:bg-card/70 hover:text-foreground btn-press"
  >
    {children}
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
    </svg>
  </motion.button>
);

// ─── Main Hero Component ──────────────────────────────────────────────────────
export const AnimatedMarqueeHero: React.FC<AnimatedMarqueeHeroProps> = ({
  tagline,
  title,
  description,
  ctaText,
  secondaryCtaText,
  onSecondaryCtaClick,
  images,
  className,
}) => {
  // Triple the images for a seamless loop
  const duplicatedImages = [...images, ...images, ...images];

  return (
    <section
      className={cn(
        "relative w-full h-screen min-h-[600px] overflow-hidden bg-background",
        "flex flex-col items-center justify-center text-center",
        className
      )}
    >
      {/* ── Ambient background glow ── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] rounded-full bg-purple-500/10 blur-[150px]" />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] rounded-full bg-indigo-500/8 blur-[150px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-violet-500/5 blur-[150px]" />
      </div>

      {/* ── Content ── */}
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="relative z-10 flex flex-col items-center px-4 max-w-3xl"
      >
        {/* Tagline */}
        <motion.div
          variants={item}
          className="mb-6 inline-flex items-center gap-2 rounded-full border border-border/50 bg-card/40 px-5 py-1.5 text-sm font-medium text-muted-foreground backdrop-blur-md"
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-purple-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-purple-500" />
          </span>
          {tagline}
        </motion.div>

        {/* Title */}
        <motion.h1
          variants={item}
          className="text-5xl md:text-7xl lg:text-8xl font-black leading-[0.92] tracking-tighter text-foreground"
        >
          {typeof title === "string"
            ? title.split(" ").map((word, i) => (
                <motion.span key={i} className="inline-block" variants={item}>
                  {word}&nbsp;
                </motion.span>
              ))
            : title}
        </motion.h1>

        {/* Description */}
        <motion.p
          variants={item}
          className="mt-6 max-w-xl text-base md:text-lg text-muted-foreground/90 leading-relaxed"
        >
          {description}
        </motion.p>

        {/* CTAs */}
        <motion.div variants={item} className="mt-10 flex items-center gap-4 flex-wrap justify-center">
          <PrimaryButton>{ctaText}</PrimaryButton>
          {secondaryCtaText && (
            <SecondaryButton onClick={onSecondaryCtaClick}>
              {secondaryCtaText}
            </SecondaryButton>
          )}
        </motion.div>
      </motion.div>

      {/* ── Animated Image Marquee ── */}
      <div className="absolute bottom-0 left-0 w-full h-[38%] md:h-[44%] overflow-hidden">
        {/* Gradient edge masks */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-background to-transparent z-10" />
        <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-background to-transparent z-10" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-background to-transparent z-10" />

        <motion.div
          className="flex gap-5 py-4"
          animate={{ x: ["0%", "-33.333%"] }}
          transition={{ ease: "linear", duration: 50, repeat: Infinity }}
        >
          {duplicatedImages.map((src, index) => (
            <div
              key={index}
              className="relative aspect-[3/4] h-44 md:h-60 flex-shrink-0 rounded-2xl overflow-hidden shadow-lg ring-1 ring-white/10"
              style={{
                rotate: `${(index % 4 === 0 ? -3 : index % 4 === 1 ? 4 : index % 4 === 2 ? -1 : 6)}deg`,
              }}
            >
              <img
                src={src}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover"
              />
            </div>
          ))}
        </motion.div>
      </div>

      {/* ── Scroll indicator ── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5 }}
        className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 flex flex-col items-center gap-1.5"
      >
        <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/50">
          Scroll
        </span>
        <motion.div
          className="h-8 w-[1px] bg-gradient-to-b from-muted-foreground/40 to-transparent"
          animate={{ scaleY: [1, 0.3, 1], opacity: [0.4, 0.1, 0.4] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        />
      </motion.div>
    </section>
  );
};
