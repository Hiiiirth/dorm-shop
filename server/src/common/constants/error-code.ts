/**
 * 全局错误码
 *
 * 分段规则：
 *   0      成功
 *   10xxx  通用 / 参数
 *   20xxx  认证鉴权
 *   30xxx  用户
 *   40xxx  商品分类
 *   50xxx  订单
 *   90xxx  系统
 */
export enum ErrorCode {
  SUCCESS = 0,

  // ---- 10xxx 通用 / 参数 ----
  PARAM_INVALID = 10001,
  RESOURCE_NOT_FOUND = 10002,
  TOO_MANY_REQUESTS = 10003,

  // ---- 20xxx 认证鉴权 ----
  UNAUTHORIZED = 20001,
  TOKEN_EXPIRED = 20002,
  FORBIDDEN = 20003,
  ACCOUNT_DISABLED = 20004,

  // ---- 30xxx 用户 ----
  USER_NOT_FOUND = 30001,
  PHONE_ALREADY_EXIST = 30002,
  ROLE_NOT_GRANTED = 30003,
  /** 不能给自己降权（防止管理员把自己锁在外面） */
  ROLE_PROTECTED = 30004,

  // ---- 40xxx 商品分类 ----
  PRODUCT_NOT_FOUND = 40001,
  PRODUCT_OFF_SHELF = 40002,
  STOCK_NOT_ENOUGH = 40003,
  CATEGORY_NOT_FOUND = 40004,
  /** 分类下还有子分类，不能删 */
  CATEGORY_HAS_CHILDREN = 40005,
  /** 分类下还有商品，不能删 */
  CATEGORY_HAS_PRODUCTS = 40006,
  /** 商品有在办订单，不能删（建议下架） */
  PRODUCT_IN_USE = 40007,

  // ---- 50xxx 订单 ----
  ORDER_NOT_FOUND = 50001,
  ORDER_STATUS_INVALID = 50002,
  ORDER_NOT_OWNED = 50003,
  CART_EMPTY = 50004,

  // ---- 90xxx 系统 ----
  SERVER_ERROR = 90001,
  SERVICE_UNAVAILABLE = 90002,
}

/** 默认中文提示，可直接被前端 toast */
export const ERROR_MESSAGE: Record<number, string> = {
  [ErrorCode.SUCCESS]: 'ok',

  [ErrorCode.PARAM_INVALID]: '参数校验失败',
  [ErrorCode.RESOURCE_NOT_FOUND]: '请求的资源不存在',
  [ErrorCode.TOO_MANY_REQUESTS]: '操作过于频繁，请稍后再试',

  [ErrorCode.UNAUTHORIZED]: '请先登录',
  [ErrorCode.TOKEN_EXPIRED]: '登录已过期，请重新登录',
  [ErrorCode.FORBIDDEN]: '没有操作权限',
  [ErrorCode.ACCOUNT_DISABLED]: '账号已被禁用',

  [ErrorCode.USER_NOT_FOUND]: '用户不存在',
  [ErrorCode.PHONE_ALREADY_EXIST]: '该手机号已注册',
  [ErrorCode.ROLE_NOT_GRANTED]: '当前账号未开通该身份',
  [ErrorCode.ROLE_PROTECTED]: '不能给自己降权',

  [ErrorCode.PRODUCT_NOT_FOUND]: '商品不存在',
  [ErrorCode.PRODUCT_OFF_SHELF]: '商品已下架',
  [ErrorCode.STOCK_NOT_ENOUGH]: '库存不足',
  [ErrorCode.CATEGORY_NOT_FOUND]: '分类不存在',
  [ErrorCode.CATEGORY_HAS_CHILDREN]: '该分类下还有子分类，请先删除子分类',
  [ErrorCode.CATEGORY_HAS_PRODUCTS]: '该分类下还有商品，请先移走或删除商品',
  [ErrorCode.PRODUCT_IN_USE]: '该商品还有未完成的订单，请改用「下架」',

  [ErrorCode.ORDER_NOT_FOUND]: '订单不存在',
  [ErrorCode.ORDER_STATUS_INVALID]: '当前订单状态不允许该操作',
  [ErrorCode.ORDER_NOT_OWNED]: '无权操作他人的订单',
  [ErrorCode.CART_EMPTY]: '购物车是空的',

  [ErrorCode.SERVER_ERROR]: '服务开小差了，请稍后再试',
  [ErrorCode.SERVICE_UNAVAILABLE]: '服务暂不可用',
};

/** 取默认中文提示 */
export function errorMessage(code: number, fallback = '请求失败'): string {
  return ERROR_MESSAGE[code] ?? fallback;
}
