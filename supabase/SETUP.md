# Supabase 설정 순서

프로젝트: `tbgsphpxayapylmatfvw` (https://tbgsphpxayapylmatfvw.supabase.co)

아래를 위에서부터 한 번씩 실행하면 됩니다. 1~2번은 SQL Editor, 3~4번은 대시보드 화면입니다.

## 1. 스키마 실행

Supabase 대시보드 → **SQL Editor** → New query → [`schema.sql`](schema.sql) 전체를 붙여넣고 Run.

테이블 네 개(`records`, `record_contacts`, `confirms`, `admins`), 뷰 하나(`records_public`), 접근 정책, 권한이 만들어집니다.

## 2. 이미지 저장소 실행

같은 SQL Editor에서 [`storage.sql`](storage.sql) 전체를 붙여넣고 Run. `record-images` 버킷과 업로드 정책이 생깁니다.

## 3. 로그인 설정

**Authentication → Sign In / Providers → Email**

- Email provider **활성화**
- **Confirm email 켜기** — 반드시 켜 두셔야 합니다. 이게 꺼져 있으면 아무 주소나 `@korea.ac.kr`로 적어 넣고 가입할 수 있고, 쓰기 권한 제한이 무의미해집니다. 메일함을 실제로 열 수 있어야만 통과하게 만드는 장치입니다.

**Authentication → URL Configuration**

- Site URL: `https://eunhakim-kumc.github.io/negative-data-archive/`
- Redirect URLs에 같은 주소 추가 (로컬 테스트용으로 `http://localhost:8080/`도 함께)

## 4. 운영자 등록

교수님이 한 번 로그인하신 뒤, SQL Editor에서 실행합니다.

```sql
insert into public.admins (user_id, note)
select id, 'PI' from auth.users where email = 'eunha_kim@korea.ac.kr'
on conflict (user_id) do nothing;
```

운영자는 모든 기록을 수정·삭제하고, 부적절한 기록을 `published = false`로 내릴 수 있습니다. 내려도 제출자의 작성 내용은 지워지지 않습니다.

## 접근 규칙 요약

| 대상 | 열람 | 등록 | 수정·삭제 |
|---|---|---|---|
| 로그인 안 한 방문자 | 공개된 기록 | 불가 | 불가 |
| 로그인했으나 타 도메인 | 공개된 기록 | **불가** | 불가 |
| `@korea.ac.kr` 구성원 | 공개된 기록 + 연락처 | 가능 | 본인 것만 |
| 운영자 | 전부 (비공개 포함) | 가능 | 전부 |

규칙은 데이터베이스가 직접 강제합니다. 브라우저에서 API를 직접 호출해도 우회되지 않습니다.

## 도메인 추가

다른 도메인(예: 부속병원 메일)도 허용하려면 `is_ku_member()`를 고칩니다.

```sql
create or replace function public.is_ku_member()
returns boolean language sql stable
set search_path = public, pg_catalog
as $$
  select coalesce(auth.jwt() ->> 'email', '') ilike '%@korea.ac.kr'
      or coalesce(auth.jwt() ->> 'email', '') ilike '%@kumc.or.kr';
$$;
```

## 검증 상태

두 SQL 파일은 Postgres 파서(libpg_query 기준)로 문법 검증을 마쳤습니다. 다만 `auth.*`, `storage.*` 객체는 Supabase가 관리하는 것이라 로컬에서 실제 실행은 못 했습니다. SQL Editor에서 오류가 나면 메시지를 그대로 알려 주시면 바로 고치겠습니다.

## 키 취급

- **anon public key** — 웹페이지 코드에 들어가는 값입니다. 공개돼도 안전하며, RLS가 실제 접근을 통제합니다.
- **service_role key** — RLS를 전부 무시하는 마스터 키입니다. 저장소에 커밋하지 말고, 저에게도 주지 마세요. 필요 없습니다.
