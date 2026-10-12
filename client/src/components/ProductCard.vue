<template>
  <view
    class="pcard"
    :class="[`pcard--${mode}`, { 'pcard--off': isOff }]"
    hover-class="pcard--hover"
    :hover-stay-time="60"
    @tap="$emit('tap', product)"
  >
    <ProductImage
      class="pcard__img"
      :src="product.coverImage"
      :name="product.name"
      :size="mode === 'grid' ? '100%' : '160rpx'"
      :mono-size="mode === 'grid' ? '88rpx' : '56rpx'"
      :radius="mode === 'grid' ? 'none' : 'sm'"
    />

    <view class="pcard__body">
      <text class="pcard__name ellipsis-2">{{ product.name }}</text>
      <text v-if="product.subtitle" class="pcard__sub ellipsis">{{ product.subtitle }}</text>

      <view class="pcard__meta">
        <text class="pcard__sales">{{ salesText }}</text>
        <text v-if="stockText" class="pcard__stock" :class="`pcard__stock--${stock.level}`">
          {{ stockText }}
        </text>
      </view>

      <view class="pcard__foot">
        <PriceText
          :value="product.price"
          :size="mode === 'grid' ? 'md' : 'sm'"
          :original="showOriginalPrice ? product.originalPrice : null"
        />
        <text v-if="mode === 'list'" class="pcard__unit">/ {{ product.unit }}</text>

        <!-- 加购快捷键：网格卡上只放一个小圆钮，点它不会进详情 -->
        <view v-if="quickAdd && !isOff" class="pcard__add" @tap.stop="$emit('add', product)">
          <AppIcon name="plus" :size="16" color="#ffffff" />
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
/**
 * 商品卡（列表 / 网格两态）
 *
 * 为什么不拆成两个组件：字段完全一样，只有排布不同。
 * 两态共用一套数据映射，改字段时只改一处，不会出现「列表页改了网格页忘改」。
 *
 * 已售罄 / 已下架的处理：**不隐藏**。商品在别的页面（收藏、历史订单）里还在，
 * 直接消失会让人以为「商品没了」；置灰 + 标注原因才是准确的信息。
 * 同理加购按钮在此时不渲染。
 */
import { computed } from 'vue';
import AppIcon from './AppIcon.vue';
import PriceText from './PriceText.vue';
import ProductImage from './ProductImage.vue';
import { formatSales, formatStock } from '../utils/format';

const props = defineProps({
  product: { type: Object, required: true },
  /** grid = 两列网格（首页/分类页）  list = 横向一行（搜索结果） */
  mode: { type: String, default: 'grid' },
  /** 是否显示右下角的快捷加购钮 */
  quickAdd: { type: Boolean, default: true },
});

defineEmits(['tap', 'add']);

const isOff = computed(
  () => props.product.status === 0 || Number(props.product.stock) <= 0,
);

const salesText = computed(() => formatSales(props.product.salesCount));

/**
 * 网格卡**不显示**划线原价。
 *
 * 原因不是审美，是放不下：分类页右栏一列只有 131px，卡片内可用宽度 105px，
 * 而「现价 + 原价 + 快捷加购钮」需要 ~107px。实测 6 倍放大截图里，
 * 原价的删除线直接压到了 + 按钮上（.price 自身 scrollWidth 却报 0 溢出，
 * 光看数值查不出来 —— 所以这条要用几何断言守，见 verify-pages.mjs）。
 *
 * 原价没有丢：列表卡（一整行，宽得多）和商品详情页照常显示。
 */
const showOriginalPrice = computed(() => props.mode === 'list');

/**
 * 已下架时库存文案没意义（会显示「现货充足」误导人），换成明确的状态
 */
const stock = computed(() => formatStock(props.product.stock));
const stockText = computed(() => {
  if (props.product.status === 0) return '已下架';
  return stock.value.level === 'ok' ? '' : stock.value.text;
});
</script>

<style lang="scss" scoped>
.pcard {
  background-color: $color-surface;
  overflow: hidden;
}

.pcard--hover {
  background-color: $color-surface-2;
}

.pcard--off {
  .pcard__name,
  .pcard__sub,
  .pcard__sales {
    color: $color-text-muted;
  }
}

/* ------------------------------------------------------------------ 网格 */
.pcard--grid {
  display: flex;
  flex-direction: column;
  border-radius: $radius-md;

  .pcard__body {
    padding: $space-2 $space-3 $space-3;
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
  }

  .pcard__name {
    font-size: $font-size-sm;
    line-height: 1.35;
    height: 2.7em;
  }

  /* 用 auto 而不是固定 margin：同一行的卡片等高时，
     价格会被顶到底边，几列的价格就在同一条水平线上 */
  .pcard__foot {
    margin-top: auto;
  }
}

/* ------------------------------------------------------------------ 列表 */
.pcard--list {
  display: flex;
  gap: $space-3;
  padding: $space-3;
  border-radius: $radius-md;

  .pcard__body {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
    /* 让底部价格贴住卡片底边 */
    justify-content: space-between;
  }

  .pcard__name {
    font-size: $font-size-md;
    line-height: 1.35;
  }
}

/* ------------------------------------------------------------------ 通用 */
/*
 * 图现在是「宽度 + 1:1 自动高度」，所以这里只给宽度，不要再给 height。
 *
 * align-self: flex-start 不能省 —— .pcard--list 是 flex 行，默认 align-items:stretch，
 * 会把缩略图在**纵轴**上拉满整张卡的高度，正方形就没了（实测高度被拉到 ~150px）。
 * 正文（.pcard__body）要继续保持 stretch，它靠这个撑满高度、再让价格贴底，
 * 所以只能用 align-self 单独管住图，不能改卡片上的 align-items。
 */
.pcard--list .pcard__img {
  width: 160rpx;
  align-self: flex-start;
}

.pcard__name {
  display: block;
  font-weight: $font-weight-medium;
  color: $color-text-primary;
}

.pcard__sub {
  display: block;
  margin-top: 2px;
  font-size: $font-size-xs;
  color: $color-text-muted;
}

.pcard__meta {
  display: flex;
  align-items: center;
  gap: $space-2;
  margin-top: 4px;
}

.pcard__sales {
  font-size: $font-size-xs;
  color: $color-text-muted;
}

.pcard__stock {
  font-size: 20rpx;
  padding: 0 6rpx;
  border-radius: $radius-xs;
  line-height: 1.6;
}

.pcard__stock--low {
  color: $color-danger;
  background-color: $color-danger-soft;
}

.pcard__stock--out {
  color: $color-text-muted;
  background-color: $color-surface-sunken;
}

.pcard__foot {
  display: flex;
  align-items: baseline;
  gap: 2px;
  margin-top: $space-2;
}

.pcard__unit {
  font-size: $font-size-xs;
  color: $color-text-muted;
}

/**
 * 快捷加购：网格卡右下角的小圆钮
 *
 * 56rpx（28px）达不到 44px 的建议触控尺寸，这是**有意的**：
 * 它是叠在整张可点卡片上的次级入口，主路径是点进详情再选数量。
 * 真要放大到 88rpx 会把价格挤没，得不偿失。
 * 热区靠 ProductImage 的 overflow + 卡片 padding 一起保证不误触进详情。
 */
.pcard__add {
  margin-left: auto;
  align-self: center;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56rpx;
  height: 56rpx;
  border-radius: $radius-pill;
  background-color: $color-action;
}
</style>
