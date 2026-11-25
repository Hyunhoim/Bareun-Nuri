<div align="center">

<img src="frontend/public/brand-logo.png" width="96" alt="바른누리 로고" />

# 바른누리 · Bareun-Nuri

**LLM 기반 공공 웹사이트 불법광고 탐지 Agent**

![React](https://img.shields.io/badge/React-315B89?style=flat-square) ![Spring Boot](https://img.shields.io/badge/Spring%20Boot-315B89?style=flat-square) ![Java 21](https://img.shields.io/badge/Java%2021-315B89?style=flat-square) ![Node.js](https://img.shields.io/badge/Node.js-315B89?style=flat-square) ![Playwright](https://img.shields.io/badge/Playwright-315B89?style=flat-square) ![Python](https://img.shields.io/badge/Python-315B89?style=flat-square) ![PyTorch](https://img.shields.io/badge/PyTorch-315B89?style=flat-square) ![KcELECTRA](https://img.shields.io/badge/KcELECTRA-315B89?style=flat-square) ![OpenAI](https://img.shields.io/badge/OpenAI-315B89?style=flat-square)

[Overview](#overview) · [Features](#features) · [Architecture](#architecture) · [Tech Stack](#tech-stack) · [How to Run](#how-to-run)

</div>

---

## Overview

공공 웹사이트의 게시글, 댓글, 제목, 본문 및 iframe에 포함된 불법광고를 탐색하고 위장·은닉 기법을 식별하는 AI 검사 시스템입니다. 광고 의도에 대한 LLM의 문맥 판단과 로컬 모델 및 결정론적 웹 분석을 분리하여 결합합니다. 결과는 원문, URL, 요소 위치, 탐지 기법과 함께 제공됩니다.

## Features

| 기능 | 설명 |
| --- | --- |
| 웹 탐색 | FIFO 기반 동일 출처 링크 탐색, Chromium 재사용, iframe 별도 검사 |
| 광고 의도 분석 | 대상 문구와 연결된 앞뒤 문맥을 OpenAI Responses API로 분석 |
| 문자 위장 탐지 | Unicode 문자 분석과 KcELECTRA 기반 AntiSpoof v1.0 CPU 추론 |
| 시각적 은닉 탐지 | DOM, 계산된 CSS 스타일 및 좌표로 투명 텍스트와 화면 밖 요소 검사 |
| 검사 관리 | 진행률·탐지 통계·원문 확인, 25분 단위 검사, 저장 후 재개 |
| 결과 관리 | JSON 내보내기, 검사 이력 조회·필터·삭제, 누락 및 미판정 기록 |

탐지 유형은 `HOMOGLYPH`(닮은꼴 문자), `JAMO`(자모 분해), `TRANSPARENT`(투명 텍스트), `OFFSCREEN`(화면 밖 은닉)입니다. 로그인, 폼 제출 및 모든 동적 페이지 탐색을 보장하지 않으며 부분 검사 결과를 사이트 전체의 정상 판정으로 해석하지 않습니다.

## Architecture

~~~mermaid
flowchart LR
  UI["React Dashboard"] --> API["Spring Boot API"]
  API --> W["Node.js Agent"]
  W --> P["Playwright / Chromium"]
  P --> L["LLM: 광고 의도"]
  P --> M["AntiSpoof CPU / DOM 분석"]
  L --> V["판정 통합 및 계약 검증"]
  M --> V
  V --> J["result.json / 검사 이력"]
  J --> API
~~~

- `frontend/`: 사용자 화면, 통계, 결과 및 키 관리
- `backend/`: 검사 작업 제어, API, 이력 관리
- `agent/src/`: 수집, 판정, 저장·재개 로직
- `agent/antispoof/`, `agent/models/`: CPU 추론 서비스 및 Git LFS 모델
- `scripts/`: 빌드, 패키징 및 검증

## Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | React, TypeScript, Ant Design, Recharts |
| Backend | Java 21, Spring Boot, Maven |
| Agent | Node.js, Playwright, Chromium |
| AI | OpenAI Responses API, Python 3.12, PyTorch CPU, KcELECTRA |
| Distribution | Windows x64 EXE, Git LFS, PowerShell |

## How to Run

### 1. Prerequisites

Windows 11 x64, Git LFS, Node.js 24, Python 3.12 및 외부 API 접근이 필요합니다. Java 21과 Maven은 실행 스크립트에서 준비하며 GPU는 필요하지 않습니다.

### 2. Install & Start

~~~powershell
git lfs install
git clone https://github.com/Hyunhoim/Bareun-Nuri.git
cd Bareun-Nuri
git lfs pull
py -3.12 -m venv .runtime/klue-venv
.runtime/klue-venv/Scripts/python.exe -m pip install torch==2.6.0+cpu --no-deps --index-url https://download.pytorch.org/whl/cpu
.runtime/klue-venv/Scripts/python.exe -m pip install --no-deps -r scripts/requirements-windows.txt
npm.cmd ci --prefix agent --no-fund --no-audit
node agent/node_modules/playwright/cli.js install chromium --only-shell
Copy-Item agent/.env.example agent/.env
.\start.cmd
~~~

브라우저에서 http://127.0.0.1:8766 에 접속하여 API 키 관리 화면에서 OpenAI 키를 등록하고 검사 URL을 입력합니다. 운영 설정은 `gpt-6-luna` 모델 접근 권한을 요구합니다. API 키는 커밋하지 말고 외부 전송 정책을 확인하세요.

### 3. Build & Verify

~~~powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/run.ps1 -Action build
npm.cmd test --prefix agent
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/package-windows.ps1 -SkipBuild
node scripts/verify-submission.cjs --smoke
~~~

결과 원본은 `.runtime/jobs/<작업 ID>/artifacts/result.json`에 저장됩니다. 패키징 결과는 실행기와 포함 런타임을 함께 배포해야 합니다.

[사용설명서](docs/사용설명서.md) · [상세 실행 및 검증 안내](README_DEVELOPMENT.md)
