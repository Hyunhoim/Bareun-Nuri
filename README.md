<div align="center">

<img src="frontend/public/brand-logo.png" width="96" alt="바른누리 로고" />

# 바른누리 · Bareun-Nuri

**공공 웹사이트 불법광고 탐지 AI Agent**

![OpenAI](https://img.shields.io/badge/OpenAI-315B89?style=flat-square) ![PyTorch](https://img.shields.io/badge/PyTorch-315B89?style=flat-square) ![KcELECTRA](https://img.shields.io/badge/KcELECTRA-315B89?style=flat-square) ![Playwright](https://img.shields.io/badge/Playwright-315B89?style=flat-square) ![React](https://img.shields.io/badge/React-315B89?style=flat-square) ![Spring Boot](https://img.shields.io/badge/Spring%20Boot-315B89?style=flat-square) ![Node.js](https://img.shields.io/badge/Node.js-315B89?style=flat-square)

[Overview](#overview) · [Features](#features) · [Architecture](#architecture) · [Documentation](#documentation)

</div>

---

## Overview

LLM 문맥 판단과 CPU 파인튜닝 모델, DOM 분석을 결합한 하이브리드 탐지 시스템입니다.

## Features

- 웹 페이지 및 iframe 탐색
- 광고 의도와 4종 위장·은닉 기법 분리 판정
- 검사 대시보드, JSON 출력, 중단·재개, Windows 패키징

## Architecture

```mermaid
flowchart LR
 A[웹사이트] --> B[Playwright]
 B --> C[LLM 의도 판단]
 B --> D[CPU 모델 및 DOM 분석]
 C --> E[판정 통합]
 D --> E
 E --> F[대시보드 및 JSON]
```

## Tech Stack

OpenAI · PyTorch · KcELECTRA · Playwright · React · Spring Boot · Node.js

## Project Status

2026-10-08 최종 감사 기준 소스 보관본. 완전한 탐지나 사이트 전체 탐색을 보장하지 않습니다.

## Documentation

[사용설명서](docs/사용설명서.md) · [최종 감사](docs/최종_감사.md)

- [상세 개발·실행 안내 및 기존 README](README_DEVELOPMENT.md)
