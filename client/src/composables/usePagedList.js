/**
 * 分页列表通用逻辑
 *
 * 首页 / 分类页 / 商品列表页 / （S7-3 的订单页）都是同一套「首屏 + 触底加载更多」，
 * 抽出来是为了让「什么情况下算加载失败、到底了之后还能不能再拉」这类边界
 * 只有一处实现。曾经见过三个页面各写一遍，然后其中两个忘了处理 `hasMore`。
 *
 * 用法：
 *   const pager = usePagedList((page, pageSize) => catalogApi.products({ ...params, page, pageSize }));
 *   pager.load(true)     // 首屏 / 重新筛选（重置到第 1 页）
 *   pager.loadMore()     // 触底
 *
 * 页面还要自己做两件事（放不进这里，因为依赖页面生命周期）：
 *   · onReachBottom -> pager.loadMore()
 *   · onPullDownRefresh -> await pager.load(true) 之后 uni.stopPullDownRefresh()
 */
import { computed, ref, shallowRef } from 'vue';

export function usePagedList(fetcher, options = {}) {
  const pageSize = options.pageSize || 10;
  /** 后端信封里 total 可能缺失，这时候只能用「本页拿满没拿满」来判断还有没有下一页 */
  const looseEnd = options.looseEnd !== false;

  const list = shallowRef([]);
  const page = ref(0);
  const total = ref(0);
  const hasMore = ref(true);

  /** idle | loading | error | end */
  const state = ref('idle');
  /** 首屏是否已经成功加载过一次 —— 用来区分「空」和「还没开始加载」 */
  const ready = ref(false);
  /** 首屏失败时要展示的是整页错误态，而不是列表底部的重试条 */
  const firstError = ref(null);

  const isEmpty = computed(() => ready.value && list.value.length === 0);
  const isFirstLoading = computed(() => !ready.value && state.value === 'loading');

  /** 防止并发：触底事件会连续触发好几次，不加锁会重复请求同一页 */
  let inflight = false;

  async function fetchPage(targetPage) {
    if (inflight) return;
    inflight = true;
    state.value = 'loading';
    try {
      const res = await fetcher(targetPage, pageSize);
      const rows = Array.isArray(res?.list) ? res.list : [];

      if (targetPage === 1) {
        list.value = rows;
      } else {
        // 用 id 去重：翻页期间如果有新商品插进来，会导致同一条出现两次
        const seen = new Set(list.value.map((it) => it.id));
        list.value = [...list.value, ...rows.filter((it) => !seen.has(it.id))];
      }

      page.value = targetPage;
      total.value = Number(res?.total) || 0;

      // 三种「到底了」的判定，按可靠性从高到低：
      //  1) 后端给了 hasMore，直接信它
      //  2) 后端给了 total，比已加载数量
      //  3) 都没给（或给了 0），就看这一页有没有拿满
      if (typeof res?.hasMore === 'boolean') {
        hasMore.value = res.hasMore;
      } else if (total.value > 0) {
        hasMore.value = list.value.length < total.value;
      } else if (looseEnd) {
        hasMore.value = rows.length >= pageSize;
      } else {
        hasMore.value = false;
      }

      if (rows.length === 0) hasMore.value = false;

      ready.value = true;
      firstError.value = null;
      state.value = hasMore.value ? 'idle' : 'end';
    } catch (err) {
      state.value = 'error';
      // 首屏失败要能被页面捞出来渲染整页错误态
      if (!ready.value) firstError.value = err;
      throw err;
    } finally {
      inflight = false;
    }
  }

  /** 重新从第 1 页加载；`reset` 用于换筛选条件时把旧数据立即清掉 */
  async function load(silentThrow = false) {
    try {
      await fetchPage(1);
    } catch (err) {
      if (!silentThrow) throw err;
    }
  }

  /** 触底加载下一页；已到底 / 正在加载 / 上次失败未重试，都不会再发请求 */
  async function loadMore() {
    if (!ready.value) return;
    if (!hasMore.value) return;
    if (state.value === 'loading') return;
    if (state.value === 'error') return;
    try {
      await fetchPage(page.value + 1);
    } catch {
      // 失败状态已经在 state 里，页面会渲染「点此重试」
    }
  }

  /** 失败后手动重试（底部那条） */
  async function retry() {
    if (state.value !== 'error') return;
    try {
      await fetchPage(page.value + 1);
    } catch {
      /* 保持 error 状态 */
    }
  }

  /** 彻底清空，用于切换分类/关键词 */
  function clear() {
    list.value = [];
    page.value = 0;
    total.value = 0;
    hasMore.value = true;
    state.value = 'idle';
    ready.value = false;
    firstError.value = null;
  }

  return {
    list,
    page,
    pageSize,
    total,
    hasMore,
    state,
    ready,
    isEmpty,
    isFirstLoading,
    firstError,
    load,
    loadMore,
    retry,
    clear,
  };
}
