'use client';

import React, { useState, useEffect } from 'react';
import {
  FolderOpen,
  Save,
  Trash2,
  X,
  Cloud,
  HardDrive,
  Copy,
  Check,
  Calendar,
  Layers,
  Sparkles,
  Database,
  ExternalLink,
} from 'lucide-react';
import {
  saveProjectToCloud,
  loadProjectsFromCloud,
  deleteProjectFromCloud,
  isSupabaseConfigured,
  SUPABASE_PROJECTS_TABLE_SQL,
  CloudProject,
} from '@/lib/supabase';
import { useMapStore } from '@/store/useMapStore';

interface ProjectManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ProjectManagerModal: React.FC<ProjectManagerModalProps> = ({
  isOpen,
  onClose,
}) => {
  const {
    metadata,
    completedPolygon,
    polygonCenter,
    polygonArea,
    selectedRegionId,
    selectedIdleSiteId,
    bookmarks,
    buildingMassPreset,
    showBuildingMass3D,
    showFlightCeiling3D,
    viewport,
    loadSavedProject,
  } = useMapStore();

  const [activeTab, setActiveTab] = useState<'list' | 'save' | 'supabase'>('list');
  const [projectTitleInput, setProjectTitleInput] = useState('');
  const [projectsList, setProjectsList] = useState<CloudProject[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'warning' | 'error';
    text: string;
  } | null>(null);

  const isCloudActive = isSupabaseConfigured();

  // 모달 열릴 때 프로젝트 목록 로드 및 기본 제목 설정
  useEffect(() => {
    if (isOpen) {
      setProjectTitleInput(metadata.title || '새 공간 분석 프로젝트');
      setStatusMessage(null);
      fetchProjects();
    }
  }, [isOpen, metadata.title]);

  const fetchProjects = async () => {
    setIsLoading(true);
    try {
      const res = await loadProjectsFromCloud();
      setProjectsList(res.projects);
    } catch (err) {
      console.warn('[ProjectManager] Fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveCurrentProject = async () => {
    const trimmedTitle = projectTitleInput.trim();
    if (!trimmedTitle) {
      alert('프로젝트 제목을 입력해주세요.');
      return;
    }

    setIsSaving(true);
    setStatusMessage(null);

    const projectId = `proj_${Date.now()}`;
    const newProject: Omit<CloudProject, 'created_at' | 'updated_at'> = {
      id: projectId,
      title: trimmedTitle,
      region: selectedRegionId,
      site_geojson: completedPolygon,
      report_meta: {
        metadata: {
          ...metadata,
          title: trimmedTitle,
        },
        polygonCenter,
        polygonArea,
        selectedIdleSiteId,
        bookmarks,
        buildingMassPreset,
        showBuildingMass3D,
        showFlightCeiling3D,
        viewport,
      },
    };

    try {
      const res = await saveProjectToCloud(newProject);
      if (res.success) {
        setStatusMessage({
          type: res.isCloud ? 'success' : 'warning',
          text: res.message,
        });
        await fetchProjects();
        setActiveTab('list');
      } else {
        setStatusMessage({
          type: 'error',
          text: '프로젝트 저장에 실패했습니다.',
        });
      }
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: '저장 처리 중 예외가 발생했습니다.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleLoadProject = (proj: CloudProject) => {
    if (
      window.confirm(
        `'${proj.title}' 프로젝트를 현재 작업 화면으로 불러오시겠습니까?`
      )
    ) {
      loadSavedProject(proj);
      onClose();
    }
  };

  const handleDeleteProject = async (id: string, title: string) => {
    if (!window.confirm(`'${title}' 프로젝트를 삭제하시겠습니까?`)) return;

    try {
      await deleteProjectFromCloud(id);
      setProjectsList((prev) => prev.filter((p) => p.id !== id));
      setStatusMessage({
        type: 'success',
        text: `'${title}' 프로젝트가 삭제되었습니다.`,
      });
    } catch (err) {
      alert('삭제 중 오류가 발생했습니다.');
    }
  };

  const handleCopySql = () => {
    navigator.clipboard.writeText(SUPABASE_PROJECTS_TABLE_SQL);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-2xl bg-[#0f172a] border border-[#334155] rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* 모달 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1e293b] bg-[#111c30]">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-emerald-950/80 border border-emerald-700/60 text-emerald-400">
              <FolderOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-bold text-slate-100">
                  프로젝트 및 북마크 저장소
                </h2>
                {isCloudActive ? (
                  <span className="flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-600/70 text-emerald-300">
                    <Cloud className="w-3 h-3" />
                    Supabase 클라우드 동기화
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-950/80 border border-amber-600/70 text-amber-300">
                    <HardDrive className="w-3 h-3" />
                    로컬 스토리지 모드 (단독 사용)
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                분석 부지, 3D 매스 프리셋, 북마크 시점 및 메타데이터 원클릭 보관/복원
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 탭 네비게이션 */}
        <div className="flex border-b border-[#1e293b] bg-[#0c1322] px-6 pt-2">
          <button
            onClick={() => setActiveTab('list')}
            className={`px-4 py-2 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'list'
                ? 'border-emerald-400 text-emerald-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            저장된 프로젝트 ({projectsList.length})
          </button>
          <button
            onClick={() => setActiveTab('save')}
            className={`px-4 py-2 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'save'
                ? 'border-emerald-400 text-emerald-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Save className="w-3.5 h-3.5" />
            현재 상태 신규 저장
          </button>
          <button
            onClick={() => setActiveTab('supabase')}
            className={`px-4 py-2 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'supabase'
                ? 'border-emerald-400 text-emerald-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            Supabase DB 연동 설정
          </button>
        </div>

        {/* 알림 메시지 배너 */}
        {statusMessage && (
          <div
            className={`px-6 py-2.5 text-xs font-medium border-b flex items-center gap-2 ${
              statusMessage.type === 'success'
                ? 'bg-emerald-950/60 border-emerald-800/80 text-emerald-300'
                : statusMessage.type === 'warning'
                ? 'bg-amber-950/60 border-amber-800/80 text-amber-300'
                : 'bg-rose-950/60 border-rose-800/80 text-rose-300'
            }`}
          >
            <Sparkles className="w-4 h-4 flex-shrink-0" />
            <span>{statusMessage.text}</span>
          </div>
        )}

        {/* 모달 본문 */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* TAB 1: 저장된 프로젝트 목록 */}
          {activeTab === 'list' && (
            <div className="space-y-3">
              {isLoading ? (
                <div className="py-12 flex flex-col items-center justify-center text-slate-400 space-y-2">
                  <div className="w-6 h-6 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-xs">프로젝트 목록을 동기화하는 중...</p>
                </div>
              ) : projectsList.length === 0 ? (
                <div className="py-12 text-center text-slate-400 border border-dashed border-slate-700 rounded-xl space-y-3">
                  <FolderOpen className="w-10 h-10 mx-auto text-slate-500 opacity-60" />
                  <div>
                    <p className="text-sm font-semibold text-slate-300">
                      저장된 프로젝트가 없습니다.
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      상단의 [현재 상태 신규 저장] 탭에서 현재 부지와 분석 내용을 보관해보세요.
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveTab('save')}
                    className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
                  >
                    현재 작업 저장하기
                  </button>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {projectsList.map((proj) => {
                    const meta = proj.report_meta || {};
                    const pyeong = meta.polygonArea?.pyeong || 0;
                    const bmCount = (meta.bookmarks || []).length;
                    const dateStr = proj.updated_at
                      ? new Date(proj.updated_at).toLocaleString('ko-KR')
                      : '날짜 미상';

                    return (
                      <div
                        key={proj.id}
                        className="flex items-center justify-between p-3.5 rounded-lg bg-[#162032] border border-[#24334a] hover:border-emerald-500/50 transition-all group"
                      >
                        <div className="space-y-1 min-w-0 pr-4">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-slate-100 truncate">
                              {proj.title}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                              {proj.region || '강원권'}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-[11px] text-slate-400">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {dateStr}
                            </span>
                            {pyeong > 0 && (
                              <span className="text-emerald-400 font-medium">
                                부지 {pyeong.toLocaleString()}평
                              </span>
                            )}
                            {bmCount > 0 && (
                              <span className="text-blue-400">
                                북마크 {bmCount}개
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button
                            onClick={() => handleLoadProject(proj)}
                            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow transition-all"
                          >
                            불러오기
                          </button>
                          <button
                            onClick={() => handleDeleteProject(proj.id, proj.title)}
                            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 rounded-lg transition-colors"
                            title="삭제"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: 현재 상태 신규 저장 */}
          {activeTab === 'save' && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-[#141d2e] border border-[#24334a] space-y-3">
                <label className="block text-xs font-semibold text-slate-300">
                  프로젝트 명칭
                </label>
                <input
                  type="text"
                  value={projectTitleInput}
                  onChange={(e) => setProjectTitleInput(e.target.value)}
                  placeholder="예: 원주 캠프롱 반환부지 3D 공간 기획안"
                  className="w-full px-3.5 py-2.5 rounded-lg bg-[#0b111a] border border-[#334155] text-slate-100 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                />

                <div className="grid grid-cols-2 gap-2 pt-1 text-xs text-slate-400">
                  <div className="p-2.5 rounded bg-[#0b111a] border border-slate-800">
                    <span className="text-slate-500 block text-[10px]">대상 지역</span>
                    <span className="font-semibold text-slate-200">{selectedRegionId || '원주'}</span>
                  </div>
                  <div className="p-2.5 rounded bg-[#0b111a] border border-slate-800">
                    <span className="text-slate-500 block text-[10px]">지정 부지 면적</span>
                    <span className="font-semibold text-emerald-400">
                      {polygonArea ? `${polygonArea.pyeong.toLocaleString()}평 (${polygonArea.sqm.toLocaleString()}㎡)` : '미지정'}
                    </span>
                  </div>
                  <div className="p-2.5 rounded bg-[#0b111a] border border-slate-800">
                    <span className="text-slate-500 block text-[10px]">시점 북마크</span>
                    <span className="font-semibold text-blue-300">{bookmarks.length}개 보관</span>
                  </div>
                  <div className="p-2.5 rounded bg-[#0b111a] border border-slate-800">
                    <span className="text-slate-500 block text-[10px]">저장 대상지</span>
                    <span className="font-semibold text-amber-300">
                      {isCloudActive ? 'Supabase 클라우드' : '브라우저 로컬 스토리지'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setActiveTab('list')}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={handleSaveCurrentProject}
                  disabled={isSaving}
                  className="px-5 py-2 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow flex items-center gap-1.5 transition-all disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  {isSaving ? '저장 처리 중...' : '프로젝트 저장 확정'}
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: Supabase 연동 설정 및 SQL 안내 */}
          {activeTab === 'supabase' && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-[#141d2e] border border-[#24334a] space-y-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-200 flex items-center gap-2">
                    <Database className="w-4 h-4 text-emerald-400" />
                    Supabase 1인 전용 단독 사용 연동 안내
                  </h3>
                  <a
                    href="https://supabase.com/dashboard"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-emerald-400 hover:underline flex items-center gap-1"
                  >
                    Supabase 콘솔
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  GeoBrief 3D는 1인 실무 사용 환경을 위해 번거로운 회원가입 절차 없이,
                  Supabase의 <strong>익명(anon) 키</strong>를 통해 프로젝트를 클라우드에 영구 보관할 수 있습니다.
                  아직 환경 변수를 등록하지 않으셨더라도 <strong>브라우저 LocalStorage에 100% 정상 자동 보관</strong>됩니다.
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300">
                    테이블 생성 SQL (Supabase SQL Editor에 복사하여 실행)
                  </span>
                  <button
                    onClick={handleCopySql}
                    className="px-2.5 py-1 text-[11px] font-semibold rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-1 transition-colors"
                  >
                    {copiedSql ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400" />
                        복사됨!
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        SQL 복사
                      </>
                    )}
                  </button>
                </div>
                <pre className="p-3 bg-[#090e17] border border-slate-800 rounded-lg text-[11px] text-emerald-300 font-mono overflow-x-auto leading-relaxed">
                  {SUPABASE_PROJECTS_TABLE_SQL}
                </pre>
              </div>

              <div className="p-3.5 rounded-lg bg-[#0b111a] border border-slate-800 text-xs text-slate-400 space-y-1">
                <span className="font-semibold text-slate-300 block">
                  필요한 환경 변수 (.env.local 또는 Vercel 대시보드):
                </span>
                <p className="font-mono text-[11px] text-blue-300">
                  NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
                </p>
                <p className="font-mono text-[11px] text-blue-300">
                  NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
