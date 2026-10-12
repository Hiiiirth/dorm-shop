/** 购物车中的一项（带商品的实时信息快照） */
export interface CartItemVo {
  id: number;
  productId: number;
  name: string;
  coverImage: string;
  /** 商品实时单价，单位：分 */
  price: number;
  /** 划线原价，单位：分 */
  originalPrice: number | null;
  unit: string;
  /** 商品实时库存 */
  stock: number;
  quantity: number;
  /** 1 勾选 0 未勾选 */
  selected: number;
  /** price × quantity，单位：分 */
  subtotal: number;
  /**
   * 是否可结算。
   * 商品下架、被删除、或库存不够时为 false —— 前端要置灰并显示原因，
   * 而不是直接从列表里抹掉，否则用户会以为是自己没加进来。
   */
  available: boolean;
  unavailableReason: string | null;
}

/** 购物车整体（含合计） */
export interface CartVo {
  list: CartItemVo[];
  /** 购物车里的条目数 */
  itemCount: number;
  /** 已勾选且可结算的条目数 */
  selectedItemCount: number;
  /** 已勾选且可结算的商品总件数 */
  totalQuantity: number;
  /** 已勾选且可结算的金额合计，单位：分 */
  totalAmount: number;
}
