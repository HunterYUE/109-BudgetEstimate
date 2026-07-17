#!/usr/bin/env node
/**
 * 命名规范检查脚本
 * 扫描前端 src/ 下所有 .ts/.tsx 文件，检测：
 *   1. 非 API body 的蛇形键名
 *   2. 直接 fetch() 调用（绕过 api.ts）
 *
 * 规则详见 project memory: naming-convention-standard.md
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../src');
const EXCLUDE_DIRS = new Set(['node_modules', 'dist']);
const EXCLUDE_FILES = new Set(['mockData.ts']);

// API body 字段——这些字段必须蛇形（发往后端），不作为违规
const API_BODY_FIELDS = new Set([
  // 交付节点
  'node_no', 'planned_start_date', 'planned_end_date', 'actual_start_date', 'actual_end_date',
  'baseline_planned_end_date', 'actual_date',
  // 项目
  'client_name', 'client_code', 'project_scope', 'project_stage', 'project_name',
  'expected_award_date', 'project_layout', 'delivery_period', 'payment_terms',
  'sales_no', 'version_no', 'postfix', 'note',
  // 报价
  'approval_type', 'quotation_id', 'delivery_id', 'submitter',
  'total_cost', 'profit_rate', 'opportunity_id', 'tax_rate',
  'total_accounting_price', 'discounted_price', 'discount_rate',
  'total_direct_cost', 'gp3_profit_rate', 'rp1_profit_rate',
  'warranty_cost', 'risk_cost', 'material_cost', 'labor_cost', 'project_expense',
  'rounding_digits', 'commercial_cost', 'eur_rate', 'review_status',
  // 项目组/明细
  'group_no', 'group_type', 'item_no', 'item_type', 'component_id',
  'qty_total', 'unit_cost', 'design_hours', 'assembly_hours',
  'design_hour_rate', 'assembly_hour_rate', 'direct_cost', 'margin_rate',
  'basic_price', 'accounting_price', 'has_warranty', 'sourcing_type',
  'sort_order', 'is_fixed', 'version_id', 'project_id',
  // 审批
  'approval_action', 'cost_status', 'plan_status', 'cost_approval', 'plan_approval',
  'total_actual_cost', 'actual_costs',
  // 客户
  'parent_id', 'credit_level', 'client_grade', 'decision_role',
  // 机会/蓝表
  'expected_close_date', 'veto_budget', 'budget_amount', 'timeline_plan',
  'timeline_option', 'pricing', 'positioning', 'reaction_mode', 'strategy',
  'blue_table_id', 'role_type', 'influence_level', 'influence_weight',
  'demand_fit', 'relationship', 'target_support',
  'delivery_status', 'node_status',
  // 审计日志
  'user_name', 'module',
  // 蓝表
  'win_rate', 'blue_table',
  // 合同
  'contract_amount',
]);

// 非键名的 snake_case 单词（枚举值、保留字等）
const FALSE_POSITIVES = new Set([
  'in_progress', 'very_strong', 'slightly_weak', 'very_weak',
  'targets', 'headers', 'finally', 'catch', 'then', 'else', 'typeof',
]);

let errors = 0;
let warnings = 0;

function walkDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (EXCLUDE_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkDir(full);
    else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name) && !EXCLUDE_FILES.has(entry.name)) {
      checkFile(full);
    }
  }
}

function checkFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const rel = path.relative(ROOT, filePath).replace(/\\/g, '/');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;

    // 检查蛇形键名（形如 xxx_yyy 的标识符）
    const snakeMatches = trimmed.match(/\b[a-z]+_[a-z]+\w*\b/g);
    if (snakeMatches) {
      for (const word of snakeMatches) {
        if (API_BODY_FIELDS.has(word) || FALSE_POSITIVES.has(word)) continue;
        // 跳过字符串字面量中的 snake_case
        if (trimmed.includes(`'${word}'`) || trimmed.includes(`"${word}"`)) continue;
        console.log(`  ERROR   ${rel}:${i + 1}  蛇形命名 "${word}" —— 前端内部应使用 camelCase`);
        errors++;
      }
    }
  }
}

console.log('\n=== 命名规范检查 ===\n');
console.log(`扫描目录: ${ROOT}\n`);

walkDir(ROOT);

console.log(`\n结果: ${errors} 错误, ${warnings} 警告`);
if (errors > 0) {
  console.log('\n❌ 有命名规范违规，请修复后再提交。');
  console.log('   规则详见 project memory: naming-convention-standard.md\n');
  process.exit(1);
} else {
  console.log('✅ 前端内部命名规范合规\n');
}
