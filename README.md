# Negative Data Archive

고려대학교 의과대학 BK21 의과학과 음성 데이터 아카이브.

작동하지 않은 항체, 새는 Cre 라인, 재현되지 않은 프로토콜, 유의한 차이가 없던 결과를 조건과 함께 기록합니다. 논문에 실리지 않지만 다음 사람의 몇 달을 아끼는 기록들입니다.

- **공개 열람** — <https://eunhakim-kumc.github.io/negative-data-archive/> (로그인 불필요, 누구나)
- **기록 제출** — <https://eunhakim-kumc.github.io/negative-data-archive/submit.html> (`@korea.ac.kr` 계정)

## 구조

읽기와 쓰기를 분리했습니다.

```
제출 (Supabase)                동기화 (주 1회)         공개 (GitHub Pages)
  고려대 계정으로 로그인    →   익명 API로 읽어         →   로그인 없이 전 세계 공개
  기록 등록·수정·이미지         정적 파일 생성·푸시         검색 노출, 기록별 인용 링크
```

이렇게 나눈 이유는 세 가지입니다. 공개 사이트는 정적 파일이라 Supabase가 멈춰도 내려가지 않습니다. 열람에 계정이 필요 없으니 교외·해외 연구자에게 링크만 보내면 됩니다. 그리고 주간 동기화가 Supabase를 주기적으로 깨워, 무료 플랜의 "7일 무활동 시 일시정지"를 피합니다.

소속 판정은 **로그인 이메일 도메인**으로 합니다. `@korea.ac.kr` 주소는 학교가 발급하고 떠나면 회수되므로, "고려대 구성원"이라는 범위를 그대로 그려냅니다. 규칙은 데이터베이스가 직접 강제하므로 브라우저에서 API를 직접 호출해도 우회되지 않습니다.

## 디렉터리

| 경로 | 내용 |
|---|---|
| `docs/` | GitHub Pages가 서빙하는 사이트 |
| `docs/index.html` | 공개 열람 페이지 (정적 데이터를 읽음) |
| `docs/submit.html` | 제출 페이지 (Supabase에 직접 연결) |
| `docs/schema.js` | 두 페이지가 공유하는 필드 정의 — 스키마가 어긋나지 않게 한 곳에 둠 |
| `docs/style.css` | 두 페이지가 공유하는 스타일 |
| `docs/supabase.js` | 인증·REST·스토리지 클라이언트 |
| `docs/data/records.json` | 공개 기록 — 동기화로 생성됨, 직접 수정하지 않음 |
| `docs/data/img/` | 첨부 이미지 — 동기화로 생성됨 |
| `supabase/schema.sql` | 테이블, 접근 정책(RLS), 권한 |
| `supabase/storage.sql` | 이미지 버킷과 업로드 정책 |
| `supabase/SETUP.md` | 설정 순서 |
| `sync/build_site.py` | Supabase → 공개 사이트 변환 |
| `제출_안내.md` | 학생 배포용 안내문 |
| `negative-data-archive.html` | **은퇴한 초기 버전** (Claude Artifact). Supabase 전환 후 쓰지 않습니다 |

## 동기화

자동으로 매주 월요일 아침에 돕니다 (Claude 데스크톱 앱의 예약 작업). 수동으로 돌리려면 저장소 루트에서:

```bash
python3 sync/build_site.py
```

`--dry-run`으로 먼저 확인할 수 있습니다. 경고에 나온 기록은 공개에서 제외된 것이니 내용을 확인하세요. 확인 후:

```bash
python3 -m http.server 8080 --directory docs
```

<http://localhost:8080> 에서 보고 커밋·푸시하면 몇 분 안에 공개 사이트에 반영됩니다.

스크립트는 **익명 키만** 씁니다. 공개 방문자가 읽을 수 있는 것 이상을 읽지 못하고, 쓰기도 불가능합니다.

## 공개되는 것과 되지 않는 것

| 항목 | 공개 사이트 | 제출 시스템 |
|---|---|---|
| 기록 내용, 조건, 이미지 | 공개 | 공개 |
| 제출자 **이름·연구실** | **공개** | 공개 |
| 제출자 **연락처 이메일** | **비공개** | 로그인한 구성원만 |
| 비공개 보류(`published = false`) 기록 | 제외 | 운영자·본인만 |

연락처는 `record_contacts` 테이블에 따로 있고, 익명 역할에는 그 테이블 권한 자체가 없습니다. 실수로 새어나갈 경로가 없습니다.

필수 항목(`type`, `outcome`, `title`, `summary`)이 비었거나 값이 알려진 것이 아니면 공개에서 제외되고 경고가 출력됩니다. 제출 시스템에서 삭제하거나 보류한 기록은 다음 동기화 때 공개 사이트에서도 내려갑니다.

## 운영

운영자는 모든 기록을 수정·삭제할 수 있고, 부적절한 기록을 **삭제하지 않고 공개만 보류**할 수 있습니다. 제출자의 작성 내용은 남습니다. 운영자 등록은 `supabase/SETUP.md`를 참고하세요.

계정이 삭제돼도(졸업 등) 기록과 재현 확인은 남습니다. 연결만 끊기고 이름·연구실은 텍스트로 보존됩니다. 이후 수정은 운영자만 할 수 있습니다.

## 기록 유형

| 유형 | 핵심 필드 |
|---|---|
| 항체 | 표적, catalog #, **lot #**, clone, 적용, 희석, 고정, 항원 부활, 양성 대조 |
| 마우스 라인 / Cre | 공식 명명, stock ID, driver, reporter, 유도 조건, recombination 효율, **leaky 발현** |
| 프로토콜 / 시약 | 수기명, 키트·catalog, 원 프로토콜 출처, 실패 단계, 시험 조건 범위, 대안 |
| 실험 결과 (null result) | 가설, 모델, 처치, 측정 지표, **군 구성과 n수**, 통계 검정, 검정 결과, **검정력 한계** |

결과 분류: 작동 안 함 / 조건부 작동 / 재현 실패 / 유의한 차이 없음.

## 데이터 분석

기록은 평범한 PostgreSQL에 있으므로 R에서 직접 붙어 집계할 수 있습니다.

```r
con <- DBI::dbConnect(RPostgres::Postgres(),
                      host = "db.tbgsphpxayapylmatfvw.supabase.co",
                      dbname = "postgres", user = "postgres",
                      password = Sys.getenv("NDA_DB_PASSWORD"))
records <- DBI::dbGetQuery(con, "SELECT * FROM records WHERE type = 'antibody'")
```

비밀번호는 코드에 쓰지 말고 환경변수나 `~/.Renviron`에 두세요.

## 라이선스

기록 내용과 문서는 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.ko), 코드는 MIT입니다. 자세한 내용은 [LICENSE](LICENSE)를 보세요.
