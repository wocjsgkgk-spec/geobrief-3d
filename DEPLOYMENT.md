# GeoBrief 3D - Vercel 프로덕션 배포 및 Supabase 연동 가이드

GeoBrief 3D는 강원특별자치도 및 전국 주요 거점의 공간 의사결정 지원을 위한 3D 지형·건축물 브리핑 플랫폼입니다. Next.js 15 App Router와 MapLibre GL JS, Threebox-MapLibre를 기반으로 구축되었습니다.

---

## 1. 환경 변수 등록 목록 (Vercel Settings > Environment Variables)

| 환경 변수명 | 구분 | 설명 |
| :--- | :---: | :--- |
| `NEXT_PUBLIC_VWORLD_API_KEY` | **필수** | 국토교통부 브이월드(V-World) Data 2.0 건축물/공간정보 API 인증키 |
| `NEXT_PUBLIC_SUPABASE_URL` | **선택** | Supabase 프로젝트 URL (예: `https://xyz.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **선택** | Supabase 익명(anon) 공개 키 |

> **안전한 로컬 폴백 (Graceful Fallback)**:
> - Supabase 환경 변수가 등록되지 않은 상태에서도 프로그램이 중단되지 않고 브라우저 `localStorage`에 프로젝트와 북마크가 100% 정상 저장됩니다.
> - V-World 키가 미등록되어 있더라도 오픈 무료 벡터 타일(`OpenFreeMap`)로 자동 폴백됩니다.

---

## 2. Supabase 1인 전용 데이터베이스 셋업 (1분 완료)

1인 단독 실무 사용 환경에 맞춰 회원가입/로그인 없이 익명(anon) 키로 즉시 사용할 수 있도록 구성되었습니다.

### 테이블 생성 SQL (Supabase SQL Editor에서 실행)
```sql
-- 1. projects 테이블 생성
create table if not exists public.projects (
  id text primary key,
  title text not null,
  region text,
  site_geojson jsonb,
  report_meta jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

-- 2. Row Level Security(RLS) 활성화 및 익명(anon) 전체 접근 허용 정책
alter table public.projects enable row level security;
create policy "Allow all operations for anon" on public.projects
  for all
  to anon
  using (true)
  with check (true);
```

---

## 3. Vercel 배포 단계별 명령어

### 방법 1: Vercel CLI로 즉시 원클릭 배포
```bash
# 1. Vercel CLI 설치 (미설치 시)
npm i -g vercel

# 2. Vercel 로그인
vercel login

# 3. 환경 변수 포함하여 프로덕션 배포
vercel --prod
```

### 방법 2: GitHub 저장소 연동 배포 (CI/CD 자동화)
```bash
# 1. 로컬 변경 사항 커밋
git add .
git commit -m "feat: Add Supabase cloud sync & Vercel production build optimizations"

# 2. 원격 저장소 푸시
git push origin main
```
1. [Vercel 대시보드](https://vercel.com/) 접속 -> **[Add New...]** -> **[Project]**
2. GitHub 저장소 선택 후 **Import**
3. **Environment Variables**에 다음 키 등록:
   - `NEXT_PUBLIC_VWORLD_API_KEY`: *(V-World 인증키)*
   - `NEXT_PUBLIC_SUPABASE_URL`: *(Supabase 프로젝트 URL)*
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: *(Supabase anon 키)*
4. **[Deploy]** 클릭 (약 40초 내 배포 완료)

---

## 4. V-World(브이월드) 인증키 도메인 등록

- GeoBrief 3D는 **Next.js 서버 사이드 프록시(`src/app/api/vworld/buildings/route.ts`)**를 내장하여 브라우저 CORS 문제를 원천 차단했습니다.
- 배포 완료 후 [브이월드 인증키 관리 센터](https://www.vworld.kr)의 발급키 설정에서 사용 도메인에 Vercel 도메인(예: `*.vercel.app` 또는 커스텀 도메인)을 등록해주시면 됩니다.

---

## 5. 로컬 프로덕션 실행 검증
```bash
# 1. 프로덕션 빌드 (0 Error 검증)
npm run build

# 2. 프로덕션 서버 실행 (포트 8080)
npx next start -H 0.0.0.0 -p 8080
```
