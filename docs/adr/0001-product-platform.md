# ADR-0001：保留 PWA 止血，後端優先重構

- 狀態：Accepted for P0 recovery
- 日期：2026-07-15

## Context

目前產品是 Vanilla JavaScript PWA，不是 Flutter。核心風險集中在權限、資料模型、同步與測試，而不是前端框架。立即重寫 Flutter 會同時重寫 UI 與後端，擴大風險且延後安全修復。

## Options

1. **原地繼續堆功能**：最快，但保留資料外洩、越權與同步覆寫，拒絕。
2. **立即全面重寫 Flutter + 新後端**：長期體驗可能較佳，但時程、回歸與遷移風險最高，現階段拒絕。
3. **Strangler migration**：短期保留 PWA，先建立 state/schema、正式 auth、tenant、database 與 action API，再逐頁替換前端；接受。

## Decision

採方案 3。Sprint 0–1 建立品質基線與前端止血；Sprint 2–3 建立正式後端與資料遷移；核心流程穩定並有商業數據後，再以 ADR 評估 Flutter。

## Consequences

- 可最快停止 Critical 安全與資料遺失問題。
- 短期需要維護舊 PWA 與新 API adapter。
- 不允許再把 Google Sheets 或 localStorage 擴充為正式主資料庫。
- 不允許以「之後會重寫」為理由省略測試、安全與 migration。

