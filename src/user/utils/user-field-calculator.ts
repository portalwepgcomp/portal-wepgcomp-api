import { Profile, UserAccount, UserLevel } from '@prisma/client';
import { RegistrationNumberType } from '../dto/create-user.dto';

export class UserFieldCalculator {
  static calculateDerivedFields(
    profile: Profile,
    level: UserLevel,
    updateData: any,
  ): Partial<UserAccount> {
    const derived: any = {};

    this.setRegistrationNumberType(derived, profile, updateData);
    this.setProfileFlags(derived, profile, updateData);
    this.applyConsistencyRules(derived, profile);

    return derived;
  }

  private static setRegistrationNumberType(
    derived: any,
    profile: Profile,
    updateData: any,
  ): void {
    if (updateData.registrationNumber && !updateData.registrationNumberType) {
      derived.registrationNumberType =
        profile === Profile.Listener
          ? RegistrationNumberType.CPF
          : RegistrationNumberType.MATRICULA;
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

  private static applyConsistencyRules(derived: any, profile: Profile): void {
    if (profile === Profile.Professor) {
      derived.isTeacherActive = true;
      derived.isPresenterActive = false;
    }

    if (profile === Profile.Presenter) {
      derived.isPresenterActive = true;
      derived.isTeacherActive = false;
    }

    if (profile === Profile.Listener) {
      derived.isTeacherActive = false;
      derived.isPresenterActive = false;
    }
  }
}
