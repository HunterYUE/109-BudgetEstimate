import { describe, it, expect } from 'vitest';
import { pgErrorResponse, AppError } from '../src/middleware/errorHandler.js';

// errorHandler 的 PG 错误码映射（纯函数化提取）：前端依赖这些消息/状态码做错误提示，
// 提取后直测每个分支，防回归（A110 不透传 DB detail，服务端 console.error 保留完整信息）。

describe('pgErrorResponse PG 错误码 → 对外响应', () => {
  it('22P02 无效类型/枚举值 → 400', () => {
    expect(pgErrorResponse('22P02')).toEqual({ message: '字段值无效，请检查枚举或格式', status: 400 });
  });
  it('23505 唯一约束冲突 → 409「数据已存在」', () => {
    expect(pgErrorResponse('23505')).toEqual({ message: '数据已存在', status: 409 });
  });
  it('23503 外键约束 → 409', () => {
    expect(pgErrorResponse('23503')).toEqual({ message: '存在关联数据，无法操作', status: 409 });
  });
  it('23514 CHECK 约束 → 400', () => {
    expect(pgErrorResponse('23514')).toEqual({ message: '数据不满足校验规则', status: 400 });
  });
  it('23502 非空约束 → 400「缺少必填字段」', () => {
    expect(pgErrorResponse('23502')).toEqual({ message: '缺少必填字段', status: 400 });
  });
  it('未知错误码 → 400「数据操作错误」（不泄漏错误详情）', () => {
    expect(pgErrorResponse('42P01')).toEqual({ message: '数据操作错误', status: 400 });
    expect(pgErrorResponse('')).toEqual({ message: '数据操作错误', status: 400 });
  });
});

describe('AppError 结构', () => {
  it('携带状态码与消息，name=AppError', () => {
    const e = new AppError(409, '冲突');
    expect(e.statusCode).toBe(409);
    expect(e.message).toBe('冲突');
    expect(e.name).toBe('AppError');
  });
});
