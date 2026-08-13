import { api, toCamel } from '../utils/api';

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
      body: formData, // ⚠️ L6：认证在 HttpOnly cookie（同源自动携带），无需 Authorization header；不设 headers 让浏览器自动带 multipart 边界
    }).then(async res => {
      if (!res.ok) throw new Error('上传失败');
      // ⚠️ D5 修复：原生 fetch 不经 api.ts 自动 toCamel，须手动转换与 DeliveryFile 类型对齐
      const data = await res.json();
      return toCamel(data) as DeliveryFile;
    });
  },

  /** 下载文件并返回 Blob URL（⚠️ F7 修复：不再把 JWT 放 URL query，避免 token 进服务器日志/浏览器历史/Referer；
   *  ⚠️ L6：token 现居 HttpOnly cookie，同源 fetch 自动携带，无需任何 header 也无 token 入 URL；
   *  ⚠️ B37：调用方消费该 URL 后必须 URL.revokeObjectURL(url)（见 DeliveryDetail.handleViewFile）——不回收则每次下载泄漏一个 Blob 对象 */
  download: async (deliveryId: string, fileId: string): Promise<string> => {
    /* eslint-disable-next-line no-direct-fetch/no-fetch -- 需取 Blob，api.ts JSON 编码不适用 */
    const res = await fetch(`${(import.meta.env.VITE_API_BASE || '/api/v1')}/deliveries/${deliveryId}/files/${fileId}/download`);
    if (!res.ok) throw new Error('下载失败');
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  },

  delete: (deliveryId: string, fileId: string) =>
    api.delete(`/deliveries/${deliveryId}/files/${fileId}`),
};
