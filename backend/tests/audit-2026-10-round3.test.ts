import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildOppStatusClauses } from '../src/routes/opportunities.js';

// 2026-10 第三轮全量审计回归：工时周状态机改期绕过、自审拦截、检查-写入同事务、
// 已审批成本覆盖权限、审核状态直写、悬空审批、请求体过限响应码。
// 路由层守卫用静态接线断言（与 route-guards.test.ts 同模式）；状态机仍为纯函数直测

const read = (rel: string): string => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const timeRecording = read('../src/routes/timerecording.ts');
const deliveries = read('../src/routes/deliveries.ts');
const components = read('../src/routes/components.ts');
const approvals = read('../src/routes/approvals.ts');
const appEntry = read('../src/index.ts');
const errorHandler = read('../src/middleware/errorHandler.ts');

describe('工时 PUT 改期：不得把草稿挪进已提交/已审核周', () => {
  it('跨周改期按目标周重新做整周冻结校验', () => {
    expect(timeRecording).toMatch(
      /if \(iso\.year !== existing\.year \|\| iso\.week !== existing\.week_number\) \{[\s\S]*?assertWeekNotCommitted\(existing\.user_id, iso\.year, iso\.week, \[req\.params\.id\]\)/
    );
  });
  it('PUT 取回原记录的 year/week_number 供比较', () => {
    expect(timeRecording).toMatch(/SELECT user_id, date, year, week_number, start_time/);
  });
});

describe('工时创建：检查与写入同事务 + 周级咨询锁', () => {
  it('创建路径在事务内加 advisory lock 后执行三项校验再插入', () => {
    expect(timeRecording).toMatch(
      /withTransaction\(async \(client\) => \{[\s\S]*?pg_advisory_xact_lock[\s\S]*?assertWeekNotCommitted\(targetUserId, iso\.year, iso\.week, \[\], client\)[\s\S]*?assertNoTimeOverlap\(targetUserId, date, start_time, end_time, undefined, client\)[\s\S]*?assertLeaveValid\(\{[\s\S]*?db: client,[\s\S]*?INSERT INTO timerecording\.time_records/
    );
  });
  it('三个守卫支持传入事务连接（避免检查走池连接、写入走事务）', () => {
    expect(timeRecording).toMatch(/export async function assertNoTimeOverlap\([\s\S]*?db\?: Queryable/);
    expect(timeRecording).toMatch(/export async function assertWeekNotCommitted\([\s\S]*?db\?: Queryable/);
    expect(timeRecording).toMatch(/db\?: Queryable;\s*\n\}\): Promise<void> \{[\s\S]*?opts\.db \? opts\.db\.query\.bind\(opts\.db\) : query/);
  });
});

describe('工时批量审核：自审拦截与整周原子性', () => {
  it('审批人不得审批自己提交的周工时', () => {
    expect(timeRecording).toMatch(/String\(first\.user_id\)\.toLowerCase\(\) === String\(reviewer\.userId\)\.toLowerCase\(\)[\s\S]*?不能审批自己提交的工时/);
  });
  it('批审事务先加周级咨询锁再读取待审集合', () => {
    expect(timeRecording).toMatch(/pg_advisory_xact_lock\(hashtext\(\$1\)\)[\s\S]*?SELECT user_id, year, week_number, status FROM timerecording\.time_records/);
  });
});

describe('工时档案改邮箱：写入前做格式校验', () => {
  it('非法/空邮箱直接 400，避免下次登录被永久拒绝', () => {
    expect(timeRecording).toMatch(/emailNorm = normalizeEmail\(String\(req\.body\.email\)\);[\s\S]*?!EMAIL_RE\.test\(emailNorm\)[\s\S]*?邮箱格式无效/);
  });
});

describe('成本中心读取：纯读请求不触发码表补建', () => {
  it('cost-centers 端点不再调用 ensureCostCenters', () => {
    const endpoint = timeRecording.slice(timeRecording.indexOf("router.get('/cost-centers'"));
    expect(endpoint.slice(0, 800)).not.toMatch(/ensureCostCenters/);
  });
});

describe('交付成本：已审批后仅总监/管理员可覆盖', () => {
  it('beforeUpdate 对 approved 成本做角色校验', () => {
    expect(deliveries).toMatch(
      /cost_status === 'approved' && req\.user\?\.role !== 'director' && req\.user\?\.role !== 'admin'[\s\S]*?仅总监可覆盖修改/
    );
  });
});

describe('物料审核状态：不接受客户端直写', () => {
  it('通用更新的 review_status 一律丢弃，仅由审核接口/内容变更规则写入', () => {
    expect(components).toMatch(/if \(snakeBody\.review_status !== undefined\) delete snakeBody\.review_status;/);
  });
});

describe('审批创建：目标实体必填', () => {
  it('按类型要求 quotation_id / opportunity_id / delivery_id', () => {
    expect(approvals).toMatch(/const targetKey = approval_type === 'quotation' \? 'quotation_id'[\s\S]*?: approval_type === 'promote' \? 'opportunity_id' : 'delivery_id';/);
    expect(approvals).toMatch(/if \(!\(body as Record<string, any>\)\[targetKey\]\)/);
  });
  it('不再写入 approval_requests 不存在的 project_id 列', () => {
    expect(approvals).not.toMatch(/body\.project_id = q\.project_id;/);
  });
});

describe('请求体过限：返回 413 而非 500', () => {
  it('errorHandler 识别 entity.too.large / status 413', () => {
    expect(errorHandler).toMatch(/status === 413 \|\|[\s\S]*?entity\.too\.large[\s\S]*?res\.status\(413\)/);
  });
  it('认证接口单独收紧请求体上限，并对 /api/v1 限速', () => {
    expect(appEntry).toMatch(/app\.use\('\/api\/v1\/auth', express\.json\(\{ limit: '64kb' \}\)\);/);
    expect(appEntry).toMatch(/app\.use\('\/api\/v1', apiLimiter\);/);
  });
});

describe('机会转交付：赢单分支统一清空输单时间', () => {
  it('已赢转交付与过程中转交付都追加 lost_at = NULL', () => {
    expect(buildOppStatusClauses({ terminated: true }, '赢', true)).toContain('lost_at = NULL');
    expect(buildOppStatusClauses({ terminated: true }, '机会', true)).toContain('lost_at = NULL');
  });
});
