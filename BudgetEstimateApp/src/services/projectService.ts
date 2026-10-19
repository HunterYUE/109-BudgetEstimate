import { api } from '../utils/api';
import type { Project, ProjectVersion, Group } from '../types';

export const projectService = {
  /** 获取单个项目（含版本、组、明细） */
  getFull: (id: string, opts?: { noCache?: boolean }) =>
    api.get<Project & { versions: ProjectVersion[]; groups: Group[] }>(`/projects/${id}/full`, opts),

  /** 创建项目 */
  create: (data: Partial<Project>) => api.post<Omit<Project, 'currentVersion' | 'groups'>>('/projects', data),

  /** 更新项目 */
  update: (id: string, data: Partial<Project>) => api.put<Omit<Project, 'currentVersion' | 'groups'>>(`/projects/${id}`, data),

  /** 删除项目 */
  delete: (id: string) => api.delete(`/projects/${id}`),

  /** 保存项目版本 */
  saveVersion: (projectId: string, data: Partial<ProjectVersion>) =>
    api.post<ProjectVersion>(`/project-versions`, { ...data, projectId }),

  /**
   * 整版本批量保存组和明细：后端在同一事务内删除目标版本旧组后重建
   * 返回组数组（顺序与入参一致），用于回写组 id；明细 id 由客户端提供时由后端保留
   */
  saveGroupBatch: (projectId: string, versionId: string, groups: Group[]) =>
    api.post<Group[]>('/project-groups/batch', { projectId, versionId, groups }),

};
