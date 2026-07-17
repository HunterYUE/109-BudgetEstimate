# 109-BudgetEstimate 数据库部署说明

## 技术选型

**数据库：PostgreSQL 16+**

选择理由：
| 需求 | PostgreSQL 优势 |
|---|---|
| 免费开源 | PostgreSQL 许可证，无任何费用 |
| 嵌套数据 | JSONB 原生支持 changeLog、targets 等复杂结构 |
| 标签数组 | TEXT[] 数组类型，直接对应 tags?: string[] |
| 枚举类型 | 原生 ENUM 支持，映射所有 TypeScript 枚举 |
| 树形结构 | CTE 递归查询支持标签树的祖先/后代遍历 |
| 稳定性 | 30+ 年生产验证，适合中小规模业务 |

## 部署方式（二选一）

### 方案 A：腾讯云 CVM 自安装（推荐，免费）
在云服务器上安装 PostgreSQL，完全免费。

### 方案 B：腾讯云 PostgreSQL（CDB）
托管服务，有免费试用额度，后续收费。

## 数据库结构总览

```
17 张表，覆盖全部 TypeScript 类型：

┌─ tags ───────────────────┐   树形结构
├─ components ─────────────┤   物料目录
├─ projects ───────────────┤   项目主表
│  ├─ project_versions ────┤   项目版本
│  │  └─ project_groups ───┤   项目组
│  │     └─ group_items ───┤   组内明细
├─ sales_opportunities ────┤   销售机会
│  └─ blue_tables ─────────┤   销售蓝表
│     └─ blue_table_roles ─┤   蓝表角色
├─ quotations ─────────────┤   报价摘要
├─ approval_requests ──────┤   审批请求
│  └─ approval_records ────┤   审批记录
├─ delivery_projects ──────┤   交付项目
│  └─ delivery_nodes ──────┤   交付节点
└─ clients ────────────────┤   客户管理
   ├─ client_contacts ─────┤   联系人
   └─ client_history ──────┤   历史记录
```
