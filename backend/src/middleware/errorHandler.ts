import type { Request, Response, NextFunction } from 'express';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // 响应已发出（如路由中途写回后抛错）时不能再写，避免 "Cannot set headers after they are sent"
  if (res.headersSent) return;

  const requestInfo = `${req.method} ${req.path}`;

  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      console.error(`[ERROR] ${requestInfo} — ${err.statusCode}: ${err.message}`);
    }
    res.status(err.statusCode).json({
      error: err.message,
    });
    return;
  }

  // ⚠️ L8 修复：上传超限等 Multer 错误返回 413/400（此前落入通用 500）
  if (err && (err as { name?: string }).name === 'MulterError') {
    const code = (err as { code?: string }).code;
    if (code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ error: '文件超过大小限制' });
    } else {
      res.status(400).json({ error: `文件上传失败：${code || '未知错误'}` });
    }
    return;
  }

  // 处理 PostgreSQL 错误（不暴露原始 SQL/表结构，但按错误码给出可定位的提示）
  const pgErr = err as { code?: string; severity?: string; message?: string; detail?: string; constraint?: string };
  if (pgErr.code && pgErr.severity) {
    console.error(`[DB ERROR] ${requestInfo} — ${pgErr.code}: ${pgErr.message}`, pgErr.detail || '');
    // ⚠️ L3 修复：按 PG 错误码细分，避免所有数据库错误都变成笼统的"数据操作错误"（如无效枚举值无法定位字段）
    const detail = pgErr.detail?.replace(/[()]/g, '') || '';
    let msg = '数据操作错误';
    let status = 400;
    switch (pgErr.code) {
      case '22P02': // 无效类型/枚举值
        msg = `字段值无效，请检查枚举或格式${detail ? '：' + detail : ''}`;
        break;
      case '23505': // 唯一约束冲突
        msg = `数据已存在${detail ? '：' + detail : ''}`;
        status = 409;
        break;
      case '23503': // 外键约束
        msg = `存在关联数据，无法操作${detail ? '：' + detail : ''}`;
        status = 409;
        break;
      case '23514': // CHECK 约束
        msg = `数据不满足校验规则${detail ? '：' + detail : ''}`;
        break;
      case '23502': // 非空约束
        msg = `缺少必填字段${detail ? '：' + detail : ''}`;
        break;
      default:
        msg = `数据操作错误${detail ? '（' + detail + '）' : ''}`;
    }
    res.status(status).json({ error: msg });
    return;
  }

  // 处理 JSON 解析错误
  if (err instanceof SyntaxError && 'body' in err) {
    console.error(`[PARSE ERROR] ${requestInfo}: ${err.message}`);
    res.status(400).json({
      error: '请求体格式错误',
    });
    return;
  }

  // 通用服务器错误
  console.error(`[ERROR] ${requestInfo}:`, err);
  res.status(500).json({
    error: '服务器内部错误',
  });
}
