/**
 * 首页聚合接口 —— 对齐后端 src/modules/home/home.controller.ts
 * GET /home 一次性返回 categories + hotProducts + newProducts，不用发三次请求。
 */
import { http } from '../utils/request';

export const homeApi = {
  get: () => http.get('/home', undefined, { silent: true }),
};
