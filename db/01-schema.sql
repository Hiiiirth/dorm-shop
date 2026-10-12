-- =============================================================
-- 宿舍线上小超市 · 数据库 DDL  v1.3
-- MySQL 8.0 / utf8mb4 / InnoDB
--
-- 注意：
--   1. `order` 是 MySQL 保留字，所有引用必须加反引号
--   2. 金额 DB 用 DECIMAL(10,2) 存「元」，接口对外传「分」整数
--   3. v1.1 移除 building 字段（单宿舍楼），移除 COMPLETED 状态
--   4. v1.2 **移除整个派单体系**：删 dispatch_record 表、删 DISPATCHER 身份、
--      删 order.dispatcher_id / order.dispatched_at。
--      业务改为「顾客下单 → 管理端看单并确认送达」，不再有独立派单端。
--   5. v1.3 商品封面图与用户头像改为**客户端压缩后的 base64 data URL 直接落库**：
--      user.avatar 与 product.cover_image 由 VARCHAR(255) 升到 MEDIUMTEXT。
--
-- 执行： mysql -u root -p < 01-schema.sql
-- =============================================================

CREATE DATABASE IF NOT EXISTS `dorm_shop`
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_0900_ai_ci;

USE `dorm_shop`;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- v1.2 起不再创建 dispatch_record（派单端已下线）。
-- 这一行保留是为了让**已有的 v1.1 库**在重跑本脚本时把旧表清掉。
DROP TABLE IF EXISTS `dispatch_record`;
DROP TABLE IF EXISTS `cart`;
DROP TABLE IF EXISTS `order_status_log`;
DROP TABLE IF EXISTS `order_item`;
DROP TABLE IF EXISTS `order`;
DROP TABLE IF EXISTS `product`;
DROP TABLE IF EXISTS `category`;
DROP TABLE IF EXISTS `user_address`;
DROP TABLE IF EXISTS `user`;

SET FOREIGN_KEY_CHECKS = 1;

-- -------------------------------------------------------------
-- 1. 用户表
--    roles        : JSON 数组，账号拥有的全部身份，可叠加
--                   取值 "CUSTOMER" | "ADMIN"（v1.2 起不再有 DISPATCHER）
--    current_role : 当前生效身份，决定进入哪个工作台
-- -------------------------------------------------------------
CREATE TABLE `user` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '用户ID',
  `openid`        VARCHAR(64)     DEFAULT NULL COMMENT '微信 openid',
  `unionid`       VARCHAR(64)     DEFAULT NULL COMMENT '微信 unionid',
  `username`      VARCHAR(32)     DEFAULT NULL COMMENT '登录用户名（可选）',
  `password_hash` VARCHAR(100)    DEFAULT NULL COMMENT '密码 bcrypt 哈希',
  `nickname`      VARCHAR(64)     NOT NULL DEFAULT '' COMMENT '昵称',
  -- v1.3：头像改为**客户端压缩后的 base64 data URL 直接落库**，不再是外链 URL。
  --      用 MEDIUMTEXT（16MB）而不是 TEXT：TEXT 只有 64KB，而 800px/质量0.8 的
  --      JPEG 转 base64 后约 80~160KB，TEXT 会直接截断。
  --      也不用 LONGTEXT：4GB 上限毫无必要，只会让 max_allowed_packet 更容易被撑爆。
  --      MySQL 里 **TEXT 系列不是 BLOB 语义**（有字符集、走 utf8mb4），
  --      与 VARCHAR 的读写行为一致，前端 <image> 也能直接吃这个串。
  --      NULLABLE 是必须的：MySQL 不允许 TEXT 列有 DEFAULT 值，
  --      若同时 NOT NULL，任何不显式带 avatar 的 INSERT 都会 1364 报错
  --      （种子脚本就是这么挂的）。「没头像」= NULL，应用层统一转空串。
  `avatar`        MEDIUMTEXT      NULL COMMENT '头像（base64 data URL 或外链 URL，NULL = 没设）',
  `phone`         VARCHAR(20)     DEFAULT NULL COMMENT '手机号',
  `gender`        TINYINT         NOT NULL DEFAULT 0 COMMENT '0未知 1男 2女',
  `roles`         JSON            NOT NULL COMMENT '身份集合，如 ["CUSTOMER","ADMIN"]',
  `current_role`  VARCHAR(16)     NOT NULL DEFAULT 'CUSTOMER' COMMENT '当前身份 CUSTOMER/ADMIN',
  `status`        TINYINT         NOT NULL DEFAULT 1 COMMENT '0禁用 1正常',
  `default_room`  VARCHAR(32)     NOT NULL DEFAULT '' COMMENT '默认宿舍门牌号，如 305',
  `last_login_at` DATETIME        DEFAULT NULL COMMENT '最后登录时间',
  `created_at`    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at`    DATETIME        DEFAULT NULL COMMENT '软删除时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_openid` (`openid`),
  UNIQUE KEY `uk_phone`  (`phone`),
  KEY `idx_role_status` (`current_role`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户表';

-- -------------------------------------------------------------
-- 2. 收货地址表（单宿舍楼，只存门牌号）
-- -------------------------------------------------------------
CREATE TABLE `user_address` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`       BIGINT UNSIGNED NOT NULL COMMENT '所属用户',
  `contact_name`  VARCHAR(32)     NOT NULL DEFAULT '' COMMENT '收件人',
  `contact_phone` VARCHAR(20)     NOT NULL DEFAULT '' COMMENT '联系电话',
  `room_no`       VARCHAR(32)     NOT NULL COMMENT '宿舍门牌号',
  `is_default`    TINYINT         NOT NULL DEFAULT 0 COMMENT '1默认',
  `created_at`    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at`    DATETIME        DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_user_default` (`user_id`, `is_default`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='收货地址表';

-- -------------------------------------------------------------
-- 3. 商品分类表（parent_id=0 为一级分类）
-- -------------------------------------------------------------
CREATE TABLE `category` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `parent_id`  BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '父分类，0=一级',
  `name`       VARCHAR(32)     NOT NULL COMMENT '分类名',
  `icon`       VARCHAR(255)    NOT NULL DEFAULT '' COMMENT '分类图标',
  `sort_order` INT             NOT NULL DEFAULT 0 COMMENT '排序，越小越靠前',
  `status`     TINYINT         NOT NULL DEFAULT 1 COMMENT '1启用 0停用',
  `created_at` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` DATETIME        DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_parent_sort` (`parent_id`, `sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='商品分类表';

-- -------------------------------------------------------------
-- 4. 商品表
-- -------------------------------------------------------------
CREATE TABLE `product` (
  `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `category_id`    BIGINT UNSIGNED NOT NULL COMMENT '所属分类',
  `name`           VARCHAR(64)     NOT NULL COMMENT '商品名',
  `subtitle`       VARCHAR(128)    NOT NULL DEFAULT '' COMMENT '副标题/卖点',
  `description`    TEXT            NULL COMMENT '详情描述',
  -- v1.3：同 user.avatar —— 店长上传的封面图存 base64 data URL，字段升 MEDIUMTEXT。
  --      注意 MySQL 对 TEXT 列**不允许有 DEFAULT 值**，所以这里去掉了 `DEFAULT ''`，
  --      「空 = 没配图」由应用层用空串/null 表达（DTO 与会话层都按 falsy 判断）。
  `cover_image`    MEDIUMTEXT      NULL COMMENT '封面图（base64 data URL 或外链 URL，NULL/空 = 没配图，走字标占位）',
  `images`         JSON            NULL COMMENT '轮播图 URL 数组',
  `price`          DECIMAL(10,2)   NOT NULL DEFAULT 0.00 COMMENT '售价（元）',
  `original_price` DECIMAL(10,2)   DEFAULT NULL COMMENT '划线原价',
  `stock`          INT             NOT NULL DEFAULT 0 COMMENT '库存',
  `unit`           VARCHAR(16)     NOT NULL DEFAULT '件' COMMENT '单位',
  `sales_count`    INT             NOT NULL DEFAULT 0 COMMENT '累计销量',
  `status`         TINYINT         NOT NULL DEFAULT 1 COMMENT '1上架 0下架',
  `sort_order`     INT             NOT NULL DEFAULT 0,
  `created_at`     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at`     DATETIME        DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_category_status` (`category_id`, `status`, `sort_order`),
  KEY `idx_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='商品表';

-- -------------------------------------------------------------
-- 5. 订单主表
--    status: PENDING 待接单 / DELIVERING 配送中
--            DELIVERED 已送达（终态） / CANCELLED 已取消（终态）
--
--    v1.2：移除 DISPATCHED 与 dispatcher_id / dispatched_at。
--    现在的流程是「顾客下单 → 管理端看单 → 管理端确认送达」，
--    中间不再有派单员这一环，所以订单上不需要记「派给了谁」。
-- -------------------------------------------------------------
CREATE TABLE `order` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `order_no`      VARCHAR(32)     NOT NULL COMMENT '业务订单号，如 SO202610071930001234',
  `user_id`       BIGINT UNSIGNED NOT NULL COMMENT '下单用户',
  `status`        VARCHAR(24)     NOT NULL DEFAULT 'PENDING' COMMENT '订单状态',
  `total_amount`  DECIMAL(10,2)   NOT NULL DEFAULT 0.00 COMMENT '订单总额（元）',
  `item_count`    INT             NOT NULL DEFAULT 0 COMMENT '商品件数',
  `room_no`       VARCHAR(32)     NOT NULL DEFAULT '' COMMENT '宿舍门牌号',
  `contact_name`  VARCHAR(32)     NOT NULL DEFAULT '' COMMENT '收件人',
  `contact_phone` VARCHAR(20)     NOT NULL DEFAULT '' COMMENT '联系电话',
  `remark`        VARCHAR(255)    NOT NULL DEFAULT '' COMMENT '备注',
  `pay_status`    TINYINT         NOT NULL DEFAULT 0 COMMENT '0未支付 1已支付 2货到付款',
  `pay_type`      TINYINT         NOT NULL DEFAULT 0 COMMENT '0未定 1微信支付 2线下结算',
  `delivered_at`  DATETIME        DEFAULT NULL COMMENT '送达时间',
  `cancelled_at`  DATETIME        DEFAULT NULL COMMENT '取消时间',
  `cancel_reason` VARCHAR(255)    DEFAULT NULL COMMENT '取消原因',
  `created_at`    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at`    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at`    DATETIME        DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_order_no` (`order_no`),
  KEY `idx_user_time`   (`user_id`, `created_at`),
  KEY `idx_status_time` (`status`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='订单主表';

-- -------------------------------------------------------------
-- 6. 订单明细表（含商品快照）
-- -------------------------------------------------------------
CREATE TABLE `order_item` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `order_id`      BIGINT UNSIGNED NOT NULL,
  `product_id`    BIGINT UNSIGNED NOT NULL,
  `product_name`  VARCHAR(64)     NOT NULL COMMENT '下单时商品名快照',
  -- v1.3：封面快照必须跟着 product.cover_image 一起升 MEDIUMTEXT。
  --      还是 varchar(255) 的话，带图商品一下单就会 1406 Data too long，
  --      而且炸在事务中间，表现是「下单接口莫名报错」。
  `product_cover` MEDIUMTEXT      NULL COMMENT '下单时封面快照（base64 data URL 或外链 URL）',
  `unit_price`    DECIMAL(10,2)   NOT NULL COMMENT '下单时单价快照',
  `quantity`      INT             NOT NULL DEFAULT 1,
  `subtotal`      DECIMAL(10,2)   NOT NULL COMMENT '小计 = unit_price × quantity',
  `created_at`    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_order`   (`order_id`),
  KEY `idx_product` (`product_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='订单明细表';

-- -------------------------------------------------------------
-- 7. 订单状态流转日志（审计追溯）
-- -------------------------------------------------------------
CREATE TABLE `order_status_log` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `order_id`      BIGINT UNSIGNED NOT NULL,
  `from_status`   VARCHAR(24)     NOT NULL DEFAULT '' COMMENT '原状态，首条为空',
  `to_status`     VARCHAR(24)     NOT NULL COMMENT '新状态',
  `operator_id`   BIGINT UNSIGNED DEFAULT NULL COMMENT '操作人，系统自动为空',
  `operator_role` VARCHAR(16)     DEFAULT NULL COMMENT '操作人身份',
  `remark`        VARCHAR(255)    NOT NULL DEFAULT '' COMMENT '操作说明',
  `created_at`    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_order_time` (`order_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='订单状态流转日志';

-- -------------------------------------------------------------
-- 8. 购物车表
-- -------------------------------------------------------------
CREATE TABLE `cart` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`    BIGINT UNSIGNED NOT NULL,
  `product_id` BIGINT UNSIGNED NOT NULL,
  `quantity`   INT             NOT NULL DEFAULT 1,
  `selected`   TINYINT         NOT NULL DEFAULT 1 COMMENT '1勾选',
  `created_at` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_product` (`user_id`, `product_id`),
  KEY `idx_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='购物车表';

-- =============================================================
-- 完成：8 张表
-- 校验： SHOW TABLES;
-- =============================================================
