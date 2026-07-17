import { api } from '../utils/api';
import type { Project, ProjectVersion, Group } from '../types';

export const projectService = {
  /** 获取项目列表 */
  list: () => api.get<Project[]>('/projects'),

  /** 获取单个项目（含版本、组、明细） */
  getFull: (id: string) => api.get<Project & { versions: ProjectVersion[]; groups: Group[] }>(`/projects/${id}/full`),

  /** 创建项目 */
  create: (data: Partial<Project>) => api.post<Project>('/projects', data),

  /** 更新项目 */
  update: (id: string, data: Partial<Project>) => api.put<Project>(`/projects/${id}`, data),

  /** 删除项目 */
  delete: (id: string) => api.delete(`/projects/${id}`),

  /** 保存项目版本 */
  saveVersion: (projectId: string, data: Partial<ProjectVersion>) =>
    api.post<ProjectVersion>(`/project-versions`, { ...data, projectId }),

  /** 保存组和明细 */
  saveGroup: (projectId: string, versionId: string, data: any) =>
    api.post('/project-groups', { ...data, projectId, versionId }),

  deleteGroup: (id: string) =>
    api.delete(`/project-groups/${id}`),

  /** 更新项目版本的审核状态 */
  updateVersionStatus: (projectId: string, versionNo: string, status: string) =>
    api.put(`/projects/${projectId}/versions/${versionNo}/status`, { reviewStatus: status }),
};
