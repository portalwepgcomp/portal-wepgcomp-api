import { Profile, UserAccount, UserLevel } from '@prisma/client';
import { RegistrationNumberType } from './create-user.dto';

export class ResponseUpdatedUserDto {
  id: string;
  name: string;
  email: string;
  registrationNumber?: string;
  registrationNumberType?: RegistrationNumberType;
  linkLattes?: string;
  photoFilePath?: string;
  profile: Profile;
  level: UserLevel;
  createdAt: Date;
  updatedAt: Date;
  isVerified: boolean;

  constructor(user: UserAccount) {
    this.id = user.id;
    this.name = user.name;
    this.email = user.email;
    this.registrationNumber = user.registrationNumber;
    this.registrationNumberType =
      user.registrationNumberType as RegistrationNumberType;
    this.linkLattes = user.linkLattes;
    this.photoFilePath = user.photoFilePath;
    this.profile = user.profile;
    this.level = user.level;
    this.createdAt = user.createdAt;
    this.updatedAt = user.updatedAt;
    this.isVerified = user.isVerified;
  }
}
