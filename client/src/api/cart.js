/**
 * 购物车接口 —— 对齐后端 src/modules/cart/cart.controller.ts
 *
 * S7-1 只用到 add（商详页的「加入购物车」）。
 * 列表 / 改数量 / 删除留给 S7-2，但接口先一并写好，
 * 免得 S7-2 再回头动这个文件。
 *
 * 注意：这里**全部需要登录**（控制器没有 @Public）→ 未登录会拿 401 + 20001。
 */
import { http } from '../utils/request';

export const cartApi = {
  /** GET /cart —— 列表 + 合计（含 unavailable / unavailableReason） */
  list: () => http.get('/cart'),

  /** POST /cart —— 加入购物车 { productId, quantity } */
  add: (productId, quantity = 1) => http.post('/cart', { productId, quantity }),

  /** PUT /cart/:id —— 改数量 / 勾选。selected 只传 0 或 1，别传布尔 */
  update: (id, patch) => http.put(`/cart/${id}`, patch),

  /** DELETE /cart/:id */
  remove: (id) => http.del(`/cart/${id}`),

  /** DELETE /cart —— 清空 */
  clear: () => http.del('/cart'),
};
