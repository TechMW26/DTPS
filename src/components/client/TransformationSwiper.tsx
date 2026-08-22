'use client';

import { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Sparkles, Clock, TrendingDown, ArrowRight, Star, ImageOff } from 'lucide-react';

interface Transformation {
  _id: string;
  uuid: string;
  title: string;
  description?: string;
  beforeImage: string;
  afterImage: string;
  clientName?: string;
  durationWeeks?: number;
  weightLoss?: number;
}

export default function TransformationSwiper() {
  const [transformations, setTransformations] = useState<Transformation[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchTransformations();
  }, []);

  const fetchTransformations = async () => {
    try {
      const response = await fetch('/api/client/transformations');
      if (response.ok) {
        const data = await response.json();
        setTransformations(data.transformations || []);
      }
    } catch (error) {
      console.error('Error fetching transformations:', error);
    } finally {
      setLoading(false);
    }
  };

  const scrollToIndex = (index: number) => {
    const container = containerRef.current;
    if (!container) return;

    const cards = Array.from(container.querySelectorAll<HTMLElement>('[data-transformation-card]'));
    const card = cards[index];
    if (!card) return;

    const left = card.getBoundingClientRect().left - container.getBoundingClientRect().left + container.scrollLeft;

    container.scrollTo({
      left,
      behavior: 'smooth',
    });
    setActiveIndex(index);
  };

  const handleScroll = () => {
    const container = containerRef.current;
    if (!container) return;

    const containerLeft = container.getBoundingClientRect().left;
    const cards = Array.from(container.querySelectorAll<HTMLElement>('[data-transformation-card]'));
    if (cards.length === 0) return;

    const newIndex = cards.reduce((closestIndex, card, index) => {
      const cardLeft = card.getBoundingClientRect().left - containerLeft + container.scrollLeft;
      const closestCard = cards[closestIndex];
      const closestLeft = closestCard.getBoundingClientRect().left - containerLeft + container.scrollLeft;

      return Math.abs(cardLeft - container.scrollLeft) < Math.abs(closestLeft - container.scrollLeft) ? index : closestIndex;
    }, 0);

    setActiveIndex(newIndex);
  };

  const handleImageError = (id: string, type: 'before' | 'after') => {
    setImageErrors(prev => new Set(prev).add(`${id}-${type}`));
  };

  const getImageUrl = (url: string) => {
    if (!url || url === 'undefined' || url === 'null') return '';
    return url;
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <div className="h-5 w-32 bg-gray-200 rounded animate-pulse" />
        </div>
        <div className="flex gap-4 overflow-hidden">
          {[1, 2].map((i) => (
            <div key={i} className="w-80 h-64 bg-gray-100 rounded-xl animate-pulse shrink-0" />
          ))}
        </div>
      </div>
    );
  }

  if (transformations.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between bg-linear-to-r from-[#3AB1A0]/10 to-transparent rounded-xl p-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-linear-to-br from-[#3AB1A0] to-[#2D8A7C] rounded-xl shadow-lg">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">Success Stories</h2>
            <p className="text-xs text-gray-500">Real transformations, real results</p>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => scrollToIndex(Math.max(0, activeIndex - 1))}
            disabled={activeIndex === 0}
            className="p-2 rounded-xl bg-white shadow-sm hover:shadow-md hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all border border-gray-100"
          >
            <ChevronLeft className="h-5 w-5 text-gray-600" />
          </button>
          <button
            onClick={() => scrollToIndex(Math.min(transformations.length - 1, activeIndex + 1))}
            disabled={activeIndex >= transformations.length - 1}
            className="p-2 rounded-xl bg-white shadow-sm hover:shadow-md hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all border border-gray-100"
          >
            <ChevronRight className="h-5 w-5 text-gray-600" />
          </button>
        </div>
      </div>

      {/* Swiper Container */}
      <div ref={containerRef} onScroll={handleScroll} className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-3 pr-4 scrollbar-hide">
        {transformations.map((transformation) => (
          <div
            key={transformation._id}
            data-transformation-card
            className="w-[calc(100%_-_1rem)] shrink-0 snap-start overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-lg transition-all duration-300 hover:-translate-y-1 hover:shadow-xl sm:w-[380px]"
          >
            {/* Before/After Images */}
            <div className="relative">
              <div className="flex h-72 sm:h-80">
                {/* Before Image */}
                <div className="w-1/2 relative bg-linear-to-br from-gray-100 to-gray-200 overflow-hidden">
                  {getImageUrl(transformation.beforeImage) && !imageErrors.has(`${transformation._id}-before`) ? (
                    <img
                      src={getImageUrl(transformation.beforeImage)}
                      alt="Before transformation"
                      className="w-full h-full object-cover transition-transform duration-500 hover:scale-110"
                      loading="lazy"
                      onError={() => handleImageError(transformation._id, 'before')}
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-linear-to-br from-gray-100 to-gray-200">
                      <ImageOff className="h-8 w-8 text-gray-300 mb-1" />
                      <span className="text-gray-400 text-xs">No image</span>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-linear-to-t from-black/50 to-transparent" />
                  <span className="absolute bottom-2 left-2 bg-gray-900/80 backdrop-blur-sm text-white text-xs font-medium px-2.5 py-1 rounded-full">
                    Before
                  </span>
                </div>

                {/* Center Arrow */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
                  <div className="w-10 h-10 rounded-full bg-white shadow-xl flex items-center justify-center border-2 border-[#3AB1A0]">
                    <ArrowRight className="h-5 w-5 text-[#3AB1A0]" />
                  </div>
                </div>

                {/* After Image */}
                <div className="w-1/2 relative bg-linear-to-br from-gray-100 to-gray-200 overflow-hidden">
                  {getImageUrl(transformation.afterImage) && !imageErrors.has(`${transformation._id}-after`) ? (
                    <img
                      src={getImageUrl(transformation.afterImage)}
                      alt="After transformation"
                      className="w-full h-full object-cover transition-transform duration-500 hover:scale-110"
                      loading="lazy"
                      onError={() => handleImageError(transformation._id, 'after')}
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-linear-to-br from-gray-100 to-gray-200">
                      <ImageOff className="h-8 w-8 text-gray-300 mb-1" />
                      <span className="text-gray-400 text-xs">No image</span>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-linear-to-t from-black/50 to-transparent" />
                  <span className="absolute bottom-2 right-2 bg-linear-to-r from-[#3AB1A0] to-[#2D8A7C] text-white text-xs font-medium px-2.5 py-1 rounded-full shadow-md">
                    After
                  </span>
                </div>
              </div>

              {/* Success Badge */}
              <div className="absolute top-2 right-2 bg-yellow-400/90 backdrop-blur-sm text-yellow-900 text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1 shadow-md">
                <Star className="h-3 w-3 fill-yellow-900" />
                Success
              </div>
            </div>

            {/* Content */}
            <div className="p-4 space-y-3">
              <div>
                <h3 className="font-bold text-gray-900 text-base line-clamp-1">
                  {transformation.title}
                </h3>
                {transformation.clientName && (
                  <p className="text-sm text-gray-500 mt-0.5">{transformation.clientName}</p>
                )}
              </div>

              {/* Stats Row */}
              <div className="flex items-center gap-4 pt-2 border-t border-gray-100">
                {transformation.durationWeeks && (
                  <div className="flex items-center gap-1.5 text-sm text-gray-600">
                    <div className="p-1.5 bg-gray-100 rounded-lg">
                      <Clock className="h-4 w-4" />
                    </div>
                    <span className="font-medium">{transformation.durationWeeks} weeks</span>
                  </div>
                )}
                {transformation.weightLoss && (
                  <div className="flex items-center gap-1.5 text-sm text-[#3AB1A0] font-semibold">
                    <div className="p-1.5 bg-[#3AB1A0]/10 rounded-lg">
                      <TrendingDown className="h-4 w-4" />
                    </div>
                    <span>-{transformation.weightLoss} kg</span>
                  </div>
                )}
              </div>

              {/* Description */}
              {transformation.description && (
                <p className="text-xs text-gray-500 line-clamp-2 italic">
                  &ldquo;{transformation.description}&rdquo;
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Dots Indicator */}
      {transformations.length > 1 && (
        <div className="flex justify-center gap-2">
          {transformations.map((_, index) => (
            <button
              key={index}
              onClick={() => scrollToIndex(index)}
              className={`transition-all duration-300 rounded-full ${
                index === activeIndex
                  ? 'w-6 h-2 bg-linear-to-r from-[#3AB1A0] to-[#2D8A7C]'
                  : 'w-2 h-2 bg-gray-300 hover:bg-gray-400'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
