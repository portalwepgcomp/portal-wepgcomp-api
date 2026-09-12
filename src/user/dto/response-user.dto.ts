import { Profile, UserAccount, UserLevel } from '@prisma/client';
import { RegistrationNumberType } from './create-user.dto';

export class ResponseUserDto {
  id: string;
  name: string;
  email: string;
  registrationNumber?: string;
  registrationNumberType?: RegistrationNumberType;
  linkLattes?: string;
  photoFilePath?: string;
  profile: Profile;
  level: UserLevel;
  isActive: boolean;
  isTeacherActive: boolean;
  isPresenterActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  isVerified: boolean;
  hasSubmission: boolean;

  constructor(user: UserAccount, hasSubmission = false) {
    this.id = user.id;
    this.name = user.name;
    this.email = user.email;
    this.registrationNumber = user.registrationNumber ?? undefined;
    this.registrationNumberType =
      (user.registrationNumberType as RegistrationNumberType) ?? undefined;
    this.linkLattes = user.linkLattes ?? undefined;
    this.photoFilePath = user.photoFilePath ?? undefined;
    this.profile = user.profile;
    this.level = user.level;
    this.isActive = user.isActive;
    this.isTeacherActive = user.isTeacherActive ?? false;
    this.isPresenterActive = user.isPresenterActive ?? false;
    this.createdAt = user.createdAt;
    this.updatedAt = user.updatedAt;
    this.isVerified = user.isVerified;
    this.hasSubmission = hasSubmission;
  }
}
