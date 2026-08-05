import { api } from '../utils/api';

export interface DeliveryFile {
  id: string;
  fileType: string;
  fileName: string;
  fileSize: number;
  createdAt: string;
}

export const deliveryFileService = {
  list: (deliveryId: string) =>
    api.get<DeliveryFile[]>(`/deliveries/${deliveryId}/files`),

  upload: (deliveryId: string, fileType: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('file_type', fileType);
    /* eslint-disable-next-line no-direct-fetch/no-fetch -- multipart form-data 不支持 api.ts 的 JSON 编码 */
    return fetch(`${(import.meta.env.VITE_API_BASE || '/api/v1')}/deliveries/${deliveryId}/files`, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + (localStorage.getItem('budget_token') || '') },
      body: formData,
    }).then(res => {
      if (!res.ok) throw new Error('上传失败');
      return res.json();
    });
  },

  /** 下载文件并返回 Blob URL（⚠️ F7 修复：不再把 JWT 放 URL query，改用 fetch 带 Authorization 头，
   *  避免 token 进服务器日志/浏览器历史/Referer；原 window.open(?token=) 路径因 requireAuth 在挂载层先执行实际是 401） */
  download: async (deliveryId: string, fileId: string): Promise<string> => {
    /* eslint-disable-next-line no-direct-fetch/no-fetch -- 需带 Authorization 头取 Blob，api.ts JSON 编码不适用 */
    const res = await fetch(`${(import.meta.env.VITE_API_BASE || '/api/v1')}/deliveries/${deliveryId}/files/${fileId}/download`, {
      headers: { Authorization: 'Bearer ' + (localStorage.getItem('budget_token') || '') },
    });
    if (!res.ok) throw new Error('下载失败');
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  },

  delete: (deliveryId: string, fileId: string) =>
    api.delete(`/deliveries/${deliveryId}/files/${fileId}`),
};
