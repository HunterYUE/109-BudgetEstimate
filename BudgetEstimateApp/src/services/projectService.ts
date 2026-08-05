import { api } from '../utils/api';
import type { Project, ProjectVersion, Group, GroupItem } from '../types';

export const projectService = {
  /** 获取项目列表 */

  /** 获取单个项目（含版本、组、明细） */
  getFull: (id: string, opts?: { noCache?: boolean }) =>
    api.get<Project & { versions: ProjectVersion[]; groups: Group[] }>(`/projects/${id}/full`, opts),

  /** 创建项目 */
  create: (data: Partial<Project>) => api.post<Project>('/projects', data),

  /** 更新项目 */
  update: (id: string, data: Partial<Project>) => api.put<Project>(`/projects/${id}`, data),

  /** 删除项目 */
  delete: (id: string) => api.delete(`/projects/${id}`),

  /** 保存项目版本 */
  saveVersion: (projectId: string, data: Partial<ProjectVersion>) =>
    api.post<ProjectVersion>(`/project-versions`, { ...data, projectId }),

  /** 保存组和明细（后端返回完整组，含明细；saveGroups 依赖返回的 id 同步状态） */
  saveGroup: (projectId: string, versionId: string, data: { id?: string; projectId?: string; versionId?: string; groupNo: number; groupType: string; name: string; isFixed?: boolean; items?: Partial<GroupItem>[] }) =>
    api.post<Group>('/project-groups', { ...data, projectId, versionId }),

  deleteGroup: (id: string) =>
    api.delete(`/project-groups/${id}`),

  /** 删除指定版本的所有组和明细（保存时清理不存在的数据） */
  deleteGroupsByVersion: (versionId: string) =>
    api.delete(`/project-groups/by-version/${versionId}`),

  /** 更新项目版本的审核状态 */
};
