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

  getDownloadUrl: (deliveryId: string, fileId: string) => {
    const token = localStorage.getItem('budget_token') || '';
    return `${(import.meta.env.VITE_API_BASE || '/api/v1')}/deliveries/${deliveryId}/files/${fileId}/download?token=${encodeURIComponent(token)}`;
  },

  delete: (deliveryId: string, fileId: string) =>
    api.delete(`/deliveries/${deliveryId}/files/${fileId}`),
};
