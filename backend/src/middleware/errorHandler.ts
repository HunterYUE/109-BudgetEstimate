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

  // 处理 PostgreSQL 错误（不暴露具体错误详情给客户端）
  const pgErr = err as any;
  if (pgErr.code && pgErr.severity) {
    console.error(`[DB ERROR] ${requestInfo} — ${pgErr.code}: ${pgErr.message}`, pgErr.detail || '');
    res.status(400).json({
      error: '数据操作错误',
    });
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
