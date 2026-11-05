"use client";

import React, { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { X, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

export interface LightboxFigure {
  id?: string;
  url: string;
  thumbUrl?: string;
  bookTitle?: string;
  chapterNumber?: number | string;
  chapterTitle?: string;
  pageNumber?: number | string;
  caption?: string;
}

export interface LightboxProps {
  figure?: LightboxFigure | string | null;
  figures?: LightboxFigure[] | null;
  initialIndex?: number;
  onClose: () => void;
  alt?: string;
  caption?: string;
}

export function Lightbox({
  figure,
  figures,
  initialIndex = 0,
  onClose,
  alt = "Textbook figure enlarged",
  caption,
}: LightboxProps) {
  const [mounted, setMounted] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Normalize input into an array of figures
  const figuresList: LightboxFigure[] = React.useMemo(() => {
    if (figures && figures.length > 0) return figures;
    if (figure) {
      if (typeof figure === "string") {
        return [{ url: figure, caption }];
      }
      return [{ ...figure, caption: figure.caption || caption }];
    }
    return [];
  }, [figure, figures, caption]);

  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  useEffect(() => {
    setCurrentIndex(initialIndex);
  }, [initialIndex, figures]);

  const hasMultiple = figuresList.length > 1;
  const current = figuresList[currentIndex] || figuresList[0];

  useEffect(() => {
    setImgLoaded(false);
  }, [current?.url]);

  const handlePrev = useCallback(() => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : figuresList.length - 1));
  }, [figuresList.length]);

  const handleNext = useCallback(() => {
    setCurrentIndex((prev) => (prev < figuresList.length - 1 ? prev + 1 : 0));
  }, [figuresList.length]);

  // Keyboard controls: Escape to close, ArrowLeft / ArrowRight to navigate
  useEffect(() => {
    if (figuresList.length === 0) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowLeft" && hasMultiple) {
        handlePrev();
      } else if (e.key === "ArrowRight" && hasMultiple) {
        handleNext();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [figuresList.length, hasMultiple, handlePrev, handleNext, onClose]);

  if (!mounted || typeof document === "undefined") return null;
  if (figuresList.length === 0 || !current) return null;

  // Format caption: "Book · Ch X · p. Y"
  const captionParts: string[] = [];
  if (current.bookTitle) captionParts.push(current.bookTitle);
  if (current.chapterNumber !== undefined && current.chapterNumber !== null && current.chapterNumber !== "") {
    captionParts.push(`Ch ${current.chapterNumber}`);
  }
  if (current.pageNumber) captionParts.push(`p. ${current.pageNumber}`);
  const displayCaption =
    captionParts.length > 0 ? captionParts.join(" · ") : current.caption || caption || "Textbook Figure";

  // Derive thumbnail URL if not explicitly provided
  const thumbUrl = current.thumbUrl || current.url.replace(/\.png$/, "_thumb.webp");

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 animate-fadeIn"
      onClick={onClose}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 99999,
      }}
    >
      {/* 
        White rounded-2xl card with 16px padding (p-4).
        Explicit size: width min(90vw, 1100px); height min(85vh, 800px)
        Centered in full viewport.
      */}
      <div
        className="relative bg-white rounded-2xl p-4 shadow-2xl flex flex-col items-center justify-between animate-scaleIn select-none max-w-full"
        style={{
          width: "min(90vw, 1100px)",
          height: "min(85vh, 800px)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button: sits INSIDE the card's top-right corner */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-40 w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 flex items-center justify-center transition-colors cursor-pointer border border-slate-200/80 focus:outline-none shadow-xs"
          aria-label="Close lightbox"
        >
          <X className="w-5 h-5 stroke-[2.2]" />
        </button>

        {/* Previous Button (if multiple figures) */}
        {hasMultiple && (
          <button
            onClick={handlePrev}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-30 w-10 h-10 rounded-full bg-white/95 hover:bg-white text-slate-800 shadow-md border border-slate-200 flex items-center justify-center transition-transform hover:scale-105 active:scale-95 cursor-pointer focus:outline-none"
            aria-label="Previous figure"
          >
            <ChevronLeft className="w-6 h-6 stroke-[2.5]" />
          </button>
        )}

        {/* Next Button (if multiple figures) */}
        {hasMultiple && (
          <button
            onClick={handleNext}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-30 w-10 h-10 rounded-full bg-white/95 hover:bg-white text-slate-800 shadow-md border border-slate-200 flex items-center justify-center transition-transform hover:scale-105 active:scale-95 cursor-pointer focus:outline-none"
            aria-label="Next figure"
          >
            <ChevronRight className="w-6 h-6 stroke-[2.5]" />
          </button>
        )}

        {/* Image Container with blurred thumbnail pop-in shield and spinner */}
        <div className="relative w-full flex-1 min-h-0 flex items-center justify-center overflow-hidden my-1 bg-slate-50/50 rounded-xl">
          {/* Blurred thumbnail underneath while full image is loading */}
          {thumbUrl && !imgLoaded && (
            <img
              src={thumbUrl}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 w-full h-full object-contain filter blur-md opacity-60 scale-95 transition-opacity duration-300"
            />
          )}

          {/* Spinner when loading */}
          {!imgLoaded && (
            <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
              <Loader2 className="w-8 h-8 text-[#1E4FF7] animate-spin" />
            </div>
          )}

          {/* Full High-Resolution Image */}
          <img
            src={current.url}
            alt={alt}
            onLoad={() => setImgLoaded(true)}
            className={`w-full h-full object-contain block transition-opacity duration-200 z-20 ${
              imgLoaded ? "opacity-100" : "opacity-0"
            }`}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
            }}
          />
        </div>

        {/* Bottom Caption Bar: full text, no clipping, truncates only on small screens */}
        <div className="w-full pt-3 mt-1 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600 font-medium px-2 shrink-0 min-w-0">
          <span
            className="truncate max-w-full text-slate-700 font-semibold"
            title={displayCaption}
          >
            {displayCaption}
          </span>
          {hasMultiple && (
            <span className="text-slate-400 font-mono text-[11px] shrink-0 ml-3">
              {currentIndex + 1} of {figuresList.length}
            </span>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
