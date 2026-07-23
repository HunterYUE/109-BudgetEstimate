import { api } from '../utils/api';
import type { TagNode } from '../types';

/** 数据库中的标签行（与前端 TagNode 对应） */
interface TagRow {
  id: string;
  name: string;
  description?: string;
  parentId?: string | null;
  sortOrder?: number;
}

export const tagService = {
  /** 获取标签树（完整层级） */
  getTree: () => api.get<TagNode[]>('/tags/tree/all'),

  /** 获取标签列表（展平） */
  list: () => api.get<TagRow[]>('/tags'),

  /** 创建标签 — 传入 name 和可选的 parentId */
  create: (data: { name: string; parentId?: string | null; description?: string }) =>
    api.post<TagRow>('/tags', { sortOrder: 0, description: '', ...data }),

  /** 更新标签 */
  update: (id: string, data: { name?: string; description?: string; sortOrder?: number; parentId?: string | null }) =>
    api.put<TagRow>(`/tags/${id}`, data),

  /** 删除标签 */
  delete: (id: string) => api.delete(`/tags/${id}`),
};
