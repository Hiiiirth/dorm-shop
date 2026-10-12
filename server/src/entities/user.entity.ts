import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Gender, UserRole } from '../common/constants/enums';

/**
 * 用户表
 * 一个账号可持有多个身份（roles），current_role 决定当前进入哪个工作台。
 */
@Entity('user')
@Index('idx_role_status', ['currentRole', 'status'])
export class User extends BaseEntity {
  @Column({ type: 'varchar', length: 64, nullable: true, unique: true })
  openid: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  unionid: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true, unique: true })
  username: string | null;

  /** select: false —— 默认查询不带出密码，需要时用 addSelect 显式取 */
  @Column({
    name: 'password_hash',
    type: 'varchar',
    length: 100,
    nullable: true,
    select: false,
  })
  passwordHash: string | null;

  @Column({ type: 'varchar', length: 64, default: '' })
  nickname: string;

  /**
   * 头像
   *
   * v1.3 起改为**客户端压缩后的 base64 data URL 直接落库**
   * （`data:image/jpeg;base64,/9j/4AAQ...`），不再是外链 URL。
   * 所以类型从 varchar(255) 升到 **mediumtext**：800px/质量0.8 的 JPEG
   * 转 base64 后约 80~160KB，varchar(255) 与 text(64KB) 都装不下。
   * 旧数据里的外链 URL 仍然能正常显示（`<image src>` 两种都吃）。
   */
  @Column({ type: 'mediumtext', nullable: true })
  avatar: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true, unique: true })
  phone: string | null;

  @Column({ type: 'tinyint', default: Gender.UNKNOWN })
  gender: number;

  /** 拥有的全部身份，如 ["CUSTOMER","ADMIN"] */
  @Column({ type: 'json' })
  roles: UserRole[];

  /** 当前生效身份，决定小程序展示哪个工作台 */
  @Column({ name: 'current_role', type: 'varchar', length: 16, default: UserRole.CUSTOMER })
  currentRole: UserRole;

  /** 0 禁用 1 正常 */
  @Column({ type: 'tinyint', default: 1 })
  status: number;

  @Column({ name: 'default_room', type: 'varchar', length: 32, default: '' })
  defaultRoom: string;

  @Column({ name: 'last_login_at', type: 'datetime', nullable: true })
  lastLoginAt: Date | null;
}
