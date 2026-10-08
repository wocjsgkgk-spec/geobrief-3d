'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Search, MapPin, Loader2, X, Navigation } from 'lucide-react';
import { useMapStore } from '@/store/useMapStore';
import { SearchResultItem } from '@/types/map';

export const AddressSearch: React.FC = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const { flyToLocation, updateMetadata } = useMapStore();

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

  // 300ms 디바운스 검색
  useEffect(() => {
    if (!query.trim() || query.trim().length < 2) {
      setResults([]);
      setIsLoading(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsLoading(true);
      try {
        // OSM Nominatim Geocoding API (대한민국 한정 검색)
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          query.trim()
        )}&countrycodes=kr&limit=6&addressdetails=1`;
        
        const res = await fetch(url, {
          headers: {
            'Accept-Language': 'ko,en',
          },
        });
        if (res.ok) {
          const data: SearchResultItem[] = await res.json();
          setResults(data);
          setIsOpen(true);
        }
      } catch (err) {
        console.error('Geocoding search failed:', err);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  const handleSelect = (item: SearchResultItem) => {
    const lat = parseFloat(item.lat);
    const lng = parseFloat(item.lon);

    if (!isNaN(lat) && !isNaN(lng)) {
      flyToLocation({
        longitude: lng,
        latitude: lat,
        zoom: 16,
        pitch: 55,
        bearing: 20,
      });

      // 보고서 부제에도 검색된 위치명 반영
      const shortTitle = item.display_name.split(',')[0] || item.display_name;
      updateMetadata({
        subtitle: `${shortTitle} 일원 공간 분석 및 지형 브리핑`,
      });

      setQuery(shortTitle);
      setIsOpen(false);
    }
  };

  const handleClear = () => {
    setQuery('');
    setResults([]);
    setIsOpen(false);
  };

  return (
    <div ref={wrapperRef} className="relative w-full select-none">
      {/* Search Input Box */}
      <div className="relative flex items-center">
        <div className="absolute left-3 text-emerald-400 pointer-events-none">
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
          ) : (
            <Search className="w-4 h-4 text-emerald-400" />
          )}
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (results.length > 0) setIsOpen(true);
          }}
          placeholder="도로명, 지번, 시·군·읍·면, 랜드마크 검색..."
          className="w-full bg-[#18221b] border border-[#2b3a2f] focus:border-emerald-500 rounded-lg pl-9 pr-8 py-2 text-xs text-slate-100 placeholder-slate-400 focus:outline-none transition-all shadow-inner"
        />
        {query && (
          <button
            onClick={handleClear}
            className="absolute right-2.5 text-slate-400 hover:text-slate-200 p-0.5"
            title="검색어 지우기"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Auto-complete Dropdown */}
      {isOpen && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-[#121914] border border-[#2c3d31] rounded-lg shadow-2xl overflow-hidden z-50 max-h-64 overflow-y-auto">
          <div className="px-3 py-1.5 bg-[#17221b] border-b border-[#243328] text-[10px] text-slate-400 font-semibold flex justify-between">
            <span>검색 결과 ({results.length}건)</span>
            <span className="text-emerald-400">클릭 시 3D 카메라 이동</span>
          </div>
          <div className="divide-y divide-[#1e2a22]">
            {results.map((item) => (
              <button
                key={item.place_id}
                onClick={() => handleSelect(item)}
                className="w-full text-left px-3 py-2 hover:bg-[#1a281f] flex items-start space-x-2 transition-colors group"
              >
                <MapPin className="w-3.5 h-3.5 text-emerald-400 mt-0.5 flex-shrink-0 group-hover:scale-110 transition-transform" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-slate-200 truncate group-hover:text-emerald-300">
                    {item.display_name.split(',')[0]}
                  </div>
                  <div className="text-[10px] text-slate-400 truncate mt-0.5">
                    {item.display_name}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {isOpen && query.trim().length >= 2 && results.length === 0 && !isLoading && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-[#121914] border border-[#2c3d31] rounded-lg p-3 text-center text-xs text-slate-400 z-50">
          검색 결과가 없습니다. (예: 춘천역, 양구 해안면, 설악산)
        </div>
      )}
    </div>
  );
};
