import { Profile, UserAccount, UserLevel } from '@prisma/client';
import { RegistrationNumberType } from '../dto/create-user.dto';

export class UserFieldCalculator {
  static calculateDerivedFields(
    profile: Profile,
    level: UserLevel,
    updateData: any
  ): Partial<UserAccount> {
    const derived: any = {};

    this.setRegistrationNumberType(derived, profile, updateData);
    this.setLevelFlags(derived, level);
    this.setProfileFlags(derived, profile, updateData);
    this.applyConsistencyRules(derived, profile, level);

    return derived;
  }

  private static setRegistrationNumberType(
    derived: any,
    profile: Profile,
    updateData: any
  ): void {
    if (updateData.registrationNumber && !updateData.registrationNumberType) {
      derived.registrationNumberType = profile === Profile.Listener
        ? RegistrationNumberType.CPF
        : RegistrationNumberType.MATRICULA;
    }
  }

  private static setLevelFlags(derived: any, level: UserLevel): void {
    switch (level) {
      case UserLevel.Superadmin:
        derived.isSuperadmin = true;
        derived.isAdmin = true;
        break;
      case UserLevel.Admin:
        derived.isSuperadmin = false;
        derived.isAdmin = true;
        break;
      case UserLevel.Default:
        derived.isSuperadmin = false;
        derived.isAdmin = false;
        break;
    }
  }

  private static setProfileFlags(
    derived: any,
    profile: Profile,
    updateData: any,
  ): void {
    switch (profile) {
      case Profile.Professor:
        if (!updateData.hasOwnProperty('isTeacherActive')) {
          derived.isTeacherActive = true;
        }
        if (!updateData.hasOwnProperty('isPresenterActive')) {
          derived.isPresenterActive = false;
        }
        break;
      case Profile.Presenter:
        if (!updateData.hasOwnProperty('isPresenterActive')) {
          derived.isPresenterActive = true;
        }
        if (!updateData.hasOwnProperty('isTeacherActive')) {
          derived.isTeacherActive = false;
        }
        break;
      case Profile.Listener:
        if (!updateData.hasOwnProperty('isTeacherActive')) {
          derived.isTeacherActive = false;
        }
        if (!updateData.hasOwnProperty('isPresenterActive')) {
          derived.isPresenterActive = false;
        }
        break;
    }
  }

  private static applyConsistencyRules(
    derived: any,
    profile: Profile,
    level: UserLevel
  ): void {
    if (level === UserLevel.Superadmin) {
      derived.isSuperadmin = true;
      derived.isAdmin = true;
      if (profile === Profile.Professor) {
        derived.isTeacherActive = true;
      }
    }

    if (level === UserLevel.Admin) {
      derived.isAdmin = true;
      derived.isSuperadmin = false;
    }

    if (level === UserLevel.Default) {
      derived.isAdmin = false;
      derived.isSuperadmin = false;
    }

    if (profile === Profile.Professor) {
      derived.isTeacherActive = true;
      derived.isPresenterActive = false;
    }

    if (profile === Profile.Presenter) {
      derived.isPresenterActive = true;
      derived.isTeacherActive = false;
    }

    if (profile === Profile.Listener) {
      if (!derived.hasOwnProperty('isAdmin')) {
        derived.isAdmin = false;
      }
      if (!derived.hasOwnProperty('isSuperadmin')) {
        derived.isSuperadmin = false;
      }
      derived.isTeacherActive = false;
      derived.isPresenterActive = false;
    }
  }
}
