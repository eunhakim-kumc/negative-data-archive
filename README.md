# Negative Data Archive

고려대학교 의과대학 BK21 의과학과 음성 데이터 아카이브.

작동하지 않은 항체, 새는 Cre 라인, 재현되지 않은 프로토콜, 유의한 차이가 없던 결과를 조건과 함께 기록합니다. 논문에 실리지 않지만 다음 사람의 몇 달을 아끼는 기록들입니다.

- **공개 열람** — <https://eunhakim-kumc.github.io/negative-data-archive/> (로그인 불필요)
- **기록 제출** — <https://claude.ai/artifact/MRBaNEzmAPhqo5gggjVMXJ> (BK21 의과학과 구성원)

## 구조

제출과 공개를 분리했습니다.

```
제출 (Claude Artifact)          동기화                공개 (GitHub Pages)
  학생이 폼으로 등록      →   db 덤프 → 변환 → 푸시   →   누구나 열람
  이미지·연락처 포함                                      연락처 제외
```

제출 쪽은 로그인한 구성원만 쓰고 읽습니다. 공개 쪽은 정적 사이트라 로그인이 필요 없고, 검색에 노출되며, 기록마다 고유 링크(`#<record id>`)가 있어 인용할 수 있습니다.

## 디렉터리

| 경로 | 내용 |
|---|---|
| `docs/` | GitHub Pages가 서빙하는 공개 사이트 |
| `docs/index.html` | 공개 열람 페이지 (읽기 전용) |
| `docs/data/records.json` | 공개 기록 데이터 — 동기화로 생성됨, 직접 수정하지 않음 |
| `docs/data/img/` | 첨부 이미지 — 동기화로 생성됨 |
| `sync/build_site.py` | db 덤프를 공개 데이터로 변환하는 스크립트 |
| `negative-data-archive.html` | 제출 앱(Artifact)의 소스. 수정 후 같은 URL로 재발행 |
| `제출_안내.md` | 학생 배포용 안내문 |

## 동기화 절차

새 기록이 쌓이면 공개 사이트에 반영합니다. 1단계와 2단계는 Artifact 데이터베이스를 읽어야 하므로 Claude Code에서 실행합니다.

**1. db 덤프.** Claude Code에서 ArtifactData 도구로 두 컬렉션을 덤프합니다.

- `records` 컬렉션 → `_dump/records/`
- `images` 컬렉션 → `_dump/images/`

재현 확인 내용까지 공개하려면 기록별로 `records/<id>/confirms`도 덤프합니다. 생략하면 공개 사이트에는 확인 건수만 표시됩니다.

**2. 예전 asset 이미지 회수 (해당하는 경우에만).** 2026년 10월 이후 등록된 기록의 이미지는 db에 인라인으로 저장되므로 1단계로 충분합니다. 그 이전 기록이 `kind: "asset"` 이미지를 가지고 있으면 Artifact 도구로 각 asset을 내려받아 `_dump/assets/<asset id>.jpg`에 둡니다. 빠진 이미지는 변환 시 경고와 함께 제외됩니다.

**3. 변환.**

```bash
python3 sync/build_site.py _dump
```

`--dry-run`으로 먼저 확인할 수 있습니다. 경고에 나오는 기록은 공개에서 제외된 것이니 내용을 확인하세요.

**4. 확인 후 푸시.**

```bash
python3 -m http.server 8080 --directory docs
```

브라우저에서 <http://localhost:8080> 을 열어 확인한 뒤 커밋·푸시하면 몇 분 안에 공개 사이트에 반영됩니다.

## 공개 전 제거되는 항목

`sync/build_site.py`가 공개 데이터에서 다음을 제거합니다.

- `submitterEmail` — 연락처. 외부 문의는 운영자를 거칩니다.
- `submitterId` — 내부 사용자 식별자.

제출자 **이름과 연구실은 공개됩니다.** 제출 화면과 학생 안내문에 이 사실을 명시했습니다.

필수 항목(`type`, `outcome`, `title`, `summary`)이 비었거나 유형·결과 값이 알려진 것이 아니면 해당 기록은 공개에서 제외되고 경고가 출력됩니다. 제출 앱에서 삭제한 기록은 다음 동기화 때 공개 사이트에서도 내려갑니다.

## 기록 유형

| 유형 | 핵심 필드 |
|---|---|
| 항체 | 표적, catalog #, **lot #**, clone, 적용, 희석, 고정, 항원 부활, 양성 대조 |
| 마우스 라인 / Cre | 공식 명명, stock ID, driver, reporter, 유도 조건, recombination 효율, **leaky 발현** |
| 프로토콜 / 시약 | 수기명, 키트·catalog, 원 프로토콜 출처, 실패 단계, 시험 조건 범위, 대안 |
| 실험 결과 (null result) | 가설, 모델, 처치, 측정 지표, **군 구성과 n수**, 통계 검정, 검정 결과, **검정력 한계** |

결과 분류: 작동 안 함 / 조건부 작동 / 재현 실패 / 유의한 차이 없음.

## 라이선스

기록 내용은 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.ko)으로 공개합니다. 출처를 밝히면 자유롭게 인용·재사용할 수 있습니다.
