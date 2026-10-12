/**
 * 订单接口 —— 对齐后端 src/modules/order/order.controller.ts
 *
 * 三条容易踩的约定：
 *
 * 1) **`preview` 和 `create` 共用同一份入参结构**（后端的 `OrderSourceDto`）：
 *    `items[]`（直购）或 `cartIds[]`（购物车结算），**二选一**。
 *    两个都不传 → 后端 `50004 CART_EMPTY`。
 *    前端只要保证「预览用什么参数、下单就用什么参数」，
 *    金额就一定和结算栏显示的一致（预览和服务端用的是同一段 resolveLines）。
 *
 * 2) **`POST /orders` 的响应是完整订单详情**（OrderDetailVo），不是 `{ orderId }`。
 *    所以下单成功后**不用再查一次详情**，直接把返回值带进成功页/详情页即可。
 *    另外后端在下单事务里**自己删掉了用到的购物车行**，
 *    前端只需 `cartStore.refresh()` 让角标归位。
 *
 * 3) 路由顺序在后端是 `preview` 在 `:id` **之前**声明的，所以
 *    `/orders/preview` 不会被 `/orders/:id` 抢走。前端不用做任何规避。
 *
 * 全部需要登录（控制器没有 @Public）。
 */
import { http } from '../utils/request';

export const orderApi = {
  /**
   * POST /orders/preview —— 结算预览（不落库、不扣库存）
   * @param {{ items?: {productId:number,quantity:number}[], cartIds?: number[] }} dto
   * @returns {Promise<{items:Array, unitCount:number, totalQuantity:number, totalAmount:number}>}
   */
  preview: (dto) => http.post('/orders/preview', dto),

  /**
   * POST /orders —— 提交订单
   * @param {object} dto OrderSourceDto + { roomNo, contactName, contactPhone, remark? }
   * @returns {Promise<object>} OrderDetailVo
   */
  create: (dto) => http.post('/orders', dto),

  /** GET /orders —— 我的订单列表（query: status? / page / pageSize） */
  list: (query) => http.get('/orders', query),

  /** GET /orders/:id —— 订单详情 */
  detail: (id) => http.get(`/orders/${id}`),

  /** POST /orders/:id/cancel —— 顾客自助取消（只允许 PENDING / DELIVERING） */
  cancel: (id, data) => http.post(`/orders/${id}/cancel`, data),
};
