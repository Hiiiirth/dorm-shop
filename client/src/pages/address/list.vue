<template>
  <view class="page-root alist">
    <NavBar title="收货地址" :back="true" border />

    <view class="page-body alist__body">
      <!-- 首屏骨架 -->
      <template v-if="loading && !loaded">
        <view v-for="i in 2" :key="`s${i}`" class="surface card">
          <view class="sk sk--line" style="width: 40%" />
          <view class="sk sk--line" style="width: 70%; margin-top: 12px" />
          <view class="sk sk--line" style="width: 55%; margin-top: 8px" />
        </view>
      </template>

      <EmptyState
        v-else-if="loadError"
        variant="error"
        desc="地址没拿到"
        action-text="重新加载"
        @action="load"
      />

      <EmptyState
        v-else-if="!addresses.length"
        variant="empty"
        icon="address-book"
        title="还没有收货地址"
        desc="加一个地址，下单时就能一键带出"
        action-text="新增地址"
        @action="goAdd"
      />

      <template v-else>
        <view v-for="a in addresses" :key="a.id" class="surface card">
          <!-- 头部：默认标记 + 操作 -->
          <view class="card__head">
            <view v-if="a.isDefault" class="badge">
              <AppIcon name="default-on" :size="11" color="#C7450A" />
              <text class="badge__text">默认</text>
            </view>
            <view v-else class="badge badge--ghost">
              <text class="badge__text badge__text--ghost">普通地址</text>
            </view>

            <view class="card__acts">
              <view class="act icon-line" @tap="setDefault(a)">
                <AppIcon
                  :name="a.isDefault ? 'default-on' : 'default-off'"
                  :size="14"
                  :color="a.isDefault ? '#C7450A' : '#68707E'"
                />
                <text class="act__text">{{ a.isDefault ? '已是默认' : '设为默认' }}</text>
              </view>
              <view class="act icon-line" @tap="goEdit(a.id)">
                <AppIcon name="edit-field" :size="14" color="#68707E" />
                <text class="act__text">编辑</text>
              </view>
              <view class="act act--danger icon-line" @tap="askRemove(a)">
                <AppIcon name="delete" :size="14" color="#D93A3F" />
                <text class="act__text act__text--danger">删除</text>
              </view>
            </view>
          </view>

          <!-- 地址本体 -->
          <view class="addr">
            <text class="addr__room">{{ a.roomNo }}</text>
            <text class="addr__contact">{{ a.contactName }} · {{ a.contactPhone }}</text>
          </view>
        </view>

        <view class="alist__tip icon-lead">
          <view class="icon-lead__icon">
            <AppIcon name="alert" :size="13" color="#68707E" />
          </view>
          <text class="alist__tip-text">
            默认地址只能有一个。设为默认后，下单页会自动带出它。
          </text>
        </view>
      </template>

      <view class="alist__pad" />
    </view>

    <!-- 底部新增按钮 -->
    <view class="abar">
      <AppButton type="primary" size="md" block icon="address-add" text="新增地址" @tap="goAdd" />
    </view>

    <!-- 删除确认 -->
    <ConfirmSheet
      v-model="removeSheet.show"
      title="删除这个地址？"
      :desc="removeSheet.desc"
      confirm-text="删除"
      :loading="removeSheet.loading"
      @confirm="doRemove"
    />
  </view>
</template>

<script setup>
/**
 * 收货地址列表
 *
 * 后端地址接口返回**原始实体**（没有 VO），字段：
 *   { id, userId, contactName, contactPhone, roomNo, isDefault(0|1), createdAt, updatedAt }
 *
 * 「设为默认」后端会自动把其它地址的 isDefault 清 0（在 user.service 里），
 * 所以前端**改完必须重新拉一次列表** —— 否则界面上会出现两个「默认」。
 *
 * 删除用的是软删除（后端 softDelete），删完同样要重拉。
 */
import { reactive, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import NavBar from '../../components/NavBar.vue';
import AppIcon from '../../components/AppIcon.vue';
import AppButton from '../../components/AppButton.vue';
import EmptyState from '../../components/EmptyState.vue';
import ConfirmSheet from '../../components/ConfirmSheet.vue';
import { userApi } from '../../api/user';
import { toErrorMessage } from '../../utils/money';

const addresses = ref([]);
const loading = ref(false);
const loaded = ref(false);
const loadError = ref('');

async function load() {
  loading.value = true;
  loadError.value = '';
  try {
    const list = await userApi.listAddresses();
    addresses.value = Array.isArray(list) ? list : [];
    loaded.value = true;
  } catch (err) {
    loadError.value = toErrorMessage(err, '地址加载失败');
  } finally {
    loading.value = false;
  }
}

async function setDefault(a) {
  if (a.isDefault) {
    uni.showToast({ title: '它已经是默认地址了', icon: 'none' });
    return;
  }
  try {
    // 必须传 0 / 1，不能传布尔（后端 @IsIn([0,1])）
    await userApi.updateAddress(a.id, { isDefault: 1 });
    uni.showToast({ title: '已设为默认', icon: 'none' });
    await load(); // 重拉：让「旧默认」的标记掉下来
  } catch (err) {
    uni.showToast({ title: toErrorMessage(err, '设置失败'), icon: 'none' });
  }
}

// ------------------------------------------------------------------- 删除
const removeSheet = reactive({ show: false, loading: false, id: 0, desc: '' });

function askRemove(a) {
  removeSheet.show = true;
  removeSheet.loading = false;
  removeSheet.id = a.id;
  removeSheet.desc = `${a.roomNo} · ${a.contactName}`;
}

async function doRemove() {
  removeSheet.loading = true;
  try {
    await userApi.removeAddress(removeSheet.id);
    removeSheet.show = false;
    uni.showToast({ title: '已删除', icon: 'none' });
    await load();
  } catch (err) {
    uni.showToast({ title: toErrorMessage(err, '删除失败'), icon: 'none' });
  } finally {
    removeSheet.loading = false;
  }
}

// ------------------------------------------------------------------- 导航
function goAdd() {
  uni.navigateTo({ url: '/pages/address/edit' });
}

function goEdit(id) {
  uni.navigateTo({ url: `/pages/address/edit?id=${id}` });
}

onShow(() => {
  // 从编辑页返回要能立刻看到变化，所以每次都拉
  load();
});
</script>

<style lang="scss" scoped>
.alist {
  background-color: $color-bg-app;
}

.alist__body {
  padding: $space-3 $space-4;
}

.card {
  padding: $space-4;
  margin-bottom: $space-3;
}

.card + .card {
  margin-top: 0;
}

.card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: $space-2;
  margin-bottom: $space-3;
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 8px;
  border-radius: $radius-pill;
  background-color: $color-action-soft;
}

.badge--ghost {
  background-color: $color-surface-sunken;
}

.badge__text {
  font-size: $font-size-xs;
  font-weight: $font-weight-medium;
  color: $color-action;
}

.badge__text--ghost {
  color: $color-text-muted;
  font-weight: $font-weight-regular;
}

.card__acts {
  display: flex;
  align-items: center;
  gap: $space-3;
}

.act {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 4px 2px;
}

.act__text {
  font-size: $font-size-xs;
  color: $color-text-secondary;
}

.act__text--danger {
  color: $color-danger;
}

.addr {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.addr__room {
  font-size: $font-size-md;
  font-weight: $font-weight-medium;
  color: $color-text-primary;
}

.addr__contact {
  font-size: $font-size-sm;
  color: $color-text-secondary;
}

.alist__tip {
  display: flex;
  align-items: flex-start;
  /* `.icon-lead__icon` 用 1.6em 算壳高，em 相对**本容器**字号 → 必须显式给 */
  font-size: $font-size-xs;
  gap: 5px;
  padding: 0 $space-2;
}

.alist__tip-text {
  flex: 1;
  min-width: 0;
  font-size: $font-size-xs;
  /* 必须与全局 `.icon-lead` 的 `--icon-lead-lh` 一致 */
  line-height: $line-height-normal;
  color: $color-text-muted;
}

/* ============================================================== 底部按钮栏 */
.alist__pad {
  /** 占位 = 固定栏真实高度（含安全区），否则刘海屏上底栏会盖住最后一个地址卡 */
  height: calc(80px + env(safe-area-inset-bottom));
}

.abar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  padding: $space-3 $space-4 calc(#{$space-3} + env(safe-area-inset-bottom));
  background-color: $color-surface;
  border-top: 1px solid $color-border-subtle;
  z-index: 500;
}

/* ====================================================================== 骨架 */
.sk {
  background-color: $color-surface-sunken;
  border-radius: $radius-xs;
  animation: sk-fade 1.2s ease-in-out infinite;
}

.sk--line {
  height: 14px;
}

@keyframes sk-fade {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.55;
  }
}
</style>
