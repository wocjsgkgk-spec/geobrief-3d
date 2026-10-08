import { createClient, SupabaseClient } from '@supabase/supabase-js';

// 프로젝트 클라우드 데이터 구조
export interface CloudProject {
  id: string;
  title: string;
  region?: string;
  site_geojson?: any;
  report_meta?: any;
  created_at?: string;
  updated_at?: string;
}

// 1인 전용 단독 사용 환경을 위한 Supabase DDL SQL 가이드
export const SUPABASE_PROJECTS_TABLE_SQL = `
-- GeoBrief 3D 프로젝트 테이블 (1인 실무 단독 사용 환경)
create table if not exists public.projects (
  id text primary key,
  title text not null,
  region text,
  site_geojson jsonb,
  report_meta jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

-- RLS 활성화 및 익명(anon) 접근 허용 정책 (1인 단독 실무 사용용)
alter table public.projects enable row level security;
create policy "Allow all operations for anon" on public.projects
  for all
  to anon
  using (true)
  with check (true);
`.trim();

const LOCAL_STORAGE_KEY = 'geobrief_local_cloud_projects';

// 환경 변수 추출 (앞뒤 따옴표 및 공백 정리)
const getSupabaseConfig = () => {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '')
    .replace(/['"`]/g, '')
    .trim();
  const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '')
    .replace(/['"`]/g, '')
    .trim();

  const isConfigured = Boolean(
    url &&
    anonKey &&
    url.startsWith('https://') &&
    url.includes('.supabase.co')
  );

  return { url, anonKey, isConfigured };
};

// Supabase 클라이언트 싱글톤 인스턴스 (SSR 안전 처리)
let supabaseInstance: SupabaseClient | null = null;

export const getSupabase = (): SupabaseClient | null => {
  if (supabaseInstance) return supabaseInstance;

  const { url, anonKey, isConfigured } = getSupabaseConfig();
  if (!isConfigured) return null;

  try {
    supabaseInstance = createClient(url, anonKey, {
      auth: {
        persistSession: false, // 1인 단독 사용 환경으로 세션 지속 불필요
        autoRefreshToken: false,
      },
    });
    return supabaseInstance;
  } catch (error) {
    console.warn('[Supabase] Failed to initialize Supabase client:', error);
    return null;
  }
};

/**
 * Supabase 환경 변수 설정 여부 확인
 */
export const isSupabaseConfigured = (): boolean => {
  return getSupabaseConfig().isConfigured;
};

// ============================================================================
// 로컬 스토리지 폴백 헬퍼 (Supabase 미연동 시 자동 폴백)
// ============================================================================
const getLocalProjects = (): CloudProject[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const saveLocalProjects = (projects: CloudProject[]) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(projects));
  } catch (e) {
    console.warn('[LocalStorage] Failed to save projects:', e);
  }
};

// ============================================================================
// 프로젝트 저장 (Supabase 클라우드 우선, 실패 시 LocalStorage 폴백)
// ============================================================================
export const saveProjectToCloud = async (
  project: Omit<CloudProject, 'created_at' | 'updated_at'>
): Promise<{ success: boolean; isCloud: boolean; message: string; project: CloudProject }> => {
  const supabase = getSupabase();
  const now = new Date().toISOString();

  // 1. Supabase 클라우드 저장 시도
  if (supabase) {
    try {
      const payload = {
        ...project,
        updated_at: now,
      };

      const { data, error } = await supabase
        .from('projects')
        .upsert(payload, { onConflict: 'id' })
        .select()
        .single();

      if (!error && data) {
        // 로컬 캐시도 동기화
        const localList = getLocalProjects().filter((p) => p.id !== project.id);
        saveLocalProjects([data as CloudProject, ...localList]);

        return {
          success: true,
          isCloud: true,
          message: 'Supabase 클라우드에 안전하게 저장되었습니다.',
          project: data as CloudProject,
        };
      }
      console.warn('[Supabase] Cloud save error, falling back to LocalStorage:', error);
    } catch (err) {
      console.warn('[Supabase] Network exception, falling back to LocalStorage:', err);
    }
  }

  // 2. 로컬 스토리지 폴백 저장
  const existingList = getLocalProjects();
  const existing = existingList.find((p) => p.id === project.id);
  const fallbackProject: CloudProject = {
    ...project,
    created_at: existing?.created_at || now,
    updated_at: now,
  };

  const updatedList = [
    fallbackProject,
    ...existingList.filter((p) => p.id !== project.id),
  ];
  saveLocalProjects(updatedList);

  return {
    success: true,
    isCloud: false,
    message: isSupabaseConfigured()
      ? '클라우드 통신 실패로 브라우저 로컬 스토리지에 안전하게 보관되었습니다.'
      : '브라우저 로컬 스토리지에 안전하게 보관되었습니다. (Supabase 미연동)',
    project: fallbackProject,
  };
};

// ============================================================================
// 프로젝트 목록 불러오기 (Supabase 우선, 실패 시 LocalStorage 폴백)
// ============================================================================
export const loadProjectsFromCloud = async (): Promise<{
  success: boolean;
  isCloud: boolean;
  projects: CloudProject[];
}> => {
  const supabase = getSupabase();

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('updated_at', { ascending: false });

      if (!error && data) {
        // 로컬 캐시 갱신
        saveLocalProjects(data as CloudProject[]);
        return {
          success: true,
          isCloud: true,
          projects: data as CloudProject[],
        };
      }
      console.warn('[Supabase] Failed to fetch cloud projects, using local cache:', error);
    } catch (err) {
      console.warn('[Supabase] Cloud fetch exception, using local cache:', err);
    }
  }

  // 로컬 폴백
  return {
    success: true,
    isCloud: false,
    projects: getLocalProjects(),
  };
};

// ============================================================================
// 프로젝트 삭제 (Supabase 및 LocalStorage 동기화)
// ============================================================================
export const deleteProjectFromCloud = async (
  id: string
): Promise<{ success: boolean; isCloud: boolean }> => {
  const supabase = getSupabase();
  let cloudDeleted = false;

  if (supabase) {
    try {
      const { error } = await supabase.from('projects').delete().eq('id', id);
      if (!error) cloudDeleted = true;
    } catch (err) {
      console.warn('[Supabase] Delete failed on cloud:', err);
    }
  }

  // 로컬에서도 삭제
  const remaining = getLocalProjects().filter((p) => p.id !== id);
  saveLocalProjects(remaining);

  return {
    success: true,
    isCloud: cloudDeleted,
  };
};
