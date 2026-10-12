/**
 * 购物车 store
 *
 * 这是一个**服务端为准**的 store：唯一的数据来源是 `GET /cart` 返回的 CartVo，
 * 所有写操作（加购 / 改数量 / 勾选 / 删）都用接口**返回的整个 CartVo** 覆盖本地。
 * 所以这里没有「乐观更新」—— 后端每次都把重算好的 totalAmount 一并返回，
 * 本地再算一遍既多余又容易和后端算得不一样（库存、上下架都会影响合计）。
 *
 * 接口契约（backend `cart.vo.ts`）：
 *   CartItemVo { id, productId, name, coverImage, price(分), originalPrice(分|null),
 *                unit, stock, quantity, selected(0|1), subtotal(分),
 *                available, unavailableReason }
 *   CartVo     { list[], itemCount, selectedItemCount, totalQuantity, totalAmount(分) }
 *
 * ⚠️ `selected` 是 TINYINT，传 0 / 1，**不是布尔**。
 *    后端 `UpdateCartDto` 用的是 `@IsIn([0, 1])`，传 true 会被 10001 拒掉。
 *
 * ⚠️ `available: false` 的条目（下架 / 库存不足）**后端故意不筛掉**，
 *    要原样渲染成置灰条目并显示 `unavailableReason`。
 *    它们也**不计入** totalAmount / totalQuantity / selectedItemCount。
 */
import { defineStore } from 'pinia';
import { cartApi } from '../api/cart';
import { MAX_CART_QUANTITY } from '../utils/constants';

export const useCartStore = defineStore('cart', {
  state: () => ({
    /** 购物车里的条目数，用于 tab 角标；0 时 tab 不显示角标 */
    count: 0,
    /** 是否已经成功拉过一次（避免反复请求） */
    loaded: false,
    /** 服务端快照 CartVo；购物车页直接渲染它 */
    snapshot: null,
    /** 首屏骨架：只在「还没拿到过数据」时为 true，后续刷新不闪骨架 */
    loading: false,
    /** 上次拉取失败的原始错误，供空态区分「空的」和「拉不到」 */
    error: null,
    /** 正在提交的条目 id 集合，用于禁用那一条的步进器 */
    pendingIds: [],
  }),

  getters: {
    /** tab 角标数字 */
    badge: (state) => (state.count > 0 ? state.count : 0),

    /** 条目列表（永远给数组，页面不用 `?.list || []`） */
    items: (state) => state.snapshot?.list || [],

    /** 有效（可结算）的条目 */
    availableItems: (state) => (state.snapshot?.list || []).filter((it) => it.available),

    /** 失效条目：下架 / 库存不足。要置灰**保留**在列表里 */
    unavailableItems: (state) => (state.snapshot?.list || []).filter((it) => !it.available),

    /** 是否一件可结算的东西都没有 */
    isEmpty: (state) => !state.snapshot || (state.snapshot.itemCount || 0) === 0,

    /**
     * 已勾选**且**可结算的条目（用于「结算」按钮的入参 cartIds）
     * 故意用 available 过滤：失效条目不该进订单，后端也会报 40002/40003
     */
    selectedItems: (state) =>
      (state.snapshot?.list || []).filter((it) => it.available && Number(it.selected) === 1),

    /** 已勾选的合计金额（分）—— 直接用服务端的 totalAmount */
    totalAmount: (state) => state.snapshot?.totalAmount || 0,
    /** 已勾选的件数 */
    totalQuantity: (state) => state.snapshot?.totalQuantity || 0,
    /** 已勾选的可结算条目数 */
    selectedItemCount: (state) => state.snapshot?.selectedItemCount || 0,

    /** 全选态：有可结算条目，且它们全都勾上了 */
    allSelected: (state) => {
      const list = (state.snapshot?.list || []).filter((it) => it.available);
      return list.length > 0 && list.every((it) => Number(it.selected) === 1);
    },

    /** 是否可以点「结算」 */
    canCheckout: (state) => (state.snapshot?.selectedItemCount || 0) > 0,

    /** 某条是否正在提交（禁用它的按钮防重复点） */
    isPending: (state) => (id) => state.pendingIds.includes(id),
  },

  actions: {
    // -----------------------------------------------------------------------
    // 读
    // -----------------------------------------------------------------------
    /** 拉一次购物车；未登录直接归零，不打接口（会白拿一个 401） */
    async refresh() {
      // 动态 import 是为了不在模块顶层引入 user store —— 两个 store 互相引会成环
      const { useUserStore } = await import('./user');
      if (!useUserStore().isLogin) {
        this.reset();
        return null;
      }

      // 只有「从没拿到过数据」时才亮骨架，否则改个数量就整页闪一下
      if (!this.snapshot) this.loading = true;

      try {
        const vo = await cartApi.list();
        this.applySnapshot(vo);
        this.error = null;
        return vo;
      } catch (err) {
        // 拉取失败要和「购物车是空的」区分开，空态文案完全不同
        this.error = err || { message: '购物车加载失败' };
        return null;
      } finally {
        this.loading = false;
      }
    },

    // -----------------------------------------------------------------------
    // 写 —— 每个都是「调接口 → 用返回值整份覆盖」
    // -----------------------------------------------------------------------
    /**
     * 加入购物车
     * `POST /cart` 内部就是 `return this.list()`，所以返回值就是整个 CartVo，
     * 不需要加购完再查一次列表。
     * @returns {Promise<number>} 加购后的条目数
     */
    async add(productId, quantity = 1) {
      const vo = await cartApi.add(productId, quantity);
      this.applySnapshot(vo);
      return this.count;
    },

    /**
     * 改数量。clamp 到 [1, min(stock, 99)]，超界直接不发请求 ——
     * 后端超库存会报 40003，前端先挡住比「点了才被拒」体验好。
     * 失效条目（stock 为 0）不允许改数量，直接 return。
     */
    async setQuantity(item, nextQuantity) {
      const cap = Math.max(1, Math.min(Number(item.stock) || 0, MAX_CART_QUANTITY));
      const q = Math.max(1, Math.min(Math.round(Number(nextQuantity) || 1), cap));
      if (q === Number(item.quantity)) return null;
      return this.patch(item.id, { quantity: q });
    },

    /** 单条加减；step 为 +1 / -1 */
    stepQuantity(item, step) {
      return this.setQuantity(item, Number(item.quantity) + step);
    },

    /** 勾选 / 取消勾选（selected 传 0 | 1，不是布尔） */
    setSelected(item, selected) {
      const next = selected ? 1 : 0;
      if (Number(item.selected) === next) return null;
      return this.patch(item.id, { selected: next });
    },

    /** 单条切换勾选 */
    toggleSelected(item) {
      return this.setSelected(item, Number(item.selected) !== 1);
    },

    /** 全选 / 全不选 —— 只操作**可结算**的条目，失效的不动 */
    async setAllSelected(selected) {
      const targets = this.availableItems.filter((it) => Number(it.selected) !== (selected ? 1 : 0));
      if (!targets.length) return null;

      // 后端没有「批量勾选」接口，只能逐条 PUT。并发发出去，
      // 只保留**最后一次**返回值落库（最后一次响应里的 list 已包含全部改动）。
      const results = await Promise.allSettled(
        targets.map((it) => cartApi.update(it.id, { selected: selected ? 1 : 0 })),
      );
      const lastOk = [...results].reverse().find((r) => r.status === 'fulfilled');
      if (lastOk) this.applySnapshot(lastOk.value);

      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed) {
        // 有条目失败就重新拉一次，让界面回到服务端的真实状态
        await this.refresh();
        throw results.find((r) => r.status === 'rejected').reason;
      }
      return lastOk ? lastOk.value : null;
    },

    /** 删除单条 */
    async removeItem(id) {
      const vo = await cartApi.remove(id);
      this.applySnapshot(vo);
      return vo;
    },

    /** 清空 */
    async clearAll() {
      await cartApi.clear();
      // 清空接口不返回 CartVo（后端返回 null），手动落一个空快照
      this.applySnapshot({ list: [], itemCount: 0, selectedItemCount: 0, totalQuantity: 0, totalAmount: 0 });
    },

    /**
     * 把服务端返回值落进 state。
     * 所有写操作都走这里，保证 count / snapshot 永远一致。
     */
    applySnapshot(vo) {
      this.snapshot = vo || null;
      this.count = vo?.itemCount || 0;
      this.loaded = true;
      this.error = null;
    },

    /** 本地打 pending 标记（同一条在飞时不重复发） */
    async patch(id, body) {
      if (this.pendingIds.includes(id)) return null;
      this.pendingIds = [...this.pendingIds, id];
      try {
        const vo = await cartApi.update(id, body);
        this.applySnapshot(vo);
        return vo;
      } finally {
        this.pendingIds = this.pendingIds.filter((x) => x !== id);
      }
    },

    reset() {
      this.count = 0;
      this.loaded = false;
      this.snapshot = null;
      this.loading = false;
      this.error = null;
      this.pendingIds = [];
    },
  },
});
