<template>
  <view class="tl">
    <view v-for="(log, i) in rows" :key="i" class="tl__row" :class="{ 'tl__row--last': i === rows.length - 1 }">
      <!-- 左侧：圆点 + 竖线 -->
      <view class="tl__rail">
        <view class="tl__dot" :class="[`tl__dot--${log.variant}`, { 'tl__dot--head': i === 0 }]">
          <!-- ⚠️ `color="#ffffff"`：小程序端 `<image>` 不吃 CSS color。
               下面所有 `.tl__dot--head.tl__dot--xxx { color: $color-text-inverse }` 都是白，
               所以这里给固定白即可（图标只在 i===0 的 head 实心点上渲染）。-->
          <AppIcon v-if="i === 0" :name="log.icon" :size="11" :stroke-width="3" color="#ffffff" />
        </view>
        <view v-if="i !== rows.length - 1" class="tl__line" />
      </view>

      <!-- 右侧：状态文案 + 时间 + 备注 -->
      <view class="tl__body">
        <view class="tl__head">
          <text class="tl__title">{{ log.title }}</text>
          <text class="tl__time">{{ log.time }}</text>
        </view>
        <text v-if="log.remark" class="tl__remark">{{ log.remark }}</text>
        <text v-if="log.operator" class="tl__op">{{ log.operator }}</text>
      </view>
    </view>
  </view>
</template>

<script setup>
/**
 * 订单状态轨迹 · 竖排时间线
 *
 * 数据源是 OrderDetailVo.statusLogs（后端已按时间**正序**返回），
 * 但界面上「最新一条在最上面」更符合直觉 —— 所以组件内部**倒序**渲染，
 * 并且把倒序后的第 0 条（也就是真正的最新一条）做**加重**：
 * 实底圆点 + 图标 + 深色标题，其余是空心小点。
 *
 * 每次流转后端都会写一条 log，其中第一跳的 fromStatus 是空串（''）——
 * 那代表「订单创建」，不能渲染成「'' → 待接单」，所以文案单独处理。
 */
import { computed } from 'vue';
import AppIcon from './AppIcon.vue';
import { ORDER_STATUS_TEXT, ORDER_STATUS_VARIANT } from '../utils/constants';
import { formatDateTime } from '../utils/format';

const props = defineProps({
  /** OrderDetailVo.statusLogs */
  logs: { type: Array, default: () => [] },
  /** 订单创建时间：statusLogs 为空时的兜底（老数据可能没有 log） */
  createdAt: { type: [Number, String], default: 0 },
});

const ROLE_TEXT = {
  CUSTOMER: '顾客操作',
  ADMIN: '店长操作',
};

const rows = computed(() => {
  const list = Array.isArray(props.logs) ? props.logs : [];

  // 没有任何轨迹时，至少把「提交订单」这一条补出来，别显示空白
  if (!list.length) {
    return [
      {
        title: '提交订单',
        time: formatDateTime(props.createdAt),
        remark: '',
        operator: '',
        variant: 'warning',
        icon: 'clock',
      },
    ];
  }

  return list
    .slice()
    .reverse()
    .map((log) => {
      const variant = ORDER_STATUS_VARIANT[log.toStatus]?.variant || 'muted';
      const icon = ORDER_STATUS_VARIANT[log.toStatus]?.icon || 'clock';

      // 第一跳：fromStatus 为空 → 这是「订单创建」，不是状态流转
      const isCreate = !log.fromStatus;
      const title = isCreate
        ? '提交订单'
        : `${ORDER_STATUS_TEXT[log.fromStatus] || log.fromStatus} → ${
            ORDER_STATUS_TEXT[log.toStatus] || log.toStatus
          }`;

      return {
        title,
        time: formatDateTime(log.createdAt),
        remark: (log.remark || '').trim(),
        operator: log.operatorRole ? ROLE_TEXT[log.operatorRole] || log.operatorRole : '',
        variant,
        icon,
      };
    });
});
</script>

<style lang="scss" scoped>
.tl {
  display: flex;
  flex-direction: column;
}

.tl__row {
  display: flex;
  align-items: stretch;
  gap: $space-3;
}

/* ---------------------------------------------------------------- 左侧轨道 */
.tl__rail {
  flex: none;
  width: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  /* 圆点中心对齐第一行文字中线（行高 20px → 圆心 10px） */
  padding-top: 1px;
}

.tl__dot {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 12px;
  height: 12px;
  border-radius: $radius-pill;
  border: 2px solid $color-border-strong;
  background-color: $color-surface;
  box-sizing: border-box;
}

/* 最新一条：实底 + 图标 + 白字，和下面几条拉开层次 */
.tl__dot--head {
  width: 20px;
  height: 20px;
  border: none;
  margin-top: -3px;
}

.tl__dot--warning {
  border-color: $color-warning;
}
.tl__dot--head.tl__dot--warning {
  background-color: $color-warning;
  color: $color-text-inverse;
}

.tl__dot--action {
  border-color: $color-action;
}
.tl__dot--head.tl__dot--action {
  background-color: $color-action;
  color: $color-text-inverse;
}

/* 实底变体在轨迹里退化成一个实心橙点（不用纯 #C7450A 铺满 20px，
   那个在浅背景上太抢；用 action 更柔和） */
.tl__dot--solid {
  border-color: $color-action;
}
.tl__dot--head.tl__dot--solid {
  background-color: $color-action;
  color: $color-text-inverse;
}

.tl__dot--success {
  border-color: $color-success;
}
.tl__dot--head.tl__dot--success {
  background-color: $color-success;
  color: $color-text-inverse;
}

.tl__dot--muted {
  border-color: $color-text-muted;
}
.tl__dot--head.tl__dot--muted {
  background-color: $color-text-muted;
  color: $color-text-inverse;
}

.tl__line {
  flex: 1;
  width: 2px;
  min-height: 16px;
  margin: 3px 0;
  background-color: $color-border-subtle;
  border-radius: 1px;
}

/* ---------------------------------------------------------------- 右侧内容 */
.tl__body {
  flex: 1;
  min-width: 0;
  padding-bottom: $space-4;
}

.tl__row--last .tl__body {
  padding-bottom: 0;
}

.tl__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: $space-2;
  min-height: 20px;
}

.tl__title {
  flex: 1;
  min-width: 0;
  font-size: $font-size-sm;
  font-weight: $font-weight-medium;
  color: $color-text-primary;
}

/* 非最新一条整体降一档，视觉重心自然落在最上面 */
.tl__row:not(:first-child) .tl__title {
  font-weight: $font-weight-regular;
  color: $color-text-secondary;
}

.tl__time {
  flex: none;
  font-size: $font-size-xs;
  color: $color-text-muted;
}

.tl__remark {
  display: block;
  margin-top: 3px;
  font-size: $font-size-xs;
  line-height: 1.6;
  color: $color-text-secondary;
}

.tl__op {
  display: block;
  margin-top: 2px;
  font-size: $font-size-xs;
  color: $color-text-muted;
}
</style>
