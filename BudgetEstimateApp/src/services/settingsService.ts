import { api } from '../utils/api';

export interface UserSettings {
  saAnnualTarget?: string;
  saTargetGP3?: string;
  saAnnualSalesTarget?: string;
  [key: string]: string | undefined;
}

export const settingsService = {
  /** 获取当前用户的所有设置 */
  get: () => api.get<UserSettings>('/settings'),

  /** 批量保存设置 */
  save: (settings: Record<string, string>) =>
    api.put<{ success: boolean }>('/settings', settings),
};
