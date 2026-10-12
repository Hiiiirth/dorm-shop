import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { User, UserAddress } from '../../entities';
import { BusinessException } from '../../common/exceptions/business.exception';
import { ErrorCode } from '../../common/constants/error-code';
import { UserRole } from '../../common/constants/enums';
import { toUserVo, UserVo } from './user.vo';
import { CreateAddressDto, UpdateAddressDto, UpdateProfileDto } from './dto/user.dto';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(UserAddress) private readonly addressRepo: Repository<UserAddress>,
  ) {}

  // ---------------------------------------------------------------
  // 资料
  // ---------------------------------------------------------------
  async getMe(userId: number): Promise<UserVo> {
    return toUserVo(await this.mustFindUser(userId));
  }

  async updateProfile(userId: number, dto: UpdateProfileDto): Promise<UserVo> {
    const user = await this.mustFindUser(userId);

    if (dto.nickname !== undefined) user.nickname = dto.nickname;
    if (dto.avatar !== undefined) user.avatar = dto.avatar;
    if (dto.gender !== undefined) user.gender = dto.gender;
    if (dto.defaultRoom !== undefined) user.defaultRoom = dto.defaultRoom;

    if (dto.phone !== undefined && dto.phone !== user.phone) {
      const exists = await this.userRepo.findOne({ where: { phone: dto.phone } });
      if (exists && exists.id !== user.id) {
        throw new BusinessException(ErrorCode.PHONE_ALREADY_EXIST);
      }
      user.phone = dto.phone;
    }

    return toUserVo(await this.userRepo.save(user));
  }

  // ---------------------------------------------------------------
  // 收货地址
  // ---------------------------------------------------------------
  async listAddresses(userId: number): Promise<UserAddress[]> {
    return this.addressRepo.find({
      where: { userId },
      order: { isDefault: 'DESC', id: 'DESC' },
    });
  }

  async createAddress(userId: number, dto: CreateAddressDto): Promise<UserAddress> {
    const isDefault = dto.isDefault ?? 0;
    if (isDefault === 1) {
      await this.clearDefault(userId);
    }

    const address = this.addressRepo.create({
      userId,
      contactName: dto.contactName,
      contactPhone: dto.contactPhone,
      roomNo: dto.roomNo,
      isDefault,
    });
    return this.addressRepo.save(address);
  }

  async updateAddress(
    userId: number,
    addressId: number,
    dto: UpdateAddressDto,
  ): Promise<UserAddress> {
    const address = await this.mustFindAddress(userId, addressId);

    if (dto.contactName !== undefined) address.contactName = dto.contactName;
    if (dto.contactPhone !== undefined) address.contactPhone = dto.contactPhone;
    if (dto.roomNo !== undefined) address.roomNo = dto.roomNo;

    if (dto.isDefault === 1) {
      await this.clearDefault(userId);
      address.isDefault = 1;
    } else if (dto.isDefault === 0) {
      address.isDefault = 0;
    }

    return this.addressRepo.save(address);
  }

  async deleteAddress(userId: number, addressId: number): Promise<{ success: boolean }> {
    await this.mustFindAddress(userId, addressId);
    await this.addressRepo.softDelete(addressId);
    return { success: true };
  }

  // ---------------------------------------------------------------
  // 内部工具
  // ---------------------------------------------------------------
  private async mustFindUser(userId: number): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new BusinessException(ErrorCode.USER_NOT_FOUND);
    return user;
  }

  private async mustFindAddress(userId: number, addressId: number): Promise<UserAddress> {
    const address = await this.addressRepo.findOne({ where: { id: addressId } });
    // 越权与不存在的返回同一个错误，避免通过报错探测他人数据
    if (!address || address.userId !== userId) {
      throw new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, '地址不存在');
    }
    return address;
  }

  private async clearDefault(userId: number): Promise<void> {
    await this.addressRepo.update({ userId, isDefault: 1 }, { isDefault: 0 });
  }
}
