/**
 * 用户相关接口 —— 对齐后端 src/modules/user/user.controller.ts
 */
import { http } from '../utils/request';

export const userApi = {
  /** 当前用户（启动时用它校验 token 是否还好用） */
  me: () => http.get('/users/me', undefined, { silent: true }),

  /** 改昵称 / 头像 / 性别 / 默认门牌号 */
  updateMe: (data) => http.put('/users/me', data),

  listAddresses: () => http.get('/users/me/addresses', undefined, { silent: true }),
  addAddress: (data) => http.post('/users/me/addresses', data),
  updateAddress: (id, data) => http.put(`/users/me/addresses/${id}`, data),
  removeAddress: (id) => http.del(`/users/me/addresses/${id}`),
};
