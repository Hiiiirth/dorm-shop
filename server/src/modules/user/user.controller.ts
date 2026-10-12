import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { IntParamPipe } from '../../common/pipes/int-param.pipe';
import { CreateAddressDto, UpdateAddressDto, UpdateProfileDto } from './dto/user.dto';
import { UserService } from './user.service';

@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('me')
  getMe(@CurrentUser('userId') userId: number) {
    return this.userService.getMe(userId);
  }

  @Put('me')
  updateProfile(@CurrentUser('userId') userId: number, @Body() dto: UpdateProfileDto) {
    return this.userService.updateProfile(userId, dto);
  }

  @Get('me/addresses')
  listAddresses(@CurrentUser('userId') userId: number) {
    return this.userService.listAddresses(userId);
  }

  @Post('me/addresses')
  createAddress(@CurrentUser('userId') userId: number, @Body() dto: CreateAddressDto) {
    return this.userService.createAddress(userId, dto);
  }

  @Put('me/addresses/:id')
  updateAddress(
    @CurrentUser('userId') userId: number,
    @Param('id', IntParamPipe) id: number,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.userService.updateAddress(userId, id, dto);
  }

  @Delete('me/addresses/:id')
  deleteAddress(
    @CurrentUser('userId') userId: number,
    @Param('id', IntParamPipe) id: number,
  ) {
    return this.userService.deleteAddress(userId, id);
  }
}
