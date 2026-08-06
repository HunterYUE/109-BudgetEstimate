# 应用全量测试报告

> 执行日期：2026-08-06 ｜ 测试对象：BudgetEstimate 全栈应用（前端 React + 后端 Express + PostgreSQL）
> 测试环境：静态门禁本地执行；集成测试针对云端部署后端 `http://118.89.92.58/api/v1`（真实调用，测试数据已全部清理）

---

## 一、测试范围与方法

| 层面 | 方法 | 结果 |
|---|---|---|
| 前端类型门禁 | `tsc -b` | ✅ 通过 |
| 后端类型门禁 | `tsc --noEmit` | ✅ 通过 |
| ESLint | `eslint . --no-ignore` | ⚠️ 修复后通过（见缺陷 D1） |
| 命名规范 | `lint:naming` | ✅ 0 错误 |
| 前端生产构建 | `vite build` | ✅ 通过 |
| 单元测试 | `verify-core.ts`（修复补全） | ✅ ALL PASS |
| 单元测试 | `verify-cost-breakdown.ts` | ✅ ALL PASS |
| 契约核验 | 12 个前端 service ↔ 后端路由逐条比对 | 见缺陷 C1–C5 |
| API 集成测试 | 云端真实调用，3 轮共 68 用例 | **22 项问题/行为确认** |

集成测试覆盖：认证鉴权（5 项）、资源 CRUD 冒烟（组件/客户/标签/项目/版本/组/报价/机会/蓝表/审批/交付/用户/设置）、权限边界（低权限用户）、边界输入（非法 UUID / limit 钳制 / 通配符转义 / 无效枚举）、缺陷复现（审批状态机、删除守卫、reviewer 伪造等）、工时系统专项。

---

## 二、确认的问题（按严重度）

### 🔴 高危（3 项，全部线上确认）

**H1. 越权读取：零权限用户可读全部经营/销售数据**
- 位置：`backend/src/routes/index.ts:35-38`（writeGuard 对 GET 全放开）
- 复现：创建 `permissions: []` 的低权限用户登录后，`GET /quotations`（41 条）、`/opportunities`（含蓝表策略）、`/deliveries`（合同额/实际成本）、`/approvals`（金额/GP3）全部返回 200。
- 影响：最低权限用户（如纯工时员工）可读报价金额、成本、利润、销售策略、交付合同额等全部财务数据。
- 建议：GET 读取按资源分级收紧。至少对 `quotations`、`approvals`、`deliveries`、`opportunities`（含蓝表）的列表/详情加 `requirePermission`（如 '报价列表查看'/'审批管理'/'交付管理'/'销售机会管理'）；仪表盘等跨页读取走统一授权服务或白名单。需产品确认"仪表盘读取共享"的边界。

**H2. 报价审批状态机可被通用 PUT 绕过**
- 位置：`backend/src/routes/quotations.ts`（crudRoutes 未排除 `status`）
- 复现：`PUT /quotations/:id {"status":"approved"}` → 返回 200 `status=approved`。绕过 `approval_records` 审计链与级联（机会金额、`project_versions.review_status`）。
- 建议：仿照 approvals.ts 的修复，`excludeOnUpdate: ['status', ...]`，status 只能经审批流程流转。

**H3. 交付计划/成本审批可被通用 PUT 绕过**
- 位置：`backend/src/routes/deliveries.ts:75-78`（`plan_status`/`cost_status`/`plan_approval`/`cost_approval` 未排除）
- 复现：`PUT /deliveries/:id {"planStatus":"approved"}` → GET 确认 `planStatus=approved`，且可伪造 `plan_approval` JSONB。
- 建议：PUT 排除 `plan_status/cost_status/plan_approval/cost_approval`，状态仅经 `POST /approvals/:id/records` 流转。

### 🟠 中危（7 项，5 项线上确认 / 2 项代码确认）

**M1. 创建审批可直设 `status=approved`**
- 位置：`approvals.ts` 自定义 POST（insertCols 未排除 status）
- 复现：`POST /approvals {"status":"approved", ...}` → 201 `status=approved`，无审批记录却已通过，级联仍写 pending，状态不一致。
- 建议：insertCols 排除 `status`/`submit_time`，强制走 records 流程。

**M2. 工时记录 DELETE 无状态守卫（审计破坏）**
- 位置：`timerecording.ts:204-216`
- 复现：已提交（submitted）和已审核（approved）的工时记录均能被 `DELETE` 删除（200 success）。
- 建议：DELETE 加 `AND status NOT IN ('submitted','approved','locked')`，与 PUT 守卫对齐。

**M3. 审批 reviewer 可伪造**
- 位置：`approvals.ts:130,142`（reviewer 取自 body 而非 req.user）
- 复现：`POST /approvals/:id/records {"reviewer":"冒名审批人",...}` → 记录存的是冒名者。
- 建议：reviewer 强制取自 `req.user`（与 timerecording 的 review 一致）。

**M4. timerecording 登录端点无速率限制**
- 位置：`timerecording.ts` auth/login，对比 `index.ts:34` 只限了 `/auth/login`
- 影响：`/api/v1/timerecording/auth/login` 可被暴力破解。
- 建议：为 timerecording 登录单独加 limiter。

**M5. 删除用户被 `reviewed_by`/`created_by` 外键阻塞，且 `.catch(()=>{})` 吞错使事务回滚无效**
- 位置：`users.ts:164` + `schema.sql`（`time_records.reviewed_by`、`task_assignments.created_by` 无 ON DELETE CASCADE）
- 影响：删除有审批/建任务历史的用户必然失败并返回笼统错误；`.catch` 掩盖真实原因。
- 建议：删除顺序改为先清引用（置 NULL 或级联），去掉无意义的 `.catch`，返回明确 4xx。

**M6. audit_logs 暴露完整 CRUD，审计可被伪造/篡改/删除**
- 位置：`auditLogs.ts`（crudRoutes 含 POST/PUT/DELETE）
- 建议：审计日志只读 + 追加（DELETE/PUT 移除或限制），保证审计完整性。

**M7. `Project.versionNo` 契约静默丢失**
- 位置：前端 `types.ts:107` 声明必填 `versionNo`；前端 `QuotationPage.tsx:99` 发送；后端 `projects.ts` fields 无该列 → 被静默丢弃，创建返回 `versionNo: null`。
- 影响：类型承诺的字段恒为 undefined，若某页直接读 `project.versionNo` 会得到 undefined。
- 建议：从 `Project` 类型移除顶层 `versionNo`（实际用 `currentVersion.versionNo`），或后端 projects 表加列。

### 🟡 低危（10 项）

| # | 问题 | 位置 | 确认方式 |
|---|---|---|---|
| L1 | `project-groups` 两个 DELETE 无影响行检查，删不存在也返回 200 `deleted:true` | `index.ts:207,217` | ✅ 线上 |
| L2 | 客户 `PUT /:id/save` 对不存在客户返回 200 空壳而非 404 | `clients.ts` | ✅ 线上 |
| L3 | 无效枚举值返回笼统"数据操作错误"，无字段定位 | `errorHandler.ts` | ✅ 线上 |
| L4 | timerecording admin 创建用户无重复邮箱预检（返回笼统 400） | `timerecording.ts:380` | ✅ 线上 |
| L5 | timerecording 全员档案（邮箱/角色）对任意登录用户开放 | `timerecording.ts:90` | ✅ 线上 |
| L6 | 多个开放 GET 含每行相关子查询（N+1 式，limit 1000 时放大） | `opportunities/approvals/deliveries.ts` | 代码 |
| L7 | 密码策略不一致：timerecording 重置 ≥6 位 vs users ≥8 位 | `timerecording.ts:417` | 代码 |
| L8 | 上传超限（>3MB PDF / >20MB JSON）返回 500 而非 413 | `deliveries.ts` + `errorHandler.ts` | 代码 |
| L9 | 前端类型过严：`Client.contacts/history`、`ApprovalRequest.quotationId`、create 响应缺 `currentVersion/groups/nodes` 均声明必填 | `types.ts` | 代码 |
| L10 | `DeliveryNode.baselineEndDate` 死字段（后端只回 `baselinePlannedEndDate`） | `types.ts:250` | 代码 |

### 测试基础设施

**D1. `scripts/verify-core.ts` 为截断文件（未入 git），第 115 行字符串未闭合导致 ESLint 解析失败**
- 已修复补全（stageAsOf 议价用例 + getNodeDelay/isProjectDelivered 断言），`ALL PASS`。
- 注意：`package.json` 中 `lint:quiet` 带 `|| true`，ESLint 失败不会阻断构建，此问题此前被静默掩盖。建议把 eslint 改为硬门禁。

---

## 三、已确认正常的行为（防误报）

- 认证：无 token / 伪 token / 错密码 / 缺字段 均正确返回 401/400；登录限速存在。
- 通用 CRUD：组件/客户/标签/项目/版本/组/机会/蓝表/报价/交付/用户/设置 全流程正常（正确枚举下）；非法 UUID 返回 400、不存在记录 404。
- 边界：`limit=999999` 钳制到 ≤1000；`search=%` 通配符正确转义；空 body 400。
- 审批流程：正常 records 流转 → status=approved；已终审重复审批返回 409；事务级联正确。
- 报价 `sync` 对 `status='pending'` 的拒绝覆盖（F18 守卫）正常。
- 前后端契约：URL、方法、camelCase↔snake_case 转换在 12 个 service 中整体一致（`api.ts` toCamel/toSnake 承担转换）。
- 测试数据：9 类资源全部清理完毕（复检 0 残留）。

---

## 四、优化建议（按性价比排序）

1. **优先修 H1–H3**：审批/交付状态机绕过 + 越权读取，直接影响数据可信度与权限边界。均是一行 `excludeOnUpdate` 或一个权限守卫的改动。
2. **M1–M3**：审批创建/记录/删除的守卫补齐，改动量小、收益明确。
3. **M4–M7**：速率限制、删除级联、审计只读、契约收敛。
4. **建立自动化防线**：目前唯一"硬"门禁是 tsc；建议把 `verify-core.ts`/`verify-cost-breakdown.ts` 纳入 CI（`npm test`），并让 ESLint 失败阻断构建（去掉 `|| true`）。
5. **契约收敛**：修复 `Project.versionNo` 死字段与 `types.ts` 过严声明，避免类型承诺与后端不符。
6. **错误信息可读性**：errorHandler 对 PG 错误按 `code` 细分（enum 无效/唯一冲突/外键），给用户明确提示而非统一"数据操作错误"。

---

## 五、遗留事项（本次未能覆盖）

- 前端 UI 层面的浏览器端到端测试（无 Playwright/Cypress 环境，需后续补充）。
- 高并发/性能测试（N+1 子查询的影响仅在数据量增大时显现）。
- 低权限用户对 `clients/:id/detail`（历史报价金额）、`projects/:id/full`（成本明细）的读取面实测（代码已确认同属 writeGuard 放开范围）。
- 文件上传（PDF 下载/权限）的端到端验证（本轮只验证了权限路径，未上传真实附件）。


---

## 六、修复执行记录（2026-08-06 晚）

对复审确认的所有真实缺陷实施修复，前后端全部通过门禁（tsc/eslint/build/verify-core/verify-cost-breakdown，后端 build 成功）。

| 编号 | 修复内容 | 文件 | 状态 |
|---|---|---|---|
| H1 | 越权读取：新增 readGuard，财务/销售敏感资源 GET 需对应读取权限；clients detail（含历史报价）定向守卫 | `routes/index.ts`, `routes/clients.ts` | ✅ |
| H2 | 报价审批绕过：quotations PUT `excludeOnUpdate:['status','locked']`；sync 仅允许 draft/pending | `routes/quotations.ts` | ✅ |
| H3 | 交付审批绕过：deliveries PUT 排除 plan/cost 审批四字段 + 关联引用 | `routes/deliveries.ts` | ✅ |
| M1 | 创建审批排除 status/submit_time | `routes/approvals.ts` | ✅ |
| M2 | 工时记录 DELETE 仅 draft 可删（防破坏审计链） | `routes/timerecording.ts` | ✅ |
| M3 | 审批 reviewer 强制取自登录用户（DB display_name） | `routes/approvals.ts` | ✅ |
| M4 | timerecording 登录加 15min/20次 限速 | `routes/timerecording.ts` | ✅ |
| M5 | 用户删除：tr 引用先置空（reviewed_by/created_by）+ schema 探测，去 .catch 吞错 | `routes/users.ts`, `routes/timerecording.ts` | ✅ |
| M6 | 审计日志改只读（移除 POST/PUT/DELETE） | `routes/auditLogs.ts` | ✅ |
| M7 | Project.versionNo 死字段从类型与 payload 移除 | `types.ts`, `QuotationPage.tsx` | ✅ |
| L1 | project-groups DELETE 行检查（不存在返回 404） | `routes/index.ts` | ✅ |
| L2 | 客户 save 不存在返回 404 | `routes/clients.ts` | ✅ |
| L3 | errorHandler 按 PG 错误码细分（22P02/23505/23503/23514/23502） | `middleware/errorHandler.ts` | ✅ |
| L4 | tr admin 创建用户重复邮箱预检 409 | `routes/timerecording.ts` | ✅ |
| L5 | tr 全员档案列表仅管理员可见 | `routes/timerecording.ts` | ✅ |
| L7 | 密码策略统一 ≥8 位 | `routes/timerecording.ts` | ✅ |
| L8 | 上传超限返回 413（MulterError 识别） | `middleware/errorHandler.ts` | ✅ |
| L9 | 类型过严改可选：Client.contacts/history、ApprovalRequest.quotationId、create/update 返回 Omit 嵌套 | `types.ts`, 两个 service | ✅ |
| L10 | DeliveryNode.baselineEndDate 死字段移除，读取简化 | `types.ts`, `analysisShared.ts`, `DeliveryAnalysis.tsx` | ✅ |
| L6 | N+1 相关子查询：**评估后暂缓**。属性能优化而非缺陷；无本地 DB 测试环境，直接重写 list 查询有回归风险 | — | ⏸️ 待后续 |

**L6 优化建议（供后续有测试环境时实施）**：
- `opportunities` 列表的 `has_quote/quotation_amount/tax_rate` 三个每行子查询 → `LEFT JOIN LATERAL` 或聚合查询；
- `approvals` 列表的 `latest_record` → `DISTINCT ON` + LEFT JOIN；
- `deliveries` 列表的 `nodes` jsonb_agg 子查询 → 先查节点再内存归组或 `GROUP BY dp.id` 聚合。

**部署说明**：修改均在 `backend/src/` 与 `BudgetEstimateApp/src/`，**尚未部署**。服务器以 `node --import tsx src/index.ts` 运行，`deploy.sh` 推送 src + 重启即可生效。⚠️ L5/M2 改动会影响**外部工时 app**（不在本仓库）：若该 app 普通员工需要全员列表或删除已提交记录，需同步验证。
