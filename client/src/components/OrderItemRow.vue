<template>
  <view class="orow" :class="{ 'orow--tappable': tappable }" @tap="onTap">
    <ProductImage
      class="orow__img"
      :src="item.coverImage"
      :name="item.name"
      :size="thumbSize"
      :mono-size="monoSize"
      radius="sm"
    />

    <view class="orow__main">
      <text class="orow__name">{{ item.name }}</text>
      <text class="orow__meta">¥{{ unitPriceText }} × {{ item.quantity }}</text>
    </view>

    <view class="orow__right">
      <text class="orow__subtotal">¥{{ subtotalText }}</text>
      <AppIcon
        v-if="tappable"
        class="orow__arrow"
        name="forward"
        :size="14"
        color="#9AA2AF"
      />
    </view>
  </view>
</template>

<script setup>
/**
 * 订单商品行
 *
 * 关键点：**永远显示快照名**（`item.name`），不去关联当前商品表。
 * 后端下单时把 name/cover/unitPrice 都存了一份快照，
 * 所以商品改名、下架、被删，历史订单显示的内容都不会变。
 * 这也是为什么这里没有「点击进商品详情」的默认行为 —— 商品可能已经不存在了。
 *
 * 金额全部是「分」，展示时才除 100（走 money.js，不要自己 /100）。
 */
import { computed } from 'vue';
import AppIcon from './AppIcon.vue';
import ProductImage from './ProductImage.vue';
import { formatYuan } from '../utils/money';

const props = defineProps({
  /** OrderItemVo: { productId, name, coverImage, unitPrice(分), quantity, subtotal(分) } */
  item: { type: Object, required: true },
  /** 缩略图边长（px）。订单列表用小图，详情页可以放大 */
  thumb: { type: Number, default: 56 },
  /** 是否显示右侧箭头（表示可点）。默认不可点，因为商品可能已不存在 */
  tappable: { type: Boolean, default: false },
});

const emit = defineEmits(['tap']);

/** ProductImage 的 size / monoSize 都要**字符串**（宽高比 1:1） */
const thumbSize = computed(() => `${props.thumb}px`);
const monoSize = computed(() => `${Math.round(props.thumb * 0.44)}px`);

const unitPriceText = computed(() => formatYuan(props.item.unitPrice, { withSymbol: false }));
const subtotalText = computed(() => formatYuan(props.item.subtotal, { withSymbol: false }));

function onTap() {
  if (props.tappable) emit('tap', props.item);
}
</script>

<style lang="scss" scoped>
.orow {
  display: flex;
  align-items: center;
  gap: $space-3;
}

.orow__img {
  flex: none;
}

.orow__main {
  flex: 1;
  /* flex 子项放长字符串必须 min-width:0，否则不收缩、把右边挤出去 */
  min-width: 0;
}

.orow__name {
  display: block;
  font-size: $font-size-sm;
  color: $color-text-primary;
  /* 两行截断：商品名可能很长（「农夫山泉天然矿泉水 550ml 整箱」） */
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.orow__meta {
  display: block;
  margin-top: 4px;
  font-size: $font-size-xs;
  color: $color-text-muted;
}

.orow__right {
  flex: none;
  display: flex;
  align-items: center;
  gap: 4px;
}

.orow__subtotal {
  font-size: $font-size-sm;
  font-weight: $font-weight-medium;
  color: $color-text-primary;
}

.orow__arrow {
  flex: none;
}
</style>
