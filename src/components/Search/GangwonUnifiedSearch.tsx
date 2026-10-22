'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Search, MapPin, Loader2, X, Building, Shield, Compass, ChevronRight } from 'lucide-react';
import { useMapStore } from '@/store/useMapStore';
import { UnifiedSearchResult } from '@/app/api/gangwon-search/route';

interface GangwonUnifiedSearchProps {
  onSelectLocation?: (result: UnifiedSearchResult) => void;
  className?: string;
}

export const GangwonUnifiedSearch: React.FC<GangwonUnifiedSearchProps> = ({
  onSelectLocation,
  className = '',
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UnifiedSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { flyToLocation, selectRegion, updateMetadata } = useMapStore();

  // 바깥 클릭 시 드롭다운 닫기
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 250ms 디바운스 검색
  useEffect(() => {
    if (!query.trim() || query.trim().length < 1) {
      setResults([]);
      setIsLoading(false);
      setSelectedIndex(-1);
      return;
    }

    const timer = setTimeout(async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/gangwon-search?q=${encodeURIComponent(query.trim())}`);
        if (res.ok) {
          const data = await res.json();
          if (data.success && Array.isArray(data.results)) {
            setResults(data.results);
            setIsOpen(true);
            setSelectedIndex(-1);
          }
        }
      } catch (err) {
        console.warn('[GangwonUnifiedSearch] Search fetch failed:', err);
      } finally {
        setIsLoading(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [query]);

  const handleSelect = (item: UnifiedSearchResult) => {
    const [lng, lat] = item.coords;

    if (!isNaN(lat) && !isNaN(lng)) {
      // 1. 카메라 3D 비행 이동
      flyToLocation({
        longitude: lng,
        latitude: lat,
        zoom: item.category === 'region' ? 14 : 17,
        pitch: item.category === 'region' ? 52 : 55,
        bearing: 20,
      });

      // 2. 행정구역 선택 동기화
      if (item.regionId) {
        selectRegion(item.regionId);
      }

      // 3. 브리핑 부제 업데이트
      const shortTitle = item.title.split('(')[0].trim();
      updateMetadata({
        subtitle: `${shortTitle} 일원 연속지적도·용도지역 공간 분석`,
      });

      // 4. 부모 콜백 (필지 하이라이트 및 4대 리포트 트리거)
      if (onSelectLocation) {
        onSelectLocation(item);
      } else {
        // 전역 커스텀 이벤트 발송 (MapViewer에서 자동 수신)
        window.dispatchEvent(
          new CustomEvent('gangwon-search-select', {
            detail: item,
          })
        );
      }

      setQuery(item.title);
      setIsOpen(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || results.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < results.length) {
        handleSelect(results[selectedIndex]);
      } else if (results.length > 0) {
        handleSelect(results[0]);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const handleClear = () => {
    setQuery('');
    setResults([]);
    setIsOpen(false);
    setSelectedIndex(-1);
    if (inputRef.current) inputRef.current.focus();
  };

  // 카테고리별 뱃지 아이콘 및 스타일
  const renderCategoryIcon = (category: string) => {
    switch (category) {
      case 'military_site':
        return <Shield className="w-3.5 h-3.5 text-amber-400" />;
      case 'region':
        return <Compass className="w-3.5 h-3.5 text-emerald-400" />;
      case 'parcel':
        return <Building className="w-3.5 h-3.5 text-cyan-400" />;
      default:
        return <MapPin className="w-3.5 h-3.5 text-blue-400" />;
    }
  };

  return (
    <div ref={wrapperRef} className={`relative select-none ${className}`}>
      {/* Search Input Box */}
      <div className="relative flex items-center">
        <div className="absolute left-2.5 text-emerald-400 pointer-events-none flex items-center justify-center">
          {isLoading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
          ) : (
            <Search className="w-3.5 h-3.5 text-emerald-400" />
          )}
        </div>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (results.length > 0) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder="🔍 강원 전 지역 주소·지번·부지 검색 (예: 1군지사, 단구동 1600, 사내면...)"
          className="w-full bg-[#111913]/90 border border-[#2b3e30] focus:border-emerald-400 rounded-lg pl-8 pr-7 py-1.5 text-xs text-slate-100 placeholder-slate-400 focus:outline-none transition-all shadow-inner focus:ring-1 focus:ring-emerald-500/50"
        />
        {query && (
          <button
            onClick={handleClear}
            className="absolute right-2 text-slate-400 hover:text-slate-100 p-0.5 rounded transition-colors"
            title="검색어 지우기"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Auto-Complete Dropdown */}
      {isOpen && results.length > 0 && (
        <div className="absolute top-10 left-0 w-full sm:w-96 bg-[#0c1410]/95 backdrop-blur-xl border border-[#2a4030] rounded-xl shadow-2xl z-50 overflow-hidden divide-y divide-[#1c2c21] animate-in fade-in zoom-in-95 duration-100 max-h-[70vh] overflow-y-auto">
          <div className="px-3 py-1.5 bg-[#121f17] text-[10px] font-bold text-slate-400 flex items-center justify-between">
            <span className="text-emerald-300">강원 18개 시·군 통합 검색 결과 ({results.length})</span>
            <span className="text-slate-400 font-mono text-[9px]">클릭 시 즉시 3D 이동 및 실측 분석</span>
          </div>

          <div className="py-1">
            {results.map((item, index) => {
              const isSelected = selectedIndex === index;
              return (
                <button
                  key={item.id}
                  onClick={() => handleSelect(item)}
                  className={`w-full px-3 py-2 text-left flex items-start justify-between gap-2 transition-colors ${
                    isSelected
                      ? 'bg-emerald-950/80 text-emerald-200 border-l-2 border-emerald-400'
                      : 'hover:bg-[#16241a] text-slate-200'
                  }`}
                >
                  <div className="flex items-start gap-2 min-w-0">
                    <div className="mt-0.5 flex-shrink-0">{renderCategoryIcon(item.category)}</div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-xs text-white truncate">{item.title}</span>
                        {item.badge && (
                          <span className="text-[9.5px] px-1.5 py-0.2 rounded font-mono font-medium bg-[#1a2d21] text-emerald-300 border border-[#2d4d38]">
                            {item.badge}
                          </span>
                        )}
                      </div>
                      {item.address && (
                        <p className="text-[10px] text-slate-400 truncate mt-0.5">{item.address}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0 text-slate-400 mt-1">
                    <span className="text-[9.5px] font-mono">{item.categoryLabel}</span>
                    <ChevronRight className="w-3 h-3 text-slate-400" />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
